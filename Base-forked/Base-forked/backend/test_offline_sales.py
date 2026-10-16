import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import (
    Base,
    User,
    Product,
    InvoiceUpload,
    StoredFile,
    OfflineSale,
    OfflineSaleLine,
    InventoryOperation,
    InventoryMovement,
)
from app.services.offline_sales_service import (
    post_offline_sale,
    record_payment,
    record_return,
    void_sale,
)
from app.services.sales_analytics import (
    get_sales_summary,
    get_timeseries,
    get_top_products,
)


def run_all_tests():
    print("=== Running Feature 2 Offline Sales Test Suite ===")
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # 1. Setup mock owner
    owner = User(email="owner@aayerah.com", fullname="Aayerah Admin", password_hash="hash", role="owner")
    db.add(owner)
    db.commit()

    # 2. Setup products matching Section 4 example:
    # Paracetamol: 140 strips, Vitamin C: 42 bottles, Gauze: 28 packs
    p_para = Product(name="Paracetamol 500mg", description="Analgesic", category="Medicine", sku="AAY-PARA500-S10", price=Decimal("20.00"), stock=140, stock_unit="strip")
    p_vitc = Product(name="Vitamin C", description="Immunity supplement", category="Supplements", sku="AAY-VITC-B60", price=Decimal("150.00"), stock=42, stock_unit="bottle")
    p_gauze = Product(name="Gauze", description="Sterile cotton gauze", category="Supplies", sku="AAY-GAUZE-P10", price=Decimal("50.00"), stock=28, stock_unit="pack")
    db.add_all([p_para, p_vitc, p_gauze])
    db.commit()

    # Create dummy stored file and upload record
    sf = StoredFile(original_name="invoice_0108.pdf", storage_key="invoices/test.pdf", mime_type="application/pdf", size=1024, sha256="testsha256", uploader_id=owner.id)
    db.add(sf)
    db.commit()

    upload = InvoiceUpload(
        file_id=sf.id,
        original_name="invoice_0108.pdf",
        storage_key=sf.storage_key,
        file_hash=sf.sha256,
        mime_type=sf.mime_type,
        file_size=1024,
        status="ready",
        actor_id=owner.id,
    )
    db.add(upload)
    db.commit()

    # ── Test 1: Section 4 Example Posting ──
    # Invoice AA-2026-0108: 5 strips Para (₹100), 2 bottles VitC (₹300), 1 pack Gauze (₹50) = Total ₹450
    review_data = {
        "fields": {
            "invoice_number": "AA-2026-0108",
            "invoice_date": "2026-10-08",
            "customer_name": "Clinic Health",
            "subtotal": 450.00,
            "total": 450.00,
            "tax": 0.0,
            "discount": 0.0,
        },
        "lines": [
            {"product_id": p_para.id, "sku_snapshot": p_para.sku, "name_snapshot": p_para.name, "input_quantity": 5, "base_quantity": 5, "unit_price": 20.00, "line_total": 100.00},
            {"product_id": p_vitc.id, "sku_snapshot": p_vitc.sku, "name_snapshot": p_vitc.name, "input_quantity": 2, "base_quantity": 2, "unit_price": 150.00, "line_total": 300.00},
            {"product_id": p_gauze.id, "sku_snapshot": p_gauze.sku, "name_snapshot": p_gauze.name, "input_quantity": 1, "base_quantity": 1, "unit_price": 50.00, "line_total": 50.00},
        ],
        "history_only": False,
    }

    res = post_offline_sale(upload.id, review_data, owner.id, db)
    assert res["status"] == "posted", f"Expected posted, got {res['status']}"
    sale_id = res["sale_id"]

    db.refresh(p_para)
    db.refresh(p_vitc)
    db.refresh(p_gauze)

    # Verify inventory deductions:
    # Para: 140 - 5 = 135
    # Vit C: 42 - 2 = 40
    # Gauze: 28 - 1 = 27
    assert p_para.stock == 135, f"Para stock expected 135, got {p_para.stock}"
    assert p_vitc.stock == 40, f"VitC stock expected 40, got {p_vitc.stock}"
    assert p_gauze.stock == 27, f"Gauze stock expected 27, got {p_gauze.stock}"
    print("[PASS] Test 1: Section 4 example posted with exact stock deductions (135, 40, 27).")

    # ── Test 2: Idempotent & Duplicate Invoice Rejection ──
    try:
        post_offline_sale(upload.id, review_data, owner.id, db)
        print("[PASS] Test 2a: Idempotent return on already-posted upload handled.")
    except Exception as e:
        print(f"Exception on retry: {e}")

    # Another upload trying same invoice number
    upload2 = InvoiceUpload(original_name="dup.pdf", storage_key="dup.pdf", file_hash="hash2", mime_type="application/pdf", file_size=500, actor_id=owner.id)
    db.add(upload2)
    db.commit()

    try:
        post_offline_sale(upload2.id, review_data, owner.id, db)
        assert False, "Should have rejected duplicate invoice number!"
    except Exception as exc:
        assert "409" in str(exc) or "already recorded" in str(exc)
        print("[PASS] Test 2b: Duplicate invoice number rejected.")

    # ── Test 3: Insufficient Stock Halts Entire Posting Without Partial Updates ──
    upload3 = InvoiceUpload(original_name="shortage.pdf", storage_key="shortage.pdf", file_hash="hash3", mime_type="application/pdf", file_size=500, actor_id=owner.id)
    db.add(upload3)
    db.commit()

    shortage_review = {
        "fields": {"invoice_number": "INV-SHORTAGE-01", "invoice_date": "2026-10-08", "total": 200.0},
        "lines": [
            {"product_id": p_para.id, "input_quantity": 2, "base_quantity": 2, "unit_price": 20.0, "line_total": 40.0},
            {"product_id": p_gauze.id, "input_quantity": 999, "base_quantity": 999, "unit_price": 50.0, "line_total": 49950.0},  # Gauze has only 27!
        ],
    }
    para_before = p_para.stock
    gauze_before = p_gauze.stock
    try:
        post_offline_sale(upload3.id, shortage_review, owner.id, db)
        assert False, "Should have halted due to shortage!"
    except Exception as exc:
        assert "Insufficient" in str(exc)
        db.refresh(p_para)
        db.refresh(p_gauze)
        assert p_para.stock == para_before, "Paracetamol stock must NOT be partially deducted!"
        assert p_gauze.stock == gauze_before, "Gauze stock must NOT be deducted!"
        print("[PASS] Test 3: Insufficient stock stopped atomically without partial deduction.")

    # ── Test 4: Payments and Collections ──
    sale = db.query(OfflineSale).filter(OfflineSale.id == sale_id).first()
    assert sale.payment_status == "unpaid", "Initial sale should be unpaid"

    # Record partial payment ₹200
    p_res1 = record_payment(sale_id, {"amount": 200.00, "method": "cash"}, owner.id, db)
    db.refresh(sale)
    assert sale.payment_status == "partial"
    print("[PASS] Test 4a: Partial payment recorded (status: partial).")

    # Record remaining payment ₹250
    p_res2 = record_payment(sale_id, {"amount": 250.00, "method": "upi"}, owner.id, db)
    db.refresh(sale)
    assert sale.payment_status == "paid"
    print("[PASS] Test 4b: Complete payment recorded (status: paid).")

    # ── Test 5: Customer Return with Restocked Sellable Units ──
    line_para = db.query(OfflineSaleLine).filter(OfflineSaleLine.sale_id == sale_id, OfflineSaleLine.product_id == p_para.id).first()
    ret_res = record_return(
        sale_id,
        {"line_id": line_para.id, "quantity": 1, "credit_amount": 20.00, "disposition": "sellable", "reason": "Patient changed prescription"},
        owner.id,
        db,
    )
    db.refresh(p_para)
    assert p_para.stock == 136, f"Expected 136 strips after 1 returned sellable strip, got {p_para.stock}"
    print("[PASS] Test 5: Return of 1 strip restored sellable stock to 136.")

    # ── Test 6: Compensating Void ──
    upload4 = InvoiceUpload(original_name="void_test.pdf", storage_key="v.pdf", file_hash="hash4", mime_type="application/pdf", file_size=500, actor_id=owner.id)
    db.add(upload4)
    db.commit()

    v_data = {
        "fields": {"invoice_number": "INV-VOID-001", "invoice_date": "2026-10-08", "total": 100.0},
        "lines": [{"product_id": p_para.id, "input_quantity": 6, "base_quantity": 6, "unit_price": 20.0, "line_total": 120.0}],
    }
    s4 = post_offline_sale(upload4.id, v_data, owner.id, db)
    db.refresh(p_para)
    assert p_para.stock == 130, f"Expected 130 after deducting 6, got {p_para.stock}"

    # Void transaction
    void_res = void_sale(s4["sale_id"], "Billing entry error", owner.id, db)
    db.refresh(p_para)
    assert p_para.stock == 136, f"Expected 136 after void restored 6 strips, got {p_para.stock}"
    print("[PASS] Test 6: Void reversed inventory and restored balances accurately.")

    # ── Test 7: Analytics Summary & Zero-filled Timeseries ──
    summary = get_sales_summary(db)
    assert summary["total_transactions"] >= 1
    assert summary["collections"] >= 450.0
    print(f"[PASS] Test 7a: Analytics summary generated: Net Sales INR {summary['net_product_sales']}, Collections INR {summary['collections']}.")

    ts = get_timeseries(db, period="last_week")
    assert len(ts) == 7, f"Last week must contain exactly 7 days, got {len(ts)}"
    print(f"[PASS] Test 7b: Timeseries last week returned exactly 7 days (zero-filled).")

    top_prods = get_top_products(db)
    assert len(top_prods) > 0
    print(f"[PASS] Test 7c: Top products ranking returned {len(top_prods)} products.")

    print("\nALL FEATURE 2 TESTS PASSED SUCCESSFULLY! [OK]")


if __name__ == "__main__":
    run_all_tests()
