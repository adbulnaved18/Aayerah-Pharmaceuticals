from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import (
    AuditEvent,
    InventoryMovement,
    InventoryOperation,
    InvoiceUpload,
    OfflineSale,
    OfflineSaleLine,
    Product,
    SaleAttachment,
    SalePayment,
    SaleReturn,
    StoredFile,
    now,
)


def post_offline_sale(
    upload_id: str,
    reviewed: dict[str, Any],
    user_id: str,
    db: Session,
) -> dict[str, Any]:
    """
    Transactional posting for an offline sales invoice.
    Deducts inventory per product line, creates immutable sale snapshots,
    records inventory movements, and locks product rows in stable ID order.
    """
    upload = db.query(InvoiceUpload).filter(InvoiceUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(404, "Invoice upload not found.")
    
    if upload.status == "posted":
        existing_sale = db.query(OfflineSale).filter(OfflineSale.upload_id == upload_id).first()
        return {
            "status": "already_posted",
            "sale_id": existing_sale.id if existing_sale else None,
            "invoice_number": existing_sale.invoice_number if existing_sale else "",
        }

    fields = reviewed.get("fields", {})
    lines = reviewed.get("lines", [])
    history_only = bool(reviewed.get("history_only", False))

    inv_num = (fields.get("invoice_number") or "").strip()
    if not inv_num:
        raise HTTPException(422, "Invoice number is required.")

    # Duplicate check on invoice number
    duplicate_sale = db.query(OfflineSale).filter(
        OfflineSale.invoice_number == inv_num,
        OfflineSale.status != "voided",
    ).first()
    if duplicate_sale:
        raise HTTPException(409, f"Invoice '{inv_num}' is already recorded in the system (Sale ID: {duplicate_sale.id}).")

    if not lines:
        raise HTTPException(422, "Cannot post an invoice without line items.")

    # Parse invoice date
    inv_date_str = fields.get("invoice_date")
    try:
        inv_date = datetime.fromisoformat(inv_date_str).replace(tzinfo=timezone.utc) if inv_date_str else now()
    except Exception:
        inv_date = now()

    # Aggregate base quantities per product to lock and check stock
    stock_deductions: dict[str, int] = {}
    for line in lines:
        pid = line.get("product_id")
        # Line is non-stock only if explicitly flagged AND has no product mapped
        is_non_stock = bool(line.get("is_non_stock", False)) and not bool(pid)
        if is_non_stock or not pid:
            continue
        
        # Calculate base_qty safely
        conv_factor = Decimal(str(line.get("conversion_factor", 1.0) or 1.0))
        in_qty = int(line.get("input_quantity", 1) or 1)
        free_qty = int(line.get("free_quantity", 0) or 0)
        qty = int(line.get("base_quantity") or 0)
        if qty <= 0:
            qty = int((in_qty + free_qty) * conv_factor)
        if qty <= 0:
            qty = 1
        stock_deductions[pid] = stock_deductions.get(pid, 0) + qty

    # Lock product rows in stable order and verify sufficiency
    products_locked: dict[str, Product] = {}
    if not history_only and stock_deductions:
        sorted_pids = sorted(stock_deductions.keys())
        products = db.scalars(
            select(Product)
            .where(Product.id.in_(sorted_pids))
            .with_for_update()
            .order_by(Product.id)
        ).all()
        products_locked = {p.id: p for p in products}

        # Verify stock sufficiency for ALL lines before deducting ANY
        shortages = []
        for pid, req_qty in stock_deductions.items():
            prod = products_locked.get(pid)
            if not prod:
                raise HTTPException(422, f"Product ID '{pid}' not found.")
            if prod.stock < req_qty:
                shortage = req_qty - prod.stock
                shortages.append(f"'{prod.name}' (SKU: {prod.sku}) — Available: {prod.stock}, Required: {req_qty}, Short by {shortage}")
        
        if shortages:
            raise HTTPException(422, f"Insufficient inventory to fulfill invoice. Posting stopped without partial deduction:\n• " + "\n• ".join(shortages))

    # Calculate financial totals safely using Decimal
    subtotal = Decimal(str(fields.get("subtotal") or "0.00"))
    discount = Decimal(str(fields.get("discount") or "0.00"))
    tax = Decimal(str(fields.get("tax") or "0.00"))
    charges = Decimal(str(fields.get("charges") or "0.00"))
    roundoff = Decimal(str(fields.get("roundoff") or "0.00"))
    total = Decimal(str(fields.get("total") or "0.00"))

    if total <= 0:
        # Compute from lines if not provided
        total = sum(Decimal(str(l.get("line_total", 0))) for l in lines) - discount + tax + charges + roundoff

    posting_key = f"OFFLINE_SALE:{upload.id}:{inv_num}"

    # 1. Create OfflineSale header
    sale = OfflineSale(
        upload_id=upload.id,
        business_name=fields.get("business_name", "Aayerah Pharmaceuticals"),
        invoice_series=fields.get("invoice_series", ""),
        invoice_number=inv_num,
        invoice_date=inv_date,
        customer_name=fields.get("customer_name", "").strip(),
        customer_contact=fields.get("customer_contact", "").strip(),
        currency="INR",
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        charges=charges,
        roundoff=roundoff,
        total=total,
        payment_status="unpaid",
        status="posted",
        inventory_applied=not history_only,
        history_only=history_only,
        posting_key=posting_key,
        posted_by=user_id,
        posted_at=now(),
    )
    db.add(sale)
    db.flush()

    # 2. Create Ledger Operation if stock movement applies
    inv_op = None
    if not history_only and stock_deductions:
        inv_op = InventoryOperation(
            operation_type="OFFLINE_SALE",
            source_document_id=sale.id,
            actor_id=user_id,
            effective_date=inv_date,
            posting_key=posting_key,
        )
        db.add(inv_op)
        db.flush()

    # 3. Create Line items and movements
    movements_info = []
    for idx, l in enumerate(lines, start=1):
        pid = l.get("product_id")
        is_non_stock = bool(l.get("is_non_stock", False)) and not bool(pid)
        in_qty = int(l.get("input_quantity", 1) or 1)
        free_qty = int(l.get("free_quantity", 0) or 0)
        conv_factor = Decimal(str(l.get("conversion_factor", 1.0) or 1.0))
        base_qty = int((in_qty + free_qty) * conv_factor)
        if base_qty <= 0:
            base_qty = 1
        u_price = Decimal(str(l.get("unit_price", 0)))
        l_disc = Decimal(str(l.get("line_discount", 0)))
        l_tax = Decimal(str(l.get("line_tax", 0)))
        l_tot = Decimal(str(l.get("line_total", 0)))

        sale_line = OfflineSaleLine(
            sale_id=sale.id,
            line_index=idx,
            product_id=pid if not is_non_stock else None,
            is_non_stock=is_non_stock,
            sku_snapshot=l.get("sku_snapshot", ""),
            name_snapshot=l.get("name_snapshot", ""),
            input_quantity=in_qty,
            free_quantity=free_qty,
            input_unit=l.get("input_unit", "unit"),
            conversion_factor=conv_factor,
            base_quantity=base_qty,
            unit_price=u_price,
            line_discount=l_disc,
            line_tax=l_tax,
            line_total=l_tot,
        )
        db.add(sale_line)
        db.flush()

        # Apply stock deduction
        if not history_only and pid and not is_non_stock:
            prod = products_locked[pid]
            old_stock = prod.stock
            new_stock = old_stock - base_qty
            prod.stock = new_stock
            prod.stock_version += 1

            movement = InventoryMovement(
                operation_id=inv_op.id,
                source_line_id=sale_line.id,
                product_id=prod.id,
                delta=-base_qty,
                balance_before=old_stock,
                balance_after=new_stock,
                reason=f"Offline sales invoice {inv_num}",
            )
            db.add(movement)
            movements_info.append({
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "deducted": base_qty,
                "before": old_stock,
                "after": new_stock,
            })

    # 4. Attach original file
    if upload.file_id:
        attachment = SaleAttachment(
            sale_id=sale.id,
            upload_id=upload.id,
            file_id=upload.file_id,
            original_filename=upload.original_name,
            page_order=1,
        )
        db.add(attachment)

    # 5. Update Upload status
    upload.status = "posted"
    upload.reviewed_data = reviewed

    # 6. Audit Trail
    audit = AuditEvent(
        actor_id=user_id,
        entity_type="offline_sale",
        entity_id=sale.id,
        action="post",
        reason=f"Posted invoice {inv_num} (history_only={history_only})",
        payload={"total": float(total), "lines_count": len(lines), "movements": movements_info},
    )
    db.add(audit)

    db.commit()

    return {
        "status": "posted",
        "sale_id": sale.id,
        "invoice_number": inv_num,
        "total": float(total),
        "inventory_applied": not history_only,
        "movements": movements_info,
    }


def record_payment(sale_id: str, payment_data: dict[str, Any], user_id: str, db: Session) -> dict[str, Any]:
    """Records collected cash/payment against a sale idempotently."""
    sale = db.query(OfflineSale).filter(OfflineSale.id == sale_id).first()
    if not sale:
        raise HTTPException(404, "Sale not found.")
    if sale.status == "voided":
        raise HTTPException(400, "Cannot record payment on a voided sale.")

    amount = Decimal(str(payment_data.get("amount", 0)))
    if amount <= 0:
        raise HTTPException(422, "Payment amount must be greater than zero.")

    rec_key = payment_data.get("recording_key") or f"PAY:{sale.id}:{now().timestamp()}"
    existing = db.query(SalePayment).filter(SalePayment.recording_key == rec_key).first()
    if existing:
        return {"status": "already_recorded", "payment_id": existing.id}

    payment = SalePayment(
        sale_id=sale.id,
        amount=amount,
        collection_date=now(),
        method=payment_data.get("method", "cash"),
        reference=payment_data.get("reference", ""),
        recording_key=rec_key,
        actor_id=user_id,
    )
    db.add(payment)
    db.flush()

    # Recompute total collections
    all_payments = db.query(SalePayment).filter(SalePayment.sale_id == sale.id).all()
    total_collected = sum(p.amount for p in all_payments)

    if total_collected >= sale.total:
        sale.payment_status = "paid"
    elif total_collected > 0:
        sale.payment_status = "partial"
    else:
        sale.payment_status = "unpaid"

    audit = AuditEvent(
        actor_id=user_id,
        entity_type="sale_payment",
        entity_id=payment.id,
        action="record_payment",
        reason=f"Recorded {payment.method} collection of ₹{amount} for invoice {sale.invoice_number}",
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "payment_id": payment.id,
        "payment_status": sale.payment_status,
        "total_collected": float(total_collected),
        "total_invoiced": float(sale.total),
    }


def record_return(sale_id: str, return_data: dict[str, Any], user_id: str, db: Session) -> dict[str, Any]:
    """Records a customer return, crediting revenue and restoring sellable stock if applicable."""
    sale = db.query(OfflineSale).filter(OfflineSale.id == sale_id).first()
    if not sale:
        raise HTTPException(404, "Sale not found.")
    if sale.status == "voided":
        raise HTTPException(400, "Cannot process return on a voided sale.")

    line_id = return_data.get("line_id")
    line = db.query(OfflineSaleLine).filter(OfflineSaleLine.id == line_id, OfflineSaleLine.sale_id == sale_id).first()
    if not line:
        raise HTTPException(404, "Sale line item not found.")

    qty = int(return_data.get("quantity", 0))
    if qty <= 0:
        raise HTTPException(422, "Return quantity must be positive.")

    remaining_eligible = line.input_quantity - line.returned_quantity
    if qty > remaining_eligible:
        raise HTTPException(422, f"Cannot return {qty} units; only {remaining_eligible} unreturned units remain on this line.")

    credit_amount = Decimal(str(return_data.get("credit_amount") or (line.unit_price * qty)))
    disposition = return_data.get("disposition", "sellable")
    restock_sellable = disposition == "sellable"

    ret = SaleReturn(
        sale_id=sale.id,
        line_id=line.id,
        quantity=qty,
        credit_amount=credit_amount,
        return_date=now(),
        restock_sellable=restock_sellable,
        disposition=disposition,
        reason=return_data.get("reason", "Customer return"),
        actor_id=user_id,
    )
    db.add(ret)
    line.returned_quantity += qty

    # If sellable, restore stock via positive inventory movement
    if restock_sellable and line.product_id and sale.inventory_applied:
        prod = db.scalars(select(Product).where(Product.id == line.product_id).with_for_update()).first()
        if prod:
            base_add = int(qty * float(line.conversion_factor))
            old_stock = prod.stock
            new_stock = old_stock + base_add
            prod.stock = new_stock
            prod.stock_version += 1

            op = InventoryOperation(
                operation_type="RETURN",
                source_document_id=ret.id,
                actor_id=user_id,
                effective_date=now(),
                posting_key=f"RETURN:{ret.id}",
            )
            db.add(op)
            db.flush()

            movement = InventoryMovement(
                operation_id=op.id,
                source_line_id=ret.id,
                product_id=prod.id,
                delta=base_add,
                balance_before=old_stock,
                balance_after=new_stock,
                reason=f"Customer return on invoice {sale.invoice_number}",
            )
            db.add(movement)

    sale.status = "partially_credited"
    db.commit()

    return {"status": "success", "return_id": ret.id, "restocked": restock_sellable}


def void_sale(sale_id: str, reason: str, user_id: str, db: Session) -> dict[str, Any]:
    """Compensating void reversal. Restores stock once and marks sale voided."""
    sale = db.query(OfflineSale).filter(OfflineSale.id == sale_id).first()
    if not sale:
        raise HTTPException(404, "Sale not found.")
    if sale.status == "voided":
        raise HTTPException(409, "Sale is already voided.")

    if not reason.strip():
        raise HTTPException(422, "A documented void reason is mandatory.")

    # If inventory was applied, restore stock in stable ID order
    if sale.inventory_applied:
        lines = db.query(OfflineSaleLine).filter(OfflineSaleLine.sale_id == sale.id).all()
        stock_lines = [l for l in lines if l.product_id and not l.is_non_stock]
        
        # Calculate unreversed quantity (original base minus any previously returned sellable)
        product_restores: dict[str, int] = {}
        for sl in stock_lines:
            unreturned = sl.input_quantity - sl.returned_quantity
            if unreturned > 0:
                base_to_restore = int(unreturned * float(sl.conversion_factor))
                product_restores[sl.product_id] = product_restores.get(sl.product_id, 0) + base_to_restore

        if product_restores:
            sorted_pids = sorted(product_restores.keys())
            products = {
                p.id: p
                for p in db.scalars(
                    select(Product).where(Product.id.in_(sorted_pids)).with_for_update().order_by(Product.id)
                ).all()
            }

            op = InventoryOperation(
                operation_type="VOID",
                source_document_id=sale.id,
                actor_id=user_id,
                effective_date=now(),
                posting_key=f"VOID:{sale.id}",
            )
            db.add(op)
            db.flush()

            for pid, add_qty in product_restores.items():
                prod = products.get(pid)
                if prod:
                    old_stock = prod.stock
                    new_stock = old_stock + add_qty
                    prod.stock = new_stock
                    prod.stock_version += 1

                    movement = InventoryMovement(
                        operation_id=op.id,
                        source_line_id=sale.id,
                        product_id=prod.id,
                        delta=add_qty,
                        balance_before=old_stock,
                        balance_after=new_stock,
                        reason=f"Compensating void for invoice {sale.invoice_number}",
                    )
                    db.add(movement)

    sale.status = "voided"
    sale.void_reason = reason.strip()
    sale.voided_at = now()

    audit = AuditEvent(
        actor_id=user_id,
        entity_type="offline_sale",
        entity_id=sale.id,
        action="void",
        reason=reason.strip(),
    )
    db.add(audit)
    db.commit()

    return {"status": "voided", "sale_id": sale.id, "invoice_number": sale.invoice_number}
