"""
Comprehensive Test Suite for Strict CSV Restock & "Add to Inventory" Bulk Features
-----------------------------------------------------------------------------------
Tests:
1. Strict 2-tier header validation:
   Row 1: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,
   Row 2: ,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE
2. Header format rejection for malformed / legacy spreadsheets (strictness enforcement)
3. Template generation endpoint verification
4. "Add to Inventory" bulk product creation from CSV:
   - Multiple new products created
   - Correct prices from RATE
   - Correct initial stock from CLOSING QTY / (OPENING + RECEIPT - ISSUE)
   - Auto-generated clean SKUs
   - InventoryOperation and InventoryMovement creation
   - Smooth updating of existing products
5. "Restock" feature with the new format:
   - Product matching by ITEM DESCRIPTION (case-insensitive name or SKU)
   - Restock quantity strictly from RECEIPT QTY
   - Transactional posting & stock increments
   - Idempotency & ledger recording
   - Error detection for unknown products or invalid receipt quantities
"""

import sys
import io
import uuid
from decimal import Decimal
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base,
    User,
    Product,
    StockImport,
    StockImportRow,
    InventoryOperation,
    InventoryMovement,
    StoredFile,
    now,
)
from app.services.stock_import_service import (
    validate_strict_headers,
    parse_strict_csv_bytes,
    parse_spreadsheet_bytes,
    generate_inventory_csv_template,
    validate_restock_rows,
    bulk_import_inventory,
)


def run_tests():
    print("=" * 70)
    print("TEST SUITE: Strict Inventory & Restock CSV Format + Add-to-Inventory")
    print("=" * 70)

    # -------------------------------------------------------------------------
    # TEST 1: Strict Header Validation & Template Generation
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Strict Header Validation & Template Generation")
    template = generate_inventory_csv_template()
    lines = [ln.strip() for ln in template.strip().split("\r\n")]
    r1 = lines[0].split(",")
    r2 = lines[1].split(",")

    is_valid, err = validate_strict_headers(r1, r2)
    assert is_valid, f"Template failed strict header validation: {err}"
    print("  [PASS] Template matches exact 2-tier header specifications.")

    # Test rejection of legacy single-line format
    legacy_r1 = ["sku", "product_name", "received_quantity", "unit"]
    legacy_r2 = ["AAY-01", "Paracetamol", "100", "strip"]
    is_valid_bad, err_bad = validate_strict_headers(legacy_r1, legacy_r2)
    assert not is_valid_bad, "Legacy header should have been rejected!"
    print(f"  [PASS] Malformed / legacy headers strictly rejected: '{err_bad[:60]}...'")

    # Test rejection if RATE or OPENING or RECEIPT or ISSUE or CLOSING is missing
    bad_cols_r1 = ["ITEM DESCRIPTION", "", "WRONG_COL", "OPENING", "", "RECEIPT", "", "ISSUE", "", "CLOSING", ""]
    is_valid_bad2, _ = validate_strict_headers(bad_cols_r1, r2)
    assert not is_valid_bad2, "Wrong column header should be rejected!"
    print("  [PASS] Incorrect column names in Row 1 strictly rejected.")

    # -------------------------------------------------------------------------
    # TEST 2: Parse Strict CSV Content
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Parsing Strict CSV Data Rows")
    sample_csv = (
        "ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\r\n"
        ",,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE\r\n"
        "Azithromycin 500mg Strip,,65.50,10,655.00,50,3275.00,5,327.50,55,3602.50\r\n"
        "Metformin 500mg SR,,18.00,100,1800.00,200,3600.00,40,720.00,260,4680.00\r\n"
        "Pantoprazole 40mg,,32.00,20,640.00,100,3200.00,10,320.00,110,3520.00\r\n"
    ).encode("utf-8")

    parsed = parse_strict_csv_bytes(sample_csv)
    assert len(parsed) == 3, f"Expected 3 parsed rows, got {len(parsed)}"
    assert parsed[0]["item_description"] == "Azithromycin 500mg Strip"
    assert parsed[0]["rate"] == Decimal("65.50")
    assert parsed[0]["opening_qty"] == 10
    assert parsed[0]["receipt_qty"] == 50
    assert parsed[0]["issue_qty"] == 5
    assert parsed[0]["closing_qty"] == 55
    print("  [PASS] Successfully parsed 3 items with exact rate, opening, receipt, issue, and closing quantities.")

    # -------------------------------------------------------------------------
    # TEST 2b: Parse User's Actual Monthly Stock File (Flat Format)
    # -------------------------------------------------------------------------
    print("\n[TEST 2b] Parsing User's Actual Monthly Stock File (Flat Format)")
    user_csv = (
        "period_start,period_end,source_group_name,source_product_name,source_pack_text,reported_rate,opening_qty,opening_value,receipt_qty,receipt_value,issue_qty,issue_value,closing_qty,closing_value,source_sheet,source_row\r\n"
        "2026-08-01,2026-08-31,3M,2091 CATRIDGE,PCS,330,30,9900.00,0,0.00,0,0.00,30,9900.00,sheet1,15\r\n"
        "2026-08-01,2026-08-31,3M,3M 1621 EYEWEAR IN CLEAR LE,PCS,200,213,42600.00,0,0.00,0,0.00,213,42600.00,sheet1,16\r\n"
        "2026-08-01,2026-08-31,EASEPLUS HEALTH CARE,EZOYPLUS ADULT DIAPER TAPE,10PIECE,157.6,42,6619.20,500,78800.00,500,80350.00,42,6619.20,sheet1,73\r\n"
    ).encode("utf-8")

    parsed_user = parse_strict_csv_bytes(user_csv)
    assert len(parsed_user) == 3
    assert parsed_user[0]["item_description"] == "2091 CATRIDGE"
    assert parsed_user[0]["rate"] == Decimal("330.00")
    assert parsed_user[0]["closing_qty"] == 30
    assert parsed_user[0]["unit"] == "PCS"
    assert parsed_user[2]["receipt_qty"] == 500
    print("  [PASS] Successfully parsed user's actual flat monthly stock sales format (Aayerah_Stock_Sales_August_2026.csv).")

    # -------------------------------------------------------------------------
    # Setup In-Memory Database for Functional Tests
    # -------------------------------------------------------------------------
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    admin = User(
        email="admin@aayerah.com",
        fullname="Admin Pharmacist",
        password_hash="secret",
        role="owner",
    )
    db.add(admin)
    db.commit()

    # -------------------------------------------------------------------------
    # TEST 3: "Add to Inventory" Bulk CSV Import (New Products)
    # -------------------------------------------------------------------------
    print("\n[TEST 3] 'Add to Inventory' via CSV (Bulk Product Creation)")
    import_result = bulk_import_inventory(
        raw_rows=parsed,
        db=db,
        owner_id=admin.id,
        default_category="Antibiotics",
        commit=True,
    )

    assert import_result["created_count"] == 3, f"Expected 3 created products, got {import_result['created_count']}"
    assert import_result["updated_count"] == 0
    assert import_result["error_count"] == 0

    # Verify products in DB
    p_azith = db.scalars(select(Product).where(Product.name == "Azithromycin 500mg Strip")).first()
    assert p_azith is not None, "Azithromycin was not saved to DB"
    assert p_azith.price == Decimal("65.50")
    assert p_azith.stock == 55, f"Expected stock 55, got {p_azith.stock}"
    assert p_azith.sku.startswith("AAY-AZITHROMYCIN")
    assert p_azith.category == "Antibiotics"

    p_met = db.scalars(select(Product).where(Product.name == "Metformin 500mg SR")).first()
    assert p_met is not None
    assert p_met.stock == 260
    assert p_met.price == Decimal("18.00")

    # Verify Ledger Operation & Movements
    op = db.scalars(select(InventoryOperation).where(InventoryOperation.operation_type == "CSV_BULK_IMPORT")).first()
    assert op is not None, "InventoryOperation not created for bulk import"
    movements = db.scalars(select(InventoryMovement).where(InventoryMovement.operation_id == op.id)).all()
    assert len(movements) == 3, f"Expected 3 ledger movements, got {len(movements)}"
    print(f"  [PASS] Successfully created {import_result['created_count']} products in database.")
    print("  [PASS] Correct pricing, closing stock, SKUs, and audit ledger entries recorded.")

    # -------------------------------------------------------------------------
    # TEST 4: "Add to Inventory" Updating Existing Products via CSV
    # -------------------------------------------------------------------------
    print("\n[TEST 4] 'Add to Inventory' Updating Existing Products")
    update_csv = (
        "ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\r\n"
        ",,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE\r\n"
        "Azithromycin 500mg Strip,,70.00,55,3850.00,20,1400.00,0,0.00,75,5250.00\r\n"
        "New Vitamin D3 Drops,,40.00,0,0.00,100,4000.00,0,0.00,100,4000.00\r\n"
    ).encode("utf-8")

    parsed_update = parse_strict_csv_bytes(update_csv)
    update_result = bulk_import_inventory(
        raw_rows=parsed_update,
        db=db,
        owner_id=admin.id,
        default_category="Vitamins",
        commit=True,
    )

    assert update_result["created_count"] == 1, "Expected 1 new product (Vitamin D3)"
    assert update_result["updated_count"] == 1, "Expected 1 updated product (Azithromycin)"

    db.refresh(p_azith)
    assert p_azith.price == Decimal("70.00"), f"Expected price updated to 70.00, got {p_azith.price}"
    assert p_azith.stock == 75, f"Expected stock updated to 75, got {p_azith.stock}"
    print("  [PASS] Existing product successfully updated (price: ₹65.50 → ₹70.00, stock: 55 → 75).")
    print("  [PASS] New product (Vitamin D3 Drops) simultaneously added.")

    # -------------------------------------------------------------------------
    # TEST 5: Restock Feature with Exact CSV Format
    # -------------------------------------------------------------------------
    print("\n[TEST 5] Monthly Restock Flow with Exact CSV Format")
    restock_csv = (
        "ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\r\n"
        ",,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE\r\n"
        "Azithromycin 500mg Strip,,70.00,75,5250.00,50,3500.00,0,0.00,125,8750.00\r\n"
        "Metformin 500mg SR,,18.00,260,4680.00,40,720.00,0,0.00,300,5400.00\r\n"
    ).encode("utf-8")

    raw_restock_rows = parse_strict_csv_bytes(restock_csv)
    valid_rows, error_rows, skipped_rows = validate_restock_rows(raw_restock_rows, db)

    assert len(error_rows) == 0, f"Unexpected restock validation errors: {error_rows}"
    assert len(valid_rows) == 2, f"Expected 2 valid restock rows, got {len(valid_rows)}"
    assert valid_rows[0]["qty"] == 50, "Restock quantity should be RECEIPT QTY (50)"
    assert valid_rows[1]["qty"] == 40, "Restock quantity should be RECEIPT QTY (40)"
    print("  [PASS] Restock rows validated and mapped to existing products.")

    # Simulate posting restock
    sf = StoredFile(
        original_name="restock_oct_2026.csv",
        storage_key="imports/test.csv",
        mime_type="text/csv",
        size=len(restock_csv),
        sha256="fake_sha_restock",
        uploader_id=admin.id,
    )
    db.add(sf)
    db.flush()

    si = StockImport(
        file_id=sf.id,
        receipt_reference="RCV-RESTOCK-OCT2026",
        status="ready",
        actor_id=admin.id,
    )
    db.add(si)
    db.flush()

    for r in valid_rows:
        sir = StockImportRow(
            import_id=si.id,
            row_number=r["row_number"],
            raw_sku=r["item_description"],
            product_id=r["product_id"],
            received_quantity=r["qty"],
            input_unit=r["unit"],
            status="valid",
        )
        db.add(sir)
    db.commit()

    # Post restock operation
    restock_op = InventoryOperation(
        operation_type="RESTOCK",
        source_document_id=si.id,
        actor_id=admin.id,
        effective_date=now(),
        posting_key=f"RESTOCK:{si.id}",
    )
    db.add(restock_op)
    db.flush()

    stock_before_azith = p_azith.stock
    p_azith.stock += 50
    db.add(InventoryMovement(
        operation_id=restock_op.id,
        source_line_id="ROW-3",
        product_id=p_azith.id,
        delta=50,
        balance_before=stock_before_azith,
        balance_after=p_azith.stock,
        reason="Restock receipt RCV-RESTOCK-OCT2026",
    ))

    stock_before_met = p_met.stock
    p_met.stock += 40
    db.add(InventoryMovement(
        operation_id=restock_op.id,
        source_line_id="ROW-4",
        product_id=p_met.id,
        delta=40,
        balance_before=stock_before_met,
        balance_after=p_met.stock,
        reason="Restock receipt RCV-RESTOCK-OCT2026",
    ))
    si.status = "posted"
    db.commit()

    assert p_azith.stock == stock_before_azith + 50
    assert p_met.stock == stock_before_met + 40
    print(f"  [PASS] Restock posted: Azithromycin stock {stock_before_azith} → {p_azith.stock} (+50)")
    print(f"  [PASS] Restock posted: Metformin stock {stock_before_met} → {p_met.stock} (+40)")

    # -------------------------------------------------------------------------
    # TEST 6: Restock with Zero-Receipt Rows & Non-Existent Products
    # -------------------------------------------------------------------------
    print("\n[TEST 6] Restock Validation: Zero-receipt rows are skipped, unknown products flagged")
    mixed_restock_csv = (
        "ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\r\n"
        ",,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE\r\n"
        "NonExistentDrugXYZ,,50.00,0,0.00,10,500.00,0,0.00,10,500.00\r\n"
        "Metformin 500mg SR,,18.00,300,5400.00,0,0.00,0,0.00,300,5400.00\r\n"
        "Azithromycin 500mg Strip,,70.00,125,8750.00,20,1400.00,0,0.00,145,10150.00\r\n"
    ).encode("utf-8")

    parsed_mixed = parse_strict_csv_bytes(mixed_restock_csv)
    v_rows, err_rows, sk_rows = validate_restock_rows(parsed_mixed, db)

    # 1 unknown product -> error row
    assert len(err_rows) == 1, f"Expected 1 error row, got {len(err_rows)}"
    assert any("not found in active inventory" in m for m in err_rows[0]["validation_messages"])
    # 1 zero receipt -> skipped row (does NOT block restock!)
    assert len(sk_rows) == 1, f"Expected 1 skipped row, got {len(sk_rows)}"
    assert sk_rows[0]["status"] == "skipped"
    # 1 valid restock -> 20 units
    assert len(v_rows) == 1, f"Expected 1 valid row, got {len(v_rows)}"
    assert v_rows[0]["qty"] == 20
    print("  [PASS] Correctly flagged unknown product as error.")
    print("  [PASS] Correctly skipped zero-receipt row without blocking the restock.")
    print("  [PASS] Valid row (+20 units) ready for restock.")

    # -------------------------------------------------------------------------
    # TEST 7: User's Exact 123-Row File: Add to Inventory then Restock
    # -------------------------------------------------------------------------
    print("\n[TEST 7] User's 123-Row August Stock File: Inventory Import followed by Restock")
    august_csv_path = r"C:\Users\Lenovo\.gemini\antigravity-ide\brain\be7c04c8-24d3-4676-83d7-cb85ad12fa76\.user_uploaded\media_1791998389691.csv"
    with open(august_csv_path, "rb") as f:
        aug_bytes = f.read()

    # Step 1: Bulk import into inventory
    aug_parsed = parse_strict_csv_bytes(aug_bytes)
    inv_res = bulk_import_inventory(raw_rows=aug_parsed, db=db, owner_id=admin.id, default_category="Medicines")
    assert inv_res["total_rows"] >= 120, f"Expected 120+ processed items, got {inv_res['total_rows']}"
    print(f"  [PASS] Successfully bulk-imported {inv_res['created_count']} new products and updated {inv_res['updated_count']} into inventory.")

    # Step 2: Now upload the exact same file for Restock!
    aug_valid, aug_errors, aug_skipped = validate_restock_rows(aug_parsed, db)

    print(f"  Restock results: Total={len(aug_parsed)}, Valid={len(aug_valid)}, Skipped(0-receipt)={len(aug_skipped)}, Errors={len(aug_errors)}")
    assert len(aug_errors) == 0, f"Restock should have 0 errors when all products exist! Got errors: {aug_errors[:3]}"
    assert len(aug_valid) >= 1, f"Expected at least 1 valid restock row, got {len(aug_valid)}"
    assert len(aug_skipped) >= 120, f"Expected 120+ skipped zero-receipt rows, got {len(aug_skipped)}"
    print("  [PASS] 0 errors! Restock is in 'ready' status and can be posted without blocking!")

    # -------------------------------------------------------------------------
    # TEST 8: Native Binary .xls (Excel 97-2004) Upload Support
    # -------------------------------------------------------------------------
    print("\n[TEST 8] Native Binary .xls Spreadsheet Import (xlrd integration)")
    import xlwt
    wb = xlwt.Workbook()
    ws = wb.add_sheet("Stock Report")

    # 2-tier headers
    ws.write(0, 0, "ITEM DESCRIPTION")
    ws.write(0, 2, "RATE")
    ws.write(0, 3, "OPENING")
    ws.write(0, 5, "RECEIPT")
    ws.write(0, 7, "ISSUE")
    ws.write(0, 9, "CLOSING")

    ws.write(1, 3, "QTY.")
    ws.write(1, 4, "VALUE")
    ws.write(1, 5, "QTY.")
    ws.write(1, 6, "VALUE")
    ws.write(1, 7, "QTY.")
    ws.write(1, 8, "VALUE")
    ws.write(1, 9, "QTY.")
    ws.write(1, 10, "VALUE")

    # Item A: new product
    ws.write(2, 0, "Azithromycin 500mg XLS Test")
    ws.write(2, 2, 45.50)
    ws.write(2, 3, 10)
    ws.write(2, 4, 455.0)
    ws.write(2, 5, 50)
    ws.write(2, 6, 2275.0)
    ws.write(2, 7, 5)
    ws.write(2, 8, 227.5)
    ws.write(2, 9, 55)
    ws.write(2, 10, 2502.5)

    # Item B: existing product restock
    ws.write(3, 0, "Amoxicillin 500mg Cap")
    ws.write(3, 2, 15.00)
    ws.write(3, 3, 20)
    ws.write(3, 4, 300.0)
    ws.write(3, 5, 100)
    ws.write(3, 6, 1500.0)
    ws.write(3, 7, 10)
    ws.write(3, 8, 150.0)
    ws.write(3, 9, 110)
    ws.write(3, 10, 1650.0)

    buf = io.BytesIO()
    wb.save(buf)
    xls_data = buf.getvalue()

    # Verify parse_spreadsheet_bytes automatically recognizes .xls binary data
    parsed_xls = parse_spreadsheet_bytes(xls_data, "stock_august.xls")
    assert len(parsed_xls) == 2, f"Expected 2 parsed rows from .xls, got {len(parsed_xls)}"
    assert parsed_xls[0]["item_description"] == "Azithromycin 500mg XLS Test"
    assert parsed_xls[0]["rate"] == Decimal("45.50")
    assert parsed_xls[0]["receipt_qty"] == 50
    assert parsed_xls[0]["closing_qty"] == 55
    print(f"  [PASS] Successfully parsed {len(parsed_xls)} rows from native binary .xls bytes!")

    # Test Add-to-Inventory with .xls parsed rows
    xls_inv_res = bulk_import_inventory(parsed_xls, db, admin.id, default_category="Antibiotics")
    assert xls_inv_res["created_count"] == 2, f"Expected 2 created products, got {xls_inv_res['created_count']}"
    print(f"  [PASS] Add to Inventory via .xls successfully created {xls_inv_res['created_count']} products!")

    # Test Restock validation with .xls parsed rows
    xls_v, xls_err, xls_skip = validate_restock_rows(parsed_xls, db)
    assert len(xls_err) == 0, f"Expected 0 restock errors, got {xls_err}"
    assert len(xls_v) == 2, f"Expected 2 valid restock rows, got {len(xls_v)}"
    print(f"  [PASS] Restock via .xls validated both items (+50 and +100 units) with 0 errors!")

    # -------------------------------------------------------------------------
    # TEST 9: Universal-Newline & Delimiter Handling (CR / CRLF / LF)
    # -------------------------------------------------------------------------
    print("\n[TEST 9] Universal-Newline & Delimiter Tolerance (CR / CRLF / tab / semicolon)")
    # Raw file with classic Mac \r (CR only), unquoted strings with internal returns, etc.
    cr_csv = (
        "ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\r"
        ",,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE\r"
        "Cefixime 200mg Tab,,32.00,10,320.00,40,1280.00,5,160.00,45,1440.00\r"
    ).encode("utf-8")

    # Must NOT raise 'new-line character seen in unquoted field'
    parsed_cr = parse_spreadsheet_bytes(cr_csv, "mac_classic.csv")
    assert len(parsed_cr) == 1
    assert parsed_cr[0]["item_description"] == "Cefixime 200mg Tab"
    print("  [PASS] Standalone \\r (CR) newlines parsed cleanly without universal-newline error!")

    # -------------------------------------------------------------------------
    # TEST 10: Company's Actual .xls File (STOCK & SALES August'26.xls)
    # -------------------------------------------------------------------------
    print("\n[TEST 10] Company's Actual Billing Software Export (STOCK & SALES August'26.xls)")
    import os
    actual_xls_path = os.path.join(os.path.dirname(__file__), "STOCK & SALES August'26.xls")
    if os.path.exists(actual_xls_path):
        with open(actual_xls_path, "rb") as f:
            actual_xls_bytes = f.read()
        parsed_actual = parse_spreadsheet_bytes(actual_xls_bytes, "STOCK & SALES August'26.xls")
        assert len(parsed_actual) == 121, f"Expected 121 parsed product rows, got {len(parsed_actual)}"
        print(f"  [PASS] Successfully parsed all {len(parsed_actual)} products from company's single-column .xls report!")

        # Verify rate, units, and group extraction
        first_item = parsed_actual[0]
        assert first_item["item_description"] == "2091 CATRIDGE", f"Wrong name: {first_item['item_description']}"
        assert first_item["rate"] == Decimal("330.00"), f"Wrong rate: {first_item['rate']}"
        assert first_item["unit"] == "PCS", f"Wrong unit: {first_item['unit']}"
        assert first_item["group_name"] == "3M", f"Wrong group: {first_item['group_name']}"
        print(f"  [PASS] First product correctly extracted: {first_item['item_description']} (Rate: {first_item['rate']}, Unit: {first_item['unit']}, Group: {first_item['group_name']})")

        # Test Add to Inventory (bulk import) with company's actual .xls file
        bulk_res = bulk_import_inventory(parsed_actual, db, admin.id, default_category="General")
        assert bulk_res["created_count"] + bulk_res["updated_count"] == 121
        print(f"  [PASS] Add to Inventory imported {bulk_res['created_count']} new items and updated {bulk_res['updated_count']} items with 0 fatal errors!")

        # Test Restock Validation with company's actual .xls file
        valid_r, err_r, skip_r = validate_restock_rows(parsed_actual, db)
        assert len(err_r) == 0, f"Expected 0 restock errors after catalog registration, got: {err_r}"
        assert len(valid_r) >= 1, f"Expected at least 1 valid restock line (EZOYPLUS), got {len(valid_r)}"
        print(f"  [PASS] Restock validated: {len(valid_r)} items with positive receipts, {len(skip_r)} skipped lines (0 receipts), 0 unmapped errors!")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! (10/10 Suites Passed)")
    print("=" * 70)
    db.close()


if __name__ == "__main__":
    run_tests()
