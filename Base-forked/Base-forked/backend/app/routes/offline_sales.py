import csv
import hashlib
import io
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, Body
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    InvoiceUpload,
    OfflineSale,
    OfflineSaleLine,
    Product,
    SaleAttachment,
    SalePayment,
    SaleReturn,
    StoredFile,
    AuditEvent,
    now,
)
from fastapi.security import HTTPAuthorizationCredentials
from ..security import DB, Owner, bearer, get_user_from_raw_token
from ..services.invoice_extraction import process_invoice_document
from ..services.offline_sales_service import (
    post_offline_sale,
    record_payment,
    record_return,
    void_sale,
)

router = APIRouter(prefix="/admin/sales", tags=["Offline Sales & Invoices"])

ALLOWED_INVOICE_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_INVOICE_BYTES = 15 * 1024 * 1024  # 15 MiB limit per Section 3


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ─── Upload & Extraction Pipeline ───────────────────────────────────────────

@router.post("/invoice-uploads")
async def upload_invoice(
    db: DB,
    user: Owner,
    file: UploadFile = File(...),
    history_only: bool = Form(False),
):
    """
    Step A & B: Upload invoice image/PDF.
    Validates file limits, saves file to disk, runs OCR/extraction pipeline.
    Does NOT change any stock balances.
    """
    fname = file.filename or "invoice"
    ext = "." + fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if ext not in ALLOWED_INVOICE_EXTS:
        raise HTTPException(415, f"Unsupported file type '{ext}'. Allowed: PDF, PNG, JPG, JPEG, WEBP.")

    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_INVOICE_BYTES:
        raise HTTPException(413, f"File exceeds 15 MiB limit ({len(raw_bytes) / 1024 / 1024:.2f} MiB).")

    file_hash = _sha256(raw_bytes)

    # Duplicate file check
    existing_file = db.query(StoredFile).filter(StoredFile.sha256 == file_hash).first()
    if existing_file:
        existing_upload = db.query(InvoiceUpload).filter(
            InvoiceUpload.file_id == existing_file.id,
            InvoiceUpload.status == "posted",
        ).first()
        if existing_upload:
            existing_sale = db.query(OfflineSale).filter(OfflineSale.upload_id == existing_upload.id).first()
            inv_str = f" as Invoice '{existing_sale.invoice_number}'" if existing_sale else ""
            raise HTTPException(409, f"This exact invoice file was already posted{inv_str}. Re-upload rejected to prevent double deduction.")

    # Save physical file to disk
    storage_subpath = f"invoices/{uuid.uuid4()}{ext}"
    full_path = Path(settings.upload_dir) / storage_subpath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(raw_bytes)

    # Create StoredFile metadata
    stored_file = StoredFile(
        original_name=fname,
        storage_key=storage_subpath,
        mime_type=file.content_type or "application/octet-stream",
        size=len(raw_bytes),
        sha256=file_hash,
        uploader_id=user.id,
    )
    db.add(stored_file)
    db.flush()

    # Process extraction
    try:
        extraction_res = process_invoice_document(raw_bytes, fname, stored_file.mime_type, db)
    except Exception as exc:
        extraction_res = {
            "status": "failed",
            "page_count": 1,
            "raw_text": "",
            "fields": {"invoice_number": "", "invoice_date": now().strftime("%Y-%m-%d"), "total": 0.0, "currency": "INR"},
            "lines": [],
            "warnings": [f"Extraction failed: {str(exc)}. Please enter line items manually."],
        }

    upload_rec = InvoiceUpload(
        file_id=stored_file.id,
        original_name=fname,
        storage_key=storage_subpath,
        file_hash=file_hash,
        mime_type=stored_file.mime_type,
        file_size=len(raw_bytes),
        page_count=extraction_res["page_count"],
        status=extraction_res["status"],
        raw_text=extraction_res["raw_text"],
        extracted_data=extraction_res,
        reviewed_data=extraction_res,
        warnings=extraction_res["warnings"],
        revision=1,
        history_only=history_only,
        actor_id=user.id,
    )
    db.add(upload_rec)
    db.commit()
    db.refresh(upload_rec)

    return {
        "id": upload_rec.id,
        "original_name": upload_rec.original_name,
        "status": upload_rec.status,
        "page_count": upload_rec.page_count,
        "warnings": upload_rec.warnings,
        "fields": extraction_res["fields"],
        "lines": extraction_res["lines"],
        "history_only": upload_rec.history_only,
        "file_url": f"/admin/sales/invoice-uploads/{upload_rec.id}/file",
    }


@router.get("/invoice-uploads")
def list_invoice_uploads(db: DB, _: Owner, status: Optional[str] = Query(None)):
    """Lists current uploads in processing or review queue."""
    q = db.query(InvoiceUpload).order_by(desc(InvoiceUpload.created_at))
    if status:
        q = q.filter(InvoiceUpload.status == status)
    else:
        # By default exclude posted to keep queue clean
        q = q.filter(InvoiceUpload.status.in_(["uploaded", "queued", "extracting", "needs_review", "ready"]))
    
    uploads = q.limit(50).all()
    return [
        {
            "id": u.id,
            "original_name": u.original_name,
            "status": u.status,
            "page_count": u.page_count,
            "warnings": u.warnings or [],
            "created_at": u.created_at.isoformat(),
            "history_only": u.history_only,
            "fields": (u.reviewed_data or {}).get("fields", {}),
        }
        for u in uploads
    ]


@router.get("/invoice-uploads/{upload_id}")
def get_invoice_upload(upload_id: str, db: DB, _: Owner):
    """Fetches full upload review draft with fields, lines, and warnings."""
    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Invoice upload not found.")
    
    data = upload.reviewed_data or upload.extracted_data or {}
    return {
        "id": upload.id,
        "original_name": upload.original_name,
        "status": upload.status,
        "revision": upload.revision,
        "warnings": upload.warnings or [],
        "fields": data.get("fields", {}),
        "lines": data.get("lines", []),
        "raw_text": upload.raw_text,
        "history_only": upload.history_only,
        "created_at": upload.created_at.isoformat(),
        "file_url": f"/admin/sales/invoice-uploads/{upload.id}/file",
    }


@router.post("/invoice-uploads/{upload_id}/re-extract")
def reextract_invoice_upload(upload_id: str, db: DB, user: Owner):
    """Re-runs extraction (e.g. Gemini Vision with model waterfall) on an existing uploaded invoice file."""
    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Invoice upload not found.")
    if upload.status == "posted":
        raise HTTPException(409, "Cannot re-extract an invoice that has already been posted.")

    file_path = os.path.join(settings.upload_dir, upload.storage_key)
    if not os.path.exists(file_path):
        raise HTTPException(404, "Uploaded invoice file not found on disk.")

    with open(file_path, "rb") as f:
        raw_bytes = f.read()

    extraction_res = process_invoice_document(raw_bytes, upload.original_name, upload.mime_type, db)
    upload.extracted_data = extraction_res
    upload.reviewed_data = extraction_res
    upload.raw_text = extraction_res.get("raw_text", "")
    upload.status = extraction_res.get("status", "ready")
    upload.warnings = extraction_res.get("warnings", [])
    upload.revision = (upload.revision or 1) + 1
    db.commit()
    db.refresh(upload)

    return {
        "id": upload.id,
        "original_name": upload.original_name,
        "status": upload.status,
        "revision": upload.revision,
        "warnings": upload.warnings,
        "fields": extraction_res["fields"],
        "lines": extraction_res["lines"],
        "history_only": upload.history_only,
        "file_url": f"/admin/sales/invoice-uploads/{upload.id}/file",
    }


@router.patch("/invoice-uploads/{upload_id}")
def update_invoice_upload(
    upload_id: str,
    db: DB,
    user: Owner,
    payload: dict[str, Any] = Body(...),
):
    """
    Step C — Review: Save admin edits, product mappings, and corrections.
    Re-validates stock availability and recalculates totals.
    """
    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Invoice upload not found.")
    if upload.status == "posted":
        raise HTTPException(409, "Cannot modify an invoice that has already been posted.")

    fields = payload.get("fields", {})
    lines = payload.get("lines", [])
    history_only = payload.get("history_only", upload.history_only)

    # Re-validate lines against products in DB
    warnings = []
    if not fields.get("invoice_number", "").strip():
        warnings.append("Missing invoice number.")

    # Re-check product existence and stock
    for idx, l in enumerate(lines, start=1):
        pid = l.get("product_id")
        if pid:
            l["is_non_stock"] = False
            prod = db.query(Product).filter(Product.id == pid).first()
            if prod:
                l["sku_snapshot"] = prod.sku
                l["name_snapshot"] = prod.name
                l["current_stock"] = prod.stock
                conv = Decimal(str(l.get("conversion_factor", 1.0) or 1.0))
                in_qty = int(l.get("input_quantity", 1) or 1)
                free_qty = int(l.get("free_quantity", 0) or 0)
                req_qty = int(l.get("base_quantity") or 0)
                if req_qty <= 0:
                    req_qty = int((in_qty + free_qty) * conv)
                    l["base_quantity"] = req_qty
                l["stock_available"] = prod.stock >= req_qty
                if req_qty > prod.stock and not history_only:
                    warnings.append(f"Line {idx} ({prod.name}): Stock shortage (Needs {req_qty}, has {prod.stock}).")
            else:
                warnings.append(f"Line {idx}: Selected product no longer exists.")
        elif not l.get("is_non_stock"):
            warnings.append(f"Line {idx}: Unmapped product.")

    upload.reviewed_data = {
        "fields": fields,
        "lines": lines,
        "history_only": history_only,
    }
    upload.warnings = warnings
    upload.status = "ready" if not warnings else "needs_review"
    upload.revision += 1
    upload.history_only = history_only

    db.commit()
    return {
        "status": upload.status,
        "revision": upload.revision,
        "warnings": upload.warnings,
        "fields": fields,
        "lines": lines,
    }


@router.post("/invoice-uploads/{upload_id}/post")
def post_invoice_sale(
    upload_id: str,
    db: DB,
    user: Owner,
    payload: Optional[dict[str, Any]] = Body(None),
):
    """
    Step D — Post: One database transaction records the sale, its lines, and stock movements.
    """
    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Invoice upload not found.")

    reviewed_data = payload or upload.reviewed_data or {}
    return post_offline_sale(upload_id, reviewed_data, user.id, db)


@router.get("/invoice-uploads/{upload_id}/file")
def view_upload_file(
    upload_id: str,
    db: DB,
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    """Secure preview of uploaded original invoice file via header or query token."""
    user = None
    if credentials:
        user = get_user_from_raw_token(db, credentials.credentials)
    elif token:
        user = get_user_from_raw_token(db, token)

    if not user:
        raise HTTPException(401, "Authentication required to view document.")
    if user.role != "owner":
        raise HTTPException(403, "Owner access required.")

    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Upload not found.")

    file_path = Path(settings.upload_dir) / upload.storage_key
    if not file_path.exists():
        raise HTTPException(404, "Original document file missing on disk.")

    mime = upload.mime_type
    ext = file_path.suffix.lower()
    if not mime or mime == "application/octet-stream":
        if ext in (".png",):
            mime = "image/png"
        elif ext in (".jpg", ".jpeg"):
            mime = "image/jpeg"
        elif ext in (".webp",):
            mime = "image/webp"
        elif ext in (".pdf",):
            mime = "application/pdf"
        else:
            mime = "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{upload.original_name}"'},
    )


@router.delete("/invoice-uploads/{upload_id}")
def delete_invoice_upload(upload_id: str, db: DB, user: Owner):
    """
    Delete a draft invoice upload from the processing queue.
    Only uploads that have NOT been posted can be deleted.
    Posted records are permanent audit evidence and cannot be removed.
    """
    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Invoice upload not found.")
    if upload.status == "posted":
        raise HTTPException(
            409,
            "Cannot delete a posted invoice — it is permanent audit evidence. "
            "Use void/credit to correct it instead."
        )

    # Remove physical file from disk if it exists
    try:
        file_path = Path(settings.upload_dir) / upload.storage_key
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass  # Non-fatal: metadata deletion still proceeds

    # Remove the StoredFile record if no other uploads reference it
    stored = db.query(StoredFile).filter(StoredFile.id == upload.file_id).first()
    if stored:
        other_refs = db.query(InvoiceUpload).filter(
            InvoiceUpload.file_id == stored.id,
            InvoiceUpload.id != upload_id,
        ).count()
        if other_refs == 0:
            db.delete(stored)

    db.delete(upload)
    db.commit()
    return {"deleted": True, "id": upload_id}



@router.get("")
def list_sales(
    db: DB,
    _: Owner,
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Step E — Previous Transactions list.
    Paginated, searchable by invoice number / customer, filterable by record and payment status.
    """
    q = db.query(OfflineSale).order_by(desc(OfflineSale.invoice_date), desc(OfflineSale.created_at))

    if search:
        search_pat = f"%{search.strip()}%"
        q = q.filter((OfflineSale.invoice_number.ilike(search_pat)) | (OfflineSale.customer_name.ilike(search_pat)))

    if status:
        q = q.filter(OfflineSale.status == status)

    if payment_status:
        q = q.filter(OfflineSale.payment_status == payment_status)

    total_count = q.count()
    sales = q.limit(limit).offset(offset).all()

    items = []
    for s in sales:
        line_count = db.query(OfflineSaleLine).filter(OfflineSaleLine.sale_id == s.id).count()
        attachment = db.query(SaleAttachment).filter(SaleAttachment.sale_id == s.id).first()
        items.append({
            "id": s.id,
            "invoice_number": s.invoice_number,
            "invoice_date": s.invoice_date.strftime("%Y-%m-%d") if s.invoice_date else "",
            "posted_at": s.posted_at.isoformat() if s.posted_at else "",
            "customer_name": s.customer_name,
            "total": float(s.total),
            "currency": s.currency,
            "status": s.status,
            "payment_status": s.payment_status,
            "inventory_applied": s.inventory_applied,
            "history_only": s.history_only,
            "line_count": line_count,
            "attachment_id": attachment.id if attachment else None,
            "attachment_file_id": attachment.file_id if attachment else None,
        })

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": items,
    }


@router.get("/export")
def export_sales_csv(
    db: DB,
    _: Owner,
    status: Optional[str] = Query(None),
):
    """Authorized CSV export of previous transactions."""
    q = db.query(OfflineSale).order_by(desc(OfflineSale.invoice_date))
    if status:
        q = q.filter(OfflineSale.status == status)
    sales = q.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Invoice Number", "Invoice Date", "Customer", "Subtotal", "Discount",
        "Tax", "Total (INR)", "Payment Status", "Record Status", "Inventory Applied", "Posted At"
    ])

    for s in sales:
        writer.writerow([
            s.invoice_number,
            s.invoice_date.strftime("%Y-%m-%d") if s.invoice_date else "",
            s.customer_name,
            f"{s.subtotal:.2f}",
            f"{s.discount:.2f}",
            f"{s.tax:.2f}",
            f"{s.total:.2f}",
            s.payment_status,
            s.status,
            "Yes" if s.inventory_applied else "No",
            s.posted_at.strftime("%Y-%m-%d %H:%M:%S") if s.posted_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=aayerah_sales_export_{now().strftime('%Y%m%d')}.csv"},
    )


@router.get("/{sale_id}")
def get_sale_detail(sale_id: str, db: DB, _: Owner):
    """Complete sale detail view: lines, stock movements, payments, returns, and original attachment."""
    sale = db.query(OfflineSale).filter(OfflineSale.id == sale_id).first()
    if not sale:
        raise HTTPException(404, "Sale not found.")

    lines = db.query(OfflineSaleLine).filter(OfflineSaleLine.sale_id == sale.id).order_by(OfflineSaleLine.line_index).all()
    payments = db.query(SalePayment).filter(SalePayment.sale_id == sale.id).order_by(SalePayment.collection_date).all()
    returns = db.query(SaleReturn).filter(SaleReturn.sale_id == sale.id).order_by(SaleReturn.return_date).all()
    attachments = db.query(SaleAttachment).filter(SaleAttachment.sale_id == sale.id).all()

    return {
        "id": sale.id,
        "invoice_number": sale.invoice_number,
        "invoice_series": sale.invoice_series,
        "invoice_date": sale.invoice_date.strftime("%Y-%m-%d") if sale.invoice_date else "",
        "customer_name": sale.customer_name,
        "customer_contact": sale.customer_contact,
        "currency": sale.currency,
        "subtotal": float(sale.subtotal),
        "discount": float(sale.discount),
        "tax": float(sale.tax),
        "charges": float(sale.charges),
        "roundoff": float(sale.roundoff),
        "total": float(sale.total),
        "payment_status": sale.payment_status,
        "status": sale.status,
        "inventory_applied": sale.inventory_applied,
        "history_only": sale.history_only,
        "posted_at": sale.posted_at.isoformat() if sale.posted_at else "",
        "voided_at": sale.voided_at.isoformat() if sale.voided_at else None,
        "void_reason": sale.void_reason,
        "lines": [
            {
                "id": l.id,
                "line_index": l.line_index,
                "product_id": l.product_id,
                "sku": l.sku_snapshot,
                "name": l.name_snapshot,
                "input_quantity": l.input_quantity,
                "free_quantity": l.free_quantity,
                "input_unit": l.input_unit,
                "conversion_factor": float(l.conversion_factor),
                "base_quantity": l.base_quantity,
                "unit_price": float(l.unit_price),
                "line_discount": float(l.line_discount),
                "line_tax": float(l.line_tax),
                "line_total": float(l.line_total),
                "returned_quantity": l.returned_quantity,
                "is_non_stock": l.is_non_stock,
            }
            for l in lines
        ],
        "payments": [
            {
                "id": p.id,
                "amount": float(p.amount),
                "method": p.method,
                "reference": p.reference,
                "collection_date": p.collection_date.strftime("%Y-%m-%d %H:%M"),
            }
            for p in payments
        ],
        "returns": [
            {
                "id": r.id,
                "line_id": r.line_id,
                "quantity": r.quantity,
                "credit_amount": float(r.credit_amount),
                "disposition": r.disposition,
                "reason": r.reason,
                "return_date": r.return_date.strftime("%Y-%m-%d %H:%M"),
            }
            for r in returns
        ],
        "attachments": [
            {
                "id": a.id,
                "file_id": a.file_id,
                "filename": a.original_filename,
                "download_url": f"/admin/sales/{sale.id}/attachments/{a.file_id}",
            }
            for a in attachments
        ],
    }


@router.get("/{sale_id}/attachments/{file_id}")
def download_sale_attachment(sale_id: str, file_id: str, db: DB, _: Owner):
    """Authorized preview and download of original invoice image or PDF."""
    attachment = db.query(SaleAttachment).filter(
        SaleAttachment.sale_id == sale_id,
        SaleAttachment.file_id == file_id,
    ).first()
    if not attachment:
        raise HTTPException(404, "Attachment not found for this sale.")

    stored_file = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if not stored_file:
        raise HTTPException(404, "Stored file record not found.")

    file_path = Path(settings.upload_dir) / stored_file.storage_key
    if not file_path.exists():
        raise HTTPException(404, "Attachment file does not exist on disk.")

    return FileResponse(
        path=file_path,
        media_type=stored_file.mime_type,
        filename=attachment.original_filename,
    )


@router.post("/{sale_id}/payments")
def record_sale_payment_endpoint(
    sale_id: str,
    db: DB,
    user: Owner,
    payload: dict[str, Any] = Body(...),
):
    """Record physical collection (cash, upi, bank transfer, cheque)."""
    return record_payment(sale_id, payload, user.id, db)


@router.post("/{sale_id}/returns")
def record_sale_return_endpoint(
    sale_id: str,
    db: DB,
    user: Owner,
    payload: dict[str, Any] = Body(...),
):
    """Record customer return / credit note with restock disposition."""
    return record_return(sale_id, payload, user.id, db)


@router.post("/{sale_id}/void")
def void_sale_endpoint(
    sale_id: str,
    db: DB,
    user: Owner,
    payload: dict[str, Any] = Body(...),
):
    """Compensating void reversal. Restores deducted stock once and marks sale voided."""
    reason = payload.get("reason", "")
    return void_sale(sale_id, reason, user.id, db)
