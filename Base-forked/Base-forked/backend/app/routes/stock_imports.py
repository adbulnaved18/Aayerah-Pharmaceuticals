"""
Stock Imports — Monthly Restock API
Upload → Parse → Preview → Confirm (post) → History
All endpoints are owner-only.
"""

import csv
import hashlib
import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from ..models import (
    InventoryMovement,
    InventoryOperation,
    Product,
    StoredFile,
    StockImport,
    StockImportRow,
    now,
)
from ..security import DB, Owner

router = APIRouter(prefix="/admin/stock-imports", tags=["Inventory Restock"])

# ─── helpers ────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MiB
MAX_ROWS = 5_000


from ..services.stock_import_service import (
    parse_spreadsheet_bytes,
    parse_strict_csv_bytes,
    parse_strict_xlsx_bytes,
    validate_restock_rows,
    generate_inventory_csv_template,
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ─── endpoints ──────────────────────────────────────────────────────────────


@router.get("/template")
def download_template(_: Owner):
    """Return the strict CSV template with exact required columns."""
    from fastapi.responses import PlainTextResponse
    csv_text = generate_inventory_csv_template()
    return PlainTextResponse(content=csv_text, media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=aayerah_restock_template.csv"})


@router.post("")
async def upload_stock_import(
    db: DB,
    user: Owner,
    file: UploadFile = File(...),
    receipt_reference: str = Form(...),
    received_date: Optional[str] = Form(None),
    month: Optional[str] = Form(None),
    source: Optional[str] = Form(None),
):
    """
    Step 1: Upload spreadsheet. Returns import_id + parsed row preview.
    Does NOT change any stock.
    """
    if not receipt_reference.strip():
        raise HTTPException(422, "receipt_reference is required.")

    fname = file.filename or ""
    ext = "." + fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, f"Only .xls, .xlsx, and .csv are accepted (got '{ext}').")

    raw = await file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, f"File exceeds {MAX_FILE_BYTES // 1024 // 1024} MiB limit.")

    file_hash = _sha256(raw)

    # Duplicate file detection — same hash already posted
    existing_file = db.scalars(select(StoredFile).where(StoredFile.sha256 == file_hash)).first()
    if existing_file:
        prev = db.scalars(select(StockImport).where(StockImport.file_id == existing_file.id, StockImport.status == "posted")).first()
        if prev:
            raise HTTPException(409, f"This exact file was already posted as receipt '{prev.receipt_reference}'. Upload rejected to prevent double-counting.")

    # Duplicate receipt_reference detection
    prev_ref = db.scalars(select(StockImport).where(StockImport.receipt_reference == receipt_reference.strip())).first()
    if prev_ref:
        raise HTTPException(409, f"Receipt reference '{receipt_reference}' already exists (status: {prev_ref.status}). Use a unique reference per delivery.")

    # Parse strictly
    try:
        raw_rows = parse_spreadsheet_bytes(raw, fname)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not parse spreadsheet: {exc}")

    # Validate rows
    valid_rows, error_rows, skipped_rows = validate_restock_rows(raw_rows, db)

    # Store file record
    storage_key = f"imports/{uuid.uuid4()}{ext}"
    sf = StoredFile(
        original_name=fname,
        storage_key=storage_key,
        mime_type=file.content_type or "application/octet-stream",
        size=len(raw),
        sha256=file_hash,
        uploader_id=user.id,
    )
    db.add(sf)
    db.flush()

    # Parse received_date
    rx_date = None
    if received_date:
        try:
            rx_date = datetime.fromisoformat(received_date).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(422, f"received_date must be ISO format (e.g. 2026-10-01), got: '{received_date}'.")

    # Determine import status
    import_status = "needs_review" if error_rows else "ready"

    si = StockImport(
        file_id=sf.id,
        receipt_reference=receipt_reference.strip(),
        source=source,
        month=month,
        received_date=rx_date,
        status=import_status,
        actor_id=user.id,
    )
    db.add(si)
    db.flush()

    # Store import rows
    all_rows = valid_rows + error_rows + skipped_rows
    for row in all_rows:
        sir = StockImportRow(
            import_id=si.id,
            row_number=row["row_number"],
            raw_sku=row.get("sku") or row.get("item_description"),
            product_id=row.get("product_id"),
            received_quantity=row.get("qty") or 0,
            input_unit=row.get("unit", ""),
            validation_messages={
                "messages": row.get("validation_messages", []),
                "item_description": row.get("item_description"),
                "rate": float(row.get("rate") or 0),
                "opening_qty": row.get("opening_qty") or 0,
                "receipt_qty": row.get("receipt_qty") or 0,
                "issue_qty": row.get("issue_qty") or 0,
                "closing_qty": row.get("closing_qty") or 0,
            },
            status=row.get("status", "pending"),
        )
        db.add(sir)

    db.commit()
    db.refresh(si)

    return {
        "id": si.id,
        "receipt_reference": si.receipt_reference,
        "status": si.status,
        "total_rows": len(all_rows),
        "valid_rows": len(valid_rows),
        "error_rows": len(error_rows),
        "skipped_rows": len(skipped_rows),
        "errors": [
            {
                "row": r["row_number"],
                "sku": r.get("sku") or r.get("item_description"),
                "item_description": r.get("item_description"),
                "messages": r.get("validation_messages"),
            }
            for r in error_rows
        ],
        "preview": [
            {
                "row": r["row_number"],
                "sku": r.get("sku"),
                "item_description": r.get("item_description"),
                "product_name": r.get("product_name"),
                "rate": float(r.get("rate") or 0),
                "opening_qty": r.get("opening_qty", 0),
                "qty": r.get("qty"),
                "receipt_qty": r.get("receipt_qty", r.get("qty")),
                "issue_qty": r.get("issue_qty", 0),
                "closing_qty": r.get("closing_qty", 0),
                "unit": r.get("unit"),
                "current_stock": r.get("current_stock", 0),
                "product_id": r.get("product_id"),
            }
            for r in valid_rows
        ],
    }


@router.get("")
def list_imports(
    db: DB,
    _: Owner,
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """Import history with optional status filter."""
    q = select(StockImport).order_by(StockImport.created_at.desc()).limit(limit).offset(offset)
    if status:
        q = q.where(StockImport.status == status)
    items = db.scalars(q).all()
    return [
        {
            "id": i.id,
            "receipt_reference": i.receipt_reference,
            "status": i.status,
            "month": i.month,
            "received_date": i.received_date.isoformat() if i.received_date else None,
            "created_at": i.created_at.isoformat(),
            "posted_at": i.posted_at.isoformat() if i.posted_at else None,
        }
        for i in items
    ]


@router.get("/{import_id}")
def get_import(import_id: str, db: DB, _: Owner):
    """Full import detail with rows."""
    si = db.scalars(select(StockImport).where(StockImport.id == import_id)).first()
    if not si:
        raise HTTPException(404, "Import not found.")
    rows = db.scalars(select(StockImportRow).where(StockImportRow.import_id == si.id)).all()
    return {
        "id": si.id,
        "receipt_reference": si.receipt_reference,
        "status": si.status,
        "rows": [
            {
                "id": r.id,
                "row_number": r.row_number,
                "sku": r.raw_sku,
                "item_description": (r.validation_messages or {}).get("item_description", r.raw_sku),
                "rate": (r.validation_messages or {}).get("rate", 0),
                "opening_qty": (r.validation_messages or {}).get("opening_qty", 0),
                "product_id": r.product_id,
                "received_quantity": r.received_quantity,
                "unit": r.input_unit,
                "status": r.status,
                "messages": (r.validation_messages or {}).get("messages", []),
            }
            for r in rows
        ],
    }


@router.post("/{import_id}/post")
def post_import(import_id: str, db: DB, user: Owner):
    """
    Step 2: Transactional posting. Adds received quantities to existing stock.
    Idempotent — repeated calls return the original result without re-adding stock.
    """
    # Lock the import row
    si = db.scalars(
        select(StockImport).where(StockImport.id == import_id).with_for_update()
    ).first()

    if not si:
        raise HTTPException(404, "Import not found.")

    # Already posted — idempotent return
    if si.status == "posted":
        return {"status": "already_posted", "id": si.id, "receipt_reference": si.receipt_reference}

    if si.status == "needs_review":
        raise HTTPException(409, "Import has validation errors. Resolve all row errors before posting.")

    if si.status not in ("ready",):
        raise HTTPException(409, f"Import cannot be posted in status '{si.status}'.")

    # Load valid rows
    valid_rows = db.scalars(
        select(StockImportRow).where(
            StockImportRow.import_id == si.id,
            StockImportRow.status == "valid",
        )
    ).all()

    if not valid_rows:
        raise HTTPException(422, "No valid rows to post.")

    # Unique posting key prevents duplicate DB writes even under retry
    posting_key = f"RESTOCK:{si.id}"
    existing_op = db.scalars(
        select(InventoryOperation).where(InventoryOperation.posting_key == posting_key)
    ).first()
    if existing_op:
        return {"status": "already_posted", "id": si.id, "operation_id": existing_op.id}

    # Create the ledger operation
    op = InventoryOperation(
        operation_type="RESTOCK",
        source_document_id=si.id,
        actor_id=user.id,
        effective_date=si.received_date or now(),
        posting_key=posting_key,
    )
    db.add(op)
    db.flush()

    movements = []
    product_ids = [r.product_id for r in valid_rows if r.product_id]

    # Lock all product rows in stable ID order (prevents deadlocks)
    products = {
        p.id: p
        for p in db.scalars(
            select(Product)
            .where(Product.id.in_(product_ids))
            .with_for_update()
            .order_by(Product.id)
        ).all()
    }

    for row in valid_rows:
        product = products.get(row.product_id)
        if not product:
            db.rollback()
            raise HTTPException(422, f"Product {row.product_id} disappeared — rolling back entire receipt.")

        qty = int(row.received_quantity * float(row.conversion_factor))
        old_stock = product.stock
        new_stock = old_stock + qty

        product.stock = new_stock
        product.stock_version += 1

        movement = InventoryMovement(
            operation_id=op.id,
            source_line_id=row.id,
            product_id=product.id,
            delta=qty,
            balance_before=old_stock,
            balance_after=new_stock,
            reason=f"Monthly restock receipt {si.receipt_reference}",
        )
        db.add(movement)
        movements.append({"product_id": product.id, "name": product.name, "before": old_stock, "added": qty, "after": new_stock})

    si.status = "posted"
    si.posted_at = now()

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"Posting conflict (possible duplicate): {exc.orig}")

    return {
        "status": "posted",
        "id": si.id,
        "receipt_reference": si.receipt_reference,
        "operation_id": op.id,
        "movements": movements,
    }


@router.post("/{import_id}/cancel")
def cancel_import(import_id: str, db: DB, _: Owner):
    """Cancel an unposted draft."""
    si = db.scalars(select(StockImport).where(StockImport.id == import_id).with_for_update()).first()
    if not si:
        raise HTTPException(404, "Import not found.")
    if si.status == "posted":
        raise HTTPException(409, "Cannot cancel a posted receipt — use /reverse instead.")
    si.status = "cancelled"
    db.commit()
    return {"status": "cancelled", "id": si.id}


@router.get("/{import_id}/movements")
def get_movements(import_id: str, db: DB, _: Owner):
    """Stock movements resulting from a posted import."""
    si = db.scalars(select(StockImport).where(StockImport.id == import_id)).first()
    if not si:
        raise HTTPException(404, "Import not found.")
    op = db.scalars(select(InventoryOperation).where(InventoryOperation.source_document_id == import_id)).first()
    if not op:
        return {"movements": []}
    mvs = db.scalars(select(InventoryMovement).where(InventoryMovement.operation_id == op.id)).all()
    return {
        "receipt_reference": si.receipt_reference,
        "movements": [
            {"product_id": m.product_id, "delta": m.delta, "before": m.balance_before, "after": m.balance_after}
            for m in mvs
        ],
    }
