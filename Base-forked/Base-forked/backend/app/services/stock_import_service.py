"""
Stock Import & Inventory Management Service
-------------------------------------------
Supports both standard pharmaceutical inventory spreadsheet layouts:

Format 1: Strict 2-Tier Layout:
Row 1: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,
Row 2: ,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE

Format 2: Flat Monthly Stock & Sales Layout (e.g. Aayerah_Stock_Sales_August_2026.csv):
period_start,period_end,source_group_name,source_product_name,source_pack_text,reported_rate,opening_qty,opening_value,receipt_qty,receipt_value,issue_qty,issue_value,closing_qty,closing_value,source_sheet,source_row

Supports:
1. Strict format detection & verification
2. Restock parsing & product matching (replenishing existing items via RECEIPT QTY)
3. Bulk "Add to Inventory" (creating new products or updating catalog from CSV)
4. Standard CSV template generation
"""

import csv
import io
import re
import uuid
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from typing import Optional, Tuple, List, Dict, Any

from fastapi import HTTPException
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from ..models import (
    Product,
    InventoryOperation,
    InventoryMovement,
    StockImport,
    StockImportRow,
    StoredFile,
    now,
)

# ─── EXACT REQUIRED FORMAT CONSTANTS ────────────────────────────────────────

EXACT_CSV_TEMPLATE = (
    "ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\r\n"
    ",,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE\r\n"
    "Paracetamol 500mg Strip,,25.00,50,1250.00,100,2500.00,20,500.00,130,3250.00\r\n"
    "Amoxicillin 500mg Capsules,,45.00,30,1350.00,50,2250.00,10,450.00,70,3150.00\r\n"
    "Cetirizine 10mg Tablets,,12.00,100,1200.00,150,1800.00,30,360.00,220,2640.00\r\n"
)

MAX_ROWS = 5000

# ─── KNOWN UNITS used for parsing single-column format ──────────────────────
# Exhaustive unit keywords found in Aayerah billing software exports.
# Order matters: longer / more-specific tokens must come first.
_KNOWN_UNITS = [
    "100PCS", "100PIECE", "100UNIT", "50PCS", "50PIECE", "25PCS", "20PCS",
    "10PCS", "10PIECE", "5PCS", "1PCS",
    "PIECE", "PCS", "PC",
    "STRIP", "BOX", "VIAL", "BOTTLE", "TUBE", "ROLL",
    "UNIT", "SET", "PAIR", "NOS", "EACH", "KIT",
    "BAG", "PACKET", "PKT", "PACK", "JAR", "TIN", "DRUM",
    "LTR", "LITRE", "ML", "KG", "GM", "METER", "MTR",
]

# Pre-compile regex of known unit tokens (longest first so "100PCS" matches before "PCS")
_UNIT_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(u) for u in _KNOWN_UNITS) + r")\b",
    re.IGNORECASE,
)


def generate_inventory_csv_template() -> str:
    """Returns the strict CSV template string."""
    return EXACT_CSV_TEMPLATE


def _clean_str(val: Any) -> str:
    return str(val or "").strip()


def _parse_int(val: Any, default: int = 0) -> int:
    s = _clean_str(val).replace(",", "")
    if not s:
        return default
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return default


def _parse_decimal(val: Any, default: Decimal = Decimal("0.00")) -> Decimal:
    s = _clean_str(val).replace(",", "").replace("₹", "").replace("$", "")
    if not s:
        return default
    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return default


def validate_strict_headers(row1: List[str], row2: List[str]) -> Tuple[bool, Optional[str]]:
    """
    Validates strictly that row 1 and row 2 match the 2-tier header format:
    Row 1: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,
    Row 2: ,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE
    """
    if len(row1) < 10 or len(row2) < 10:
        return False, (
            "Invalid 2-tier CSV structure: Sheet must have at least 10 columns matching:\n"
            "Row 1: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,\n"
            "Row 2: ,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE"
        )

    r1 = [c.strip().upper() for c in row1]
    r2 = [c.strip().upper() for c in row2]

    if not ("ITEM" in r1[0] and "DESC" in r1[0]):
        return False, f"Row 1 Column 1 must be 'ITEM DESCRIPTION' (got '{row1[0]}')"
    if len(r1) <= 2 or r1[2] != "RATE":
        return False, f"Row 1 Column 3 must be 'RATE' (got '{row1[2] if len(row1) > 2 else ''}')"
    if len(r1) <= 3 or r1[3] != "OPENING":
        return False, f"Row 1 Column 4 must be 'OPENING' (got '{row1[3] if len(row1) > 3 else ''}')"
    if len(r1) <= 5 or r1[5] != "RECEIPT":
        return False, f"Row 1 Column 6 must be 'RECEIPT' (got '{row1[5] if len(row1) > 5 else ''}')"
    if len(r1) <= 7 or r1[7] != "ISSUE":
        return False, f"Row 1 Column 8 must be 'ISSUE' (got '{row1[7] if len(row1) > 7 else ''}')"
    if len(r1) <= 9 or r1[9] != "CLOSING":
        return False, f"Row 1 Column 10 must be 'CLOSING' (got '{row1[9] if len(row1) > 9 else ''}')"

    def check_qty(token: str) -> bool:
        return "QTY" in token

    def check_val(token: str) -> bool:
        return "VAL" in token

    if not check_qty(r2[3]):
        return False, f"Row 2 Column 4 must be 'QTY.' under OPENING (got '{row2[3]}')"
    if not check_val(r2[4]):
        return False, f"Row 2 Column 5 must be 'VALUE' under OPENING (got '{row2[4]}')"
    if not check_qty(r2[5]):
        return False, f"Row 2 Column 6 must be 'QTY.' under RECEIPT (got '{row2[5]}')"
    if not check_val(r2[6]):
        return False, f"Row 2 Column 7 must be 'VALUE' under RECEIPT (got '{row2[6]}')"
    if not check_qty(r2[7]):
        return False, f"Row 2 Column 8 must be 'QTY.' under ISSUE (got '{row2[7]}')"
    if not check_val(r2[8]):
        return False, f"Row 2 Column 9 must be 'VALUE' under ISSUE (got '{row2[8]}')"
    if not check_qty(r2[9]):
        return False, f"Row 2 Column 10 must be 'QTY.' under CLOSING (got '{row2[9]}')"
    if len(r2) > 10 and r2[10] and not check_val(r2[10]):
        return False, f"Row 2 Column 11 must be 'VALUE' under CLOSING (got '{row2[10]}')"

    return True, None


def is_flat_stock_csv(header_row: List[str]) -> bool:
    """
    Checks if header row matches standard monthly stock sales CSV format,
    such as Aayerah_Stock_Sales_August_2026.csv.
    """
    if not header_row:
        return False
    h_set = {c.strip().lower().replace(" ", "_") for c in header_row if c}
    has_product = any(k in h_set for k in [
        "source_product_name", "product_name", "item_description", "item_name", "item", "product"
    ])
    has_rate = any(k in h_set for k in [
        "reported_rate", "rate", "price", "unit_price", "mrp"
    ])
    has_qty = any(k in h_set for k in [
        "closing_qty", "opening_qty", "receipt_qty", "issue_qty", "stock"
    ])
    return has_product and (has_rate or has_qty)


def _parse_2tier_rows(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """Extracts rows from 2-tier format (starting from line 3)."""
    parsed_rows = []
    for line_idx, cols in enumerate(rows[2:], start=3):
        if line_idx - 2 > MAX_ROWS:
            raise HTTPException(422, f"Spreadsheet exceeds {MAX_ROWS} row limit.")

        if not cols or all(not str(c).strip() for c in cols):
            continue

        item_desc = _clean_str(cols[0]) if len(cols) > 0 else ""
        col1 = _clean_str(cols[1]) if len(cols) > 1 else ""
        rate_raw = _clean_str(cols[2]) if len(cols) > 2 else ""
        opening_qty_raw = _clean_str(cols[3]) if len(cols) > 3 else ""
        opening_val_raw = _clean_str(cols[4]) if len(cols) > 4 else ""
        receipt_qty_raw = _clean_str(cols[5]) if len(cols) > 5 else ""
        receipt_val_raw = _clean_str(cols[6]) if len(cols) > 6 else ""
        issue_qty_raw = _clean_str(cols[7]) if len(cols) > 7 else ""
        issue_val_raw = _clean_str(cols[8]) if len(cols) > 8 else ""
        closing_qty_raw = _clean_str(cols[9]) if len(cols) > 9 else ""
        closing_val_raw = _clean_str(cols[10]) if len(cols) > 10 else ""

        parsed_rows.append({
            "row_number": line_idx,
            "item_description": item_desc,
            "col1": col1,
            "group_name": "",
            "rate_raw": rate_raw,
            "rate": _parse_decimal(rate_raw),
            "opening_qty_raw": opening_qty_raw,
            "opening_qty": _parse_int(opening_qty_raw),
            "opening_value": _parse_decimal(opening_val_raw),
            "receipt_qty_raw": receipt_qty_raw,
            "receipt_qty": _parse_int(receipt_qty_raw),
            "receipt_value": _parse_decimal(receipt_val_raw),
            "issue_qty_raw": issue_qty_raw,
            "issue_qty": _parse_int(issue_qty_raw),
            "issue_value": _parse_decimal(issue_val_raw),
            "closing_qty_raw": closing_qty_raw,
            "closing_qty": _parse_int(closing_qty_raw),
            "closing_value": _parse_decimal(closing_val_raw),
            "sku": item_desc,
            "qty": _parse_int(receipt_qty_raw),
            "unit": col1 or "unit",
        })
    return parsed_rows


def _parse_flat_rows(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """Extracts rows from flat monthly stock & sales format (starting from line 2)."""
    header = [c.strip().lower().replace(" ", "_") for c in rows[0]]
    col_map = {col: idx for idx, col in enumerate(header)}

    # Map column positions dynamically
    name_idx = None
    for k in ["source_product_name", "product_name", "item_description", "item_name", "product", "item"]:
        if k in col_map:
            name_idx = col_map[k]
            break

    pack_idx = None
    for k in ["source_pack_text", "pack_text", "pack", "unit", "packaging"]:
        if k in col_map:
            pack_idx = col_map[k]
            break

    group_idx = None
    for k in ["source_group_name", "group_name", "brand", "company", "manufacturer", "category"]:
        if k in col_map:
            group_idx = col_map[k]
            break

    rate_idx = None
    for k in ["reported_rate", "rate", "price", "unit_price", "mrp"]:
        if k in col_map:
            rate_idx = col_map[k]
            break

    open_idx = None
    for k in ["opening_qty", "opening", "open_qty"]:
        if k in col_map:
            open_idx = col_map[k]
            break

    open_val_idx = None
    for k in ["opening_value", "open_val"]:
        if k in col_map:
            open_val_idx = col_map[k]
            break

    rx_idx = None
    for k in ["receipt_qty", "receipt", "restock_qty", "received_qty"]:
        if k in col_map:
            rx_idx = col_map[k]
            break

    rx_val_idx = None
    for k in ["receipt_value", "rx_val"]:
        if k in col_map:
            rx_val_idx = col_map[k]
            break

    issue_idx = None
    for k in ["issue_qty", "issue", "dispatch_qty", "sales_qty"]:
        if k in col_map:
            issue_idx = col_map[k]
            break

    issue_val_idx = None
    for k in ["issue_value", "issue_val"]:
        if k in col_map:
            issue_val_idx = col_map[k]
            break

    close_idx = None
    for k in ["closing_qty", "closing", "closing_stock", "stock"]:
        if k in col_map:
            close_idx = col_map[k]
            break

    close_val_idx = None
    for k in ["closing_value", "closing_val"]:
        if k in col_map:
            close_val_idx = col_map[k]
            break

    if name_idx is None:
        raise HTTPException(422, "CSV is missing product name column (e.g. 'source_product_name' or 'ITEM DESCRIPTION').")

    parsed_rows = []
    for line_idx, cols in enumerate(rows[1:], start=2):
        if line_idx - 1 > MAX_ROWS:
            raise HTTPException(422, f"Spreadsheet exceeds {MAX_ROWS} row limit.")

        if not cols or all(not str(c).strip() for c in cols):
            continue

        item_desc = _clean_str(cols[name_idx]) if len(cols) > name_idx else ""
        pack = _clean_str(cols[pack_idx]) if (pack_idx is not None and len(cols) > pack_idx) else ""
        group = _clean_str(cols[group_idx]) if (group_idx is not None and len(cols) > group_idx) else ""
        rate_raw = _clean_str(cols[rate_idx]) if (rate_idx is not None and len(cols) > rate_idx) else ""
        opening_qty_raw = _clean_str(cols[open_idx]) if (open_idx is not None and len(cols) > open_idx) else ""
        opening_val_raw = _clean_str(cols[open_val_idx]) if (open_val_idx is not None and len(cols) > open_val_idx) else ""
        receipt_qty_raw = _clean_str(cols[rx_idx]) if (rx_idx is not None and len(cols) > rx_idx) else ""
        receipt_val_raw = _clean_str(cols[rx_val_idx]) if (rx_val_idx is not None and len(cols) > rx_val_idx) else ""
        issue_qty_raw = _clean_str(cols[issue_idx]) if (issue_idx is not None and len(cols) > issue_idx) else ""
        issue_val_raw = _clean_str(cols[issue_val_idx]) if (issue_val_idx is not None and len(cols) > issue_val_idx) else ""
        closing_qty_raw = _clean_str(cols[close_idx]) if (close_idx is not None and len(cols) > close_idx) else ""
        closing_val_raw = _clean_str(cols[close_val_idx]) if (close_val_idx is not None and len(cols) > close_val_idx) else ""

        parsed_rows.append({
            "row_number": line_idx,
            "item_description": item_desc,
            "col1": pack,
            "group_name": group,
            "rate_raw": rate_raw,
            "rate": _parse_decimal(rate_raw),
            "opening_qty_raw": opening_qty_raw,
            "opening_qty": _parse_int(opening_qty_raw),
            "opening_value": _parse_decimal(opening_val_raw),
            "receipt_qty_raw": receipt_qty_raw,
            "receipt_qty": _parse_int(receipt_qty_raw),
            "receipt_value": _parse_decimal(receipt_val_raw),
            "issue_qty_raw": issue_qty_raw,
            "issue_qty": _parse_int(issue_qty_raw),
            "issue_value": _parse_decimal(issue_val_raw),
            "closing_qty_raw": closing_qty_raw,
            "closing_qty": _parse_int(closing_qty_raw),
            "closing_value": _parse_decimal(closing_val_raw),
            "sku": item_desc,
            "qty": _parse_int(receipt_qty_raw),
            "unit": pack or "unit",
        })
    return parsed_rows


# ─── SINGLE-COLUMN AAYERAH STOCK & SALES PARSER ────────────────────────────

def _is_single_column_stock_sales(rows: List[List[str]]) -> bool:
    """
    Detects the Aayerah billing-software .xls format where ALL data lives in a
    single column (column 0) as space-delimited text.  Heuristic:
    • Every row has exactly 1 non-empty column.
    • At least one row contains "STOCK & SALES" or "ITEM DESCRIPTION".
    • At least one row contains "QTY." and "VALUE".
    """
    if not rows:
        return False

    # Check that the majority of rows have only 1 column
    single_col_count = sum(1 for r in rows if len(r) == 1 or (len(r) > 1 and all(not c.strip() for c in r[1:])))
    if single_col_count < len(rows) * 0.8:
        return False

    text_blob = " ".join(r[0] for r in rows[:30] if r)
    upper = text_blob.upper().replace("\xa0", " ")
    has_stock_sales = "STOCK" in upper and "SALES" in upper
    has_item_desc = "ITEM DESCRIPTION" in upper or "ITEM DESC" in upper
    has_qty_value = "QTY" in upper and "VALUE" in upper
    return (has_stock_sales or has_item_desc) and has_qty_value


# Regex: 8 numeric fields (QTY VALUE ×4) at the end of a line.
# Each QTY is integer or "-".  Each VALUE is decimal or "0.00".
# Captures the 8 numbers as groups.
_DATA_TAIL_RE = re.compile(
    r"(?P<tail>"
    r"(?P<oq>-|\d[\d,]*)[\s\xa0]+"          # opening qty
    r"(?P<ov>-|\d[\d,]*\.?\d*)[\s\xa0]+"     # opening value
    r"(?P<rq>-|\d[\d,]*)[\s\xa0]+"           # receipt qty
    r"(?P<rv>-|\d[\d,]*\.?\d*)[\s\xa0]+"     # receipt value
    r"(?P<iq>-|\d[\d,]*)[\s\xa0]+"           # issue qty
    r"(?P<iv>-|\d[\d,]*\.?\d*)[\s\xa0]+"     # issue value
    r"(?P<cq>-|\d[\d,]*)[\s\xa0]+"           # closing qty
    r"(?P<cv>-|\d[\d,]*\.?\d*)"              # closing value
    r")\s*$"
)


def _parse_dash_or_int(val: str) -> int:
    """Converts '-' to 0, otherwise parses an int."""
    val = val.strip().replace(",", "")
    if val in ("-", ""):
        return 0
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def _parse_dash_or_decimal(val: str) -> Decimal:
    """Converts '-' to 0.00, otherwise parses a Decimal."""
    val = val.strip().replace(",", "")
    if val in ("-", ""):
        return Decimal("0.00")
    try:
        return Decimal(val).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0.00")


def _parse_single_column_stock_sales(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """
    Parses the Aayerah billing-software single-column .xls format.

    Structure per row (all in column 0, separated by spaces / \\xa0):
      - Header rows:  AAYERAH PHARMACEUTICALS... , STOCK & SALES ANALYSIS...
      - Column labels: ITEM DESCRIPTION  RATE  OPENING ...
      - Sub-labels:                      QTY.  VALUE  QTY. VALUE ...
      - Dashes:  --------------------------------------------------------
      - Group header (brand):  3M | AISHWARYA PHARMA | BD | ...
      - Product row:  ITEM_NAME  UNIT  RATE  OQ  OV  RQ  RV  IQ  IV  CQ  CV
      - TOTAL row (per group or grand):  TOTAL  ... numbers ...
      - Page break:  Continued  /  Page  /  AAYERAH PHARMACEUTICALS...
    """
    parsed = []
    current_group = ""
    row_counter = 0

    for orig_idx, r in enumerate(rows):
        text = r[0] if r else ""
        # Normalize non-breaking spaces to regular spaces
        line = text.replace("\xa0", " ").strip()

        if not line:
            continue

        upper = line.upper()

        # ── Skip known non-data lines ──
        # Decorative dashes
        if re.match(r"^-{5,}$", line):
            continue
        # Company header / page break indicators
        if "AAYERAH PHARMACEUTICALS" in upper:
            continue
        if "PLOT NO" in upper or "PHONE" in upper or "GSTIN" in upper or "E-MAIL" in upper:
            continue
        if "STOCK & SALES" in upper or "STOCK AND SALES" in upper:
            continue
        if upper.strip() in ("CONTINUED", "PAGE") or upper.strip().startswith("PAGE"):
            continue
        # Column header lines
        if "ITEM DESCRIPTION" in upper:
            continue
        if re.match(r"^\s*QTY\b", upper) and "VALUE" in upper:
            continue

        # ── TOTAL line — skip ──
        if re.match(r"^\s*TOTAL\b", upper):
            continue

        # ── Try to parse as a product data line ──
        m = _DATA_TAIL_RE.search(line)
        if m:
            row_counter += 1
            if row_counter > MAX_ROWS:
                raise HTTPException(422, f"Spreadsheet exceeds {MAX_ROWS} row limit.")

            # Everything before the 8-number tail is: ITEM_NAME  UNIT  RATE
            prefix = line[: m.start()].strip()

            # Extract RATE (last number in the prefix)
            rate_match = re.search(r"([\d,]+\.?\d*)\s*$", prefix)
            rate_raw = ""
            if rate_match:
                rate_raw = rate_match.group(1)
                prefix = prefix[: rate_match.start()].strip()

            # Extract UNIT (known unit token at the end of the remaining prefix)
            unit = "unit"
            unit_match = _UNIT_PATTERN.search(prefix)
            if unit_match:
                # Take the last match (closest to the end) as the unit
                all_unit_matches = list(_UNIT_PATTERN.finditer(prefix))
                last_unit = all_unit_matches[-1]
                unit = last_unit.group(0).upper()
                # Item description is everything before the unit token
                item_desc = prefix[: last_unit.start()].strip()
                # If there's trailing text after the unit but before rate, append it to item_desc
                after_unit = prefix[last_unit.end():].strip()
                if after_unit:
                    item_desc = item_desc + " " + after_unit if item_desc else after_unit
            else:
                item_desc = prefix

            # Clean up item description
            item_desc = re.sub(r"\s{2,}", " ", item_desc).strip()

            if not item_desc:
                continue

            oq = _parse_dash_or_int(m.group("oq"))
            ov = _parse_dash_or_decimal(m.group("ov"))
            rq = _parse_dash_or_int(m.group("rq"))
            rv = _parse_dash_or_decimal(m.group("rv"))
            iq = _parse_dash_or_int(m.group("iq"))
            iv = _parse_dash_or_decimal(m.group("iv"))
            cq = _parse_dash_or_int(m.group("cq"))
            cv = _parse_dash_or_decimal(m.group("cv"))

            parsed.append({
                "row_number": orig_idx + 1,
                "item_description": item_desc,
                "col1": unit,
                "group_name": current_group,
                "rate_raw": rate_raw,
                "rate": _parse_decimal(rate_raw),
                "opening_qty_raw": m.group("oq"),
                "opening_qty": oq,
                "opening_value": ov,
                "receipt_qty_raw": m.group("rq"),
                "receipt_qty": rq,
                "receipt_value": rv,
                "issue_qty_raw": m.group("iq"),
                "issue_qty": iq,
                "issue_value": iv,
                "closing_qty_raw": m.group("cq"),
                "closing_qty": cq,
                "closing_value": cv,
                "sku": item_desc,
                "qty": rq,
                "unit": unit,
            })
        else:
            # ── Group header (brand/manufacturer name) ──
            # A short line with only letters, spaces, hyphens, dots, and no numbers
            # at the data-field positions is a group header.
            stripped = line.strip()
            if stripped and not re.search(r"\d", stripped) and len(stripped) < 80:
                current_group = stripped
            elif stripped and re.match(r"^[\w\s\-\.&,/()]+$", stripped) and len(stripped) < 80:
                # Could be a group with numbers (e.g. "3M")
                # Only treat as group if it has no decimal or large numbers
                if not re.search(r"\d{3,}", stripped) and "." not in stripped:
                    current_group = stripped

    return parsed


def _parse_rows_from_matrix(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """Takes a 2D matrix of string cells and parses either 2-tier, flat, or single-column stock format."""
    clean_rows = []
    for r in rows:
        if r and any(str(v).strip() for v in r):
            clean_rows.append([str(v).strip() if v is not None else "" for v in r])

    if not clean_rows:
        raise HTTPException(422, "Spreadsheet contains no data rows.")

    # 0. Try single-column Aayerah billing software format
    if _is_single_column_stock_sales(clean_rows):
        result = _parse_single_column_stock_sales(clean_rows)
        if result:
            return result

    # 1. Try 2-tier format
    if len(clean_rows) >= 2:
        is_2tier, _ = validate_strict_headers(clean_rows[0], clean_rows[1])
        if is_2tier:
            return _parse_2tier_rows(clean_rows)

    # 2. Try flat stock format (e.g. Aayerah_Stock_Sales_August_2026.csv)
    if is_flat_stock_csv(clean_rows[0]):
        return _parse_flat_rows(clean_rows)

    # 3. Last resort: try single-column even if heuristic didn't fire
    #    (handles edge cases where header text is slightly different)
    single_col = _parse_single_column_stock_sales(clean_rows)
    if single_col:
        return single_col

    # Detailed error explanation
    _, err_msg = validate_strict_headers(clean_rows[0], clean_rows[1] if len(clean_rows) > 1 else [])
    raise HTTPException(
        422,
        f"Header format validation failed: {err_msg or 'Columns not recognized'}.\n\n"
        "Supported formats:\n"
        "• Aayerah Stock & Sales Analysis report (.xls from billing software)\n"
        "• Monthly Stock & Sales Report (.xls, .xlsx, or .csv)\n"
        "• 2-Tier Inventory Template (Row 1: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,)"
    )


def _parse_html_or_xml_table(raw: bytes) -> List[List[str]]:
    """Extracts rows from HTML/XML tables (common when billing/pharma software exports .xls)."""
    text = raw.decode("utf-8", errors="replace")
    tr_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', text, re.DOTALL | re.IGNORECASE)
    rows = []
    for tr in tr_matches:
        td_matches = re.findall(r'<(?:td|th)[^>]*>(.*?)</(?:td|th)>', tr, re.DOTALL | re.IGNORECASE)
        cleaned_cells = [re.sub(r'<[^>]+>', '', cell).strip() for cell in td_matches]
        if any(cleaned_cells):
            rows.append(cleaned_cells)
    return rows


def parse_strict_xls_bytes(raw: bytes) -> List[Dict[str, Any]]:
    """
    Parses legacy Excel .xls bytes (BIFF8 / Excel 97-2004 format) using xlrd,
    or HTML table if the .xls is an HTML export from accounting software.
    """
    # 1. Check if it's an HTML or XML table saved with .xls extension
    if b"<table" in raw[:2048].lower() or b"<html" in raw[:2048].lower() or b"<?xml" in raw[:2048].lower():
        rows = _parse_html_or_xml_table(raw)
        if rows:
            return _parse_rows_from_matrix(rows)

    # 2. Try native xlrd
    try:
        import xlrd
        wb = xlrd.open_workbook(file_contents=raw)
        sheet = wb.sheet_by_index(0)
        rows = []
        for r_idx in range(sheet.nrows):
            r = []
            for c_idx in range(sheet.ncols):
                val = sheet.cell_value(r_idx, c_idx)
                if isinstance(val, float) and val.is_integer():
                    val = str(int(val))
                elif val is not None:
                    val = str(val).strip()
                else:
                    val = ""
                r.append(val)
            if any(v for v in r):
                rows.append(r)
        if rows:
            return _parse_rows_from_matrix(rows)
    except Exception as exc:
        raise HTTPException(422, f"Could not parse .xls spreadsheet: {exc}")

    raise HTTPException(422, "Excel .xls file contains no data.")


def parse_strict_xlsx_bytes(raw: bytes) -> List[Dict[str, Any]]:
    """Parses Excel XLSX bytes supporting both 2-tier and flat formats."""
    try:
        import openpyxl  # type: ignore
    except ImportError:
        raise HTTPException(500, "openpyxl not installed.")

    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)

        rows = []
        for r in rows_iter:
            if r and any(v is not None and str(v).strip() for v in r):
                rows.append([str(v) if v is not None else "" for v in r])
        wb.close()
        return _parse_rows_from_matrix(rows)
    except Exception as exc:
        raise HTTPException(422, f"Could not parse .xlsx spreadsheet: {exc}")


def parse_strict_csv_bytes(raw: bytes) -> List[Dict[str, Any]]:
    """
    Parses CSV bytes with universal newline normalization (\r\n, \r, \n)
    and automatic delimiter sniffing (, ; \t).
    """
    # Universal newline normalization prevents 'new-line character in unquoted field' error
    text = raw.decode("utf-8-sig", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    lines = [line for line in text.split("\n") if line.strip()]
    if not lines:
        raise HTTPException(422, "Spreadsheet is empty.")

    # Auto-detect delimiter
    delim = ","
    if lines and "\t" in lines[0] and "," not in lines[0]:
        delim = "\t"
    elif lines and ";" in lines[0] and "," not in lines[0]:
        delim = ";"

    reader = list(csv.reader(lines, delimiter=delim))
    return _parse_rows_from_matrix(reader)


def parse_spreadsheet_bytes(raw: bytes, filename: str = "") -> List[Dict[str, Any]]:
    """
    Unified entrypoint that automatically determines file format (.xls, .xlsx, .csv)
    by magic signature and/or file extension with full fallback resilience.
    """
    fname_lower = (filename or "").lower()

    # 1. Check magic signature:
    # OLE / CFB magic (legacy .xls binary)
    if raw.startswith(b"\xd0\xcf\x11\xe0"):
        return parse_strict_xls_bytes(raw)
    # ZIP magic (.xlsx OpenXML)
    if raw.startswith(b"PK\x03\x04"):
        return parse_strict_xlsx_bytes(raw)
    # HTML/XML table exported as .xls or .csv
    if b"<table" in raw[:2048].lower() or b"<html" in raw[:2048].lower() or b"<?xml" in raw[:2048].lower():
        return parse_strict_xls_bytes(raw)

    # 2. Check extension if available
    if fname_lower.endswith(".xls"):
        try:
            return parse_strict_xls_bytes(raw)
        except Exception:
            pass
    elif fname_lower.endswith(".xlsx"):
        try:
            return parse_strict_xlsx_bytes(raw)
        except Exception:
            pass

    # 3. Fallback to CSV parser (with universal newlines)
    try:
        return parse_strict_csv_bytes(raw)
    except Exception as csv_err:
        # If CSV parser failed, try xls or xlsx in case format was misnamed
        try:
            return parse_strict_xls_bytes(raw)
        except Exception:
            pass
        try:
            return parse_strict_xlsx_bytes(raw)
        except Exception:
            pass
        raise csv_err


# ─── RESTOCK VALIDATION ─────────────────────────────────────────────────────

def validate_restock_rows(
    rows: List[Dict[str, Any]], db: Session
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Validates parsed rows for Monthly Restock.
    Matches product by SKU or Product Name.
    
    Returns: (valid_rows, error_rows, skipped_rows)
    - valid_rows: products found in DB with positive restock quantity to post
    - error_rows: products missing from catalog or unparseable names (needs review)
    - skipped_rows: lines with 0 receipts in this report period (informational, does not block posting)
    """
    valid, errors, skipped = [], [], []

    # Check if this sheet uses receipt_qty or closing_qty for restock
    has_any_positive_receipt = any(r.get("receipt_qty", 0) > 0 for r in rows)

    # Pre-fetch all active products for ultra-fast and flexible matching
    all_products = db.scalars(select(Product).where(Product.active.is_(True))).all()
    name_map = {p.name.strip().lower(): p for p in all_products}
    sku_map = {p.sku.strip().lower(): p for p in all_products if p.sku}
    slug_map = {re.sub(r"[^A-Za-z0-9]+", "", p.name).lower(): p for p in all_products}
    sku_slug_map = {re.sub(r"[^A-Za-z0-9]+", "", p.sku).lower(): p for p in all_products if p.sku}

    for r in rows:
        item_desc = r.get("item_description", "").strip()
        row_num = r.get("row_number", "?")

        if not item_desc:
            errors.append({
                **r,
                "sku": "",
                "validation_messages": ["Missing product name / ITEM DESCRIPTION."],
                "status": "error"
            })
            continue

        # Determine restock quantity:
        # If the file has positive receipt_qty values (like Aayerah_Stock_Sales_August_2026.csv),
        # use receipt_qty. If all receipt_qty are 0 but closing_qty > 0, fallback to closing_qty.
        if has_any_positive_receipt:
            qty_to_restock = r.get("receipt_qty", 0)
        else:
            qty_to_restock = r.get("closing_qty", 0) if r.get("closing_qty", 0) > 0 else r.get("receipt_qty", 0)

        # Match product in DB
        norm_name = item_desc.lower()
        slug_name = re.sub(r"[^A-Za-z0-9]+", "", item_desc).lower()

        product = (
            name_map.get(norm_name)
            or sku_map.get(norm_name)
            or slug_map.get(slug_name)
            or sku_slug_map.get(slug_name)
        )

        if not product:
            errors.append({
                **r,
                "sku": item_desc,
                "validation_messages": [
                    f"Product '{item_desc}' not found in active inventory. "
                    "Use 'Add to Inventory' to register new products before restocking."
                ],
                "status": "error"
            })
            continue

        # If quantity to restock is <= 0 (e.g. 0 receipts in this monthly report):
        # Treat as skipped line rather than a fatal error that blocks the whole restock!
        if qty_to_restock <= 0:
            skipped.append({
                **r,
                "sku": product.sku or item_desc,
                "product_id": product.id,
                "product_name": product.name,
                "current_stock": product.stock,
                "qty": 0,
                "unit": r.get("unit") or product.stock_unit or "unit",
                "validation_messages": ["No restock quantity in this report period (0). Line skipped."],
                "status": "skipped"
            })
            continue

        # Positive restock line
        valid.append({
            **r,
            "sku": product.sku or item_desc,
            "product_id": product.id,
            "product_name": product.name,
            "current_stock": product.stock,
            "qty": qty_to_restock,
            "unit": r.get("unit") or product.stock_unit or "unit",
            "validation_messages": [],
            "status": "valid"
        })

    return valid, errors, skipped


# ─── BULK "ADD TO INVENTORY" SERVICE ────────────────────────────────────────

def _generate_sku(name: str, db: Session, existing_skus: set) -> str:
    """Generates a clean, unique SKU like AAY-2091-CATRIDGE."""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()
    if not slug:
        slug = f"PROD-{uuid.uuid4().hex[:6].upper()}"
    base_sku = f"AAY-{slug[:24]}"
    candidate = base_sku
    counter = 1
    while candidate in existing_skus or db.scalars(select(Product.id).where(Product.sku == candidate)).first():
        candidate = f"{base_sku}-{counter:02d}"
        counter += 1
    existing_skus.add(candidate)
    return candidate


def bulk_import_inventory(
    raw_rows: List[Dict[str, Any]],
    db: Session,
    owner_id: str,
    default_category: str = "General",
    commit: bool = True,
) -> Dict[str, Any]:
    """
    Takes parsed rows and imports them as new products into inventory.
    If a product already exists (by name or SKU), updates its price and adds/sets stock.
    Creates audit ledger movements.
    """
    created_products = []
    updated_products = []
    validation_errors = []

    existing_skus = set(db.scalars(select(Product.sku).where(Product.sku.isnot(None))).all())

    # Pre-fetch existing products by name for fast lookup
    all_products = db.scalars(select(Product).where(Product.active.is_(True))).all()
    name_to_product = {p.name.strip().lower(): p for p in all_products}
    sku_to_product = {p.sku.strip().lower(): p for p in all_products if p.sku}

    for r in raw_rows:
        item_desc = r.get("item_description", "").strip()
        row_num = r.get("row_number", "?")

        if not item_desc:
            validation_errors.append({"row": row_num, "item": "", "message": "Missing product name."})
            continue

        rate = r.get("rate")
        if rate is None or rate < 0:
            rate = Decimal("0.00")

        opening_qty = r.get("opening_qty", 0)
        receipt_qty = r.get("receipt_qty", 0)
        issue_qty = r.get("issue_qty", 0)
        closing_qty = r.get("closing_qty", 0)

        # Compute stock safely (guaranteed >= 0 to satisfy CheckConstraint('stock >= 0'))
        if r.get("closing_qty_raw", "").strip():
            initial_stock = max(0, closing_qty)
        else:
            initial_stock = max(0, opening_qty + receipt_qty - issue_qty)

        # Category from group_name (e.g. 3M, EASEPLUS, etc.) or default_category
        group_name = r.get("group_name", "").strip()
        category = default_category if default_category and default_category != "General" else (group_name or default_category or "General")

        unit = r.get("unit") or r.get("col1") or "unit"

        # Check if product already exists
        existing = name_to_product.get(item_desc.lower()) or sku_to_product.get(item_desc.lower())

        if existing:
            # Update existing product
            old_stock = existing.stock
            old_price = existing.price
            if commit:
                if rate > 0:
                    existing.price = rate
                if r.get("closing_qty_raw", "").strip():
                    existing.stock = initial_stock
                elif receipt_qty > 0:
                    existing.stock = old_stock + receipt_qty
                existing.stock_version += 1

            updated_products.append({
                "row": row_num,
                "id": existing.id,
                "name": existing.name,
                "sku": existing.sku,
                "old_price": float(old_price),
                "new_price": float(rate) if rate > 0 else float(old_price),
                "old_stock": old_stock,
                "new_stock": existing.stock if commit else initial_stock,
                "category": existing.category,
                "action": "updated",
            })
        else:
            # Create new product
            sku = _generate_sku(item_desc, db, existing_skus)
            desc_prefix = f"Manufacturer/Brand: {group_name}. " if group_name else ""
            new_p = Product(
                name=item_desc,
                sku=sku,
                price=rate,
                stock=initial_stock,
                category=category,
                description=f"{item_desc}. {desc_prefix}Trusted pharmaceutical supply. Aayerah Labs.",
                owner_id=owner_id,
                stock_unit=unit,
                active=True,
            )
            if commit:
                db.add(new_p)
                db.flush()
                # Update local lookup so duplicates in the same file update rather than conflict
                name_to_product[item_desc.lower()] = new_p
                sku_to_product[sku.lower()] = new_p

            created_products.append({
                "row": row_num,
                "id": new_p.id if commit else None,
                "name": item_desc,
                "sku": sku,
                "price": float(rate),
                "stock": initial_stock,
                "category": category,
                "action": "created",
            })

    if commit:
        op = InventoryOperation(
            operation_type="CSV_BULK_IMPORT",
            source_document_id=f"BULK-{uuid.uuid4().hex[:8].upper()}",
            actor_id=owner_id,
            effective_date=now(),
            posting_key=f"BULK_IMPORT:{uuid.uuid4()}",
        )
        db.add(op)
        db.flush()

        for p_info in created_products:
            if p_info["stock"] > 0:
                db.add(InventoryMovement(
                    operation_id=op.id,
                    source_line_id=f"ROW-{p_info['row']}",
                    product_id=p_info["id"],
                    delta=p_info["stock"],
                    balance_before=0,
                    balance_after=p_info["stock"],
                    reason=f"Initial stock via CSV Bulk Import (Row {p_info['row']})",
                ))

        for p_info in updated_products:
            delta = p_info["new_stock"] - p_info["old_stock"]
            if delta != 0:
                db.add(InventoryMovement(
                    operation_id=op.id,
                    source_line_id=f"ROW-{p_info['row']}",
                    product_id=p_info["id"],
                    delta=delta,
                    balance_before=p_info["old_stock"],
                    balance_after=p_info["new_stock"],
                    reason=f"Stock updated via CSV Bulk Import (Row {p_info['row']})",
                ))

        db.commit()

    return {
        "status": "success" if commit else "preview",
        "total_rows": len(raw_rows),
        "created_count": len(created_products),
        "updated_count": len(updated_products),
        "error_count": len(validation_errors),
        "created": created_products,
        "updated": updated_products,
        "errors": validation_errors,
    }
