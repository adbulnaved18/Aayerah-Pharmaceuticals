"""
Invoice Extraction Service
--------------------------
• PDF  → pypdf text extraction → regex field parsing
• Image → Google Gemini Vision API → structured JSON → product matching

Requires GEMINI_API_KEY in .env for image extraction.
"""

import difflib
import io
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Any

from PIL import Image
from sqlalchemy.orm import Session

from ..models import Product, ProductUnitConversion


# ─── PDF helpers ─────────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_bytes: bytes) -> tuple[str, int]:
    """Extracts text across all pages using pypdf and returns (text, page_count)."""
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page_count = len(reader.pages)
    if page_count > 10:
        raise ValueError(f"Invoice exceeds 10-page limit ({page_count} pages found).")

    extracted_pages = []
    for idx, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        extracted_pages.append(f"--- PAGE {idx + 1} ---\n{page_text}")

    return "\n\n".join(extracted_pages), page_count


# ─── Image helpers ────────────────────────────────────────────────────────────

def validate_image(image_bytes: bytes) -> tuple[int, int, str]:
    """Validates image integrity and returns (width, height, format)."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
        with Image.open(io.BytesIO(image_bytes)) as img:
            return img.width, img.height, img.format or "IMAGE"
    except Exception as exc:
        raise ValueError(f"Malformed or unsupported image file: {exc}")


# ─── Date helpers ─────────────────────────────────────────────────────────────

def parse_date_string(raw: str) -> Optional[datetime]:
    """Attempts to parse varied date formats into UTC datetime."""
    raw = raw.strip()
    patterns = [
        r"%Y-%m-%d",
        r"%d/%m/%Y",
        r"%d-%m-%Y",
        r"%d.%m.%Y",
        r"%d %B %Y",
        r"%d %b %Y",
        r"%B %d, %Y",
        r"%b %d, %Y",
    ]
    for fmt in patterns:
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ─── Regex-based field extraction (used for PDFs) ────────────────────────────

def extract_invoice_fields(text: str) -> dict[str, Any]:
    """
    Extracts invoice metadata, totals, and line items using regex patterns.
    Used for PDF text extraction.
    """
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    full_text = "\n".join(lines)

    # 1. Invoice Number extraction
    inv_num = None
    inv_patterns = [
        r"(?:invoice\s*(?:no|number|#|ref)?[:.\s-]*)([A-Za-z0-9\/-]{3,30})",
        r"(?:bill\s*(?:no|number|#)?[:.\s-]*)([A-Za-z0-9\/-]{3,30})",
        r"(?:inv\s*#?[:.\s-]*)([A-Za-z0-9\/-]{3,30})",
        r"\b(AA-\d{4}-\d{4,6})\b",
        r"\b(INV-\d{4}-\d{3,6})\b",
    ]
    for pat in inv_patterns:
        match = re.search(pat, full_text, re.IGNORECASE)
        if match:
            cand = match.group(1).strip()
            if cand.lower() not in ("date", "details", "to", "from", "for"):
                inv_num = cand
                break

    # 2. Date extraction
    inv_date = None
    date_patterns = [
        r"(?:date|invoice\s*date|dated)[:.\s-]*(\d{1,2}[-\/.]\\d{1,2}[-\/.]\\d{2,4})",
        r"(?:date|invoice\s*date|dated)[:.\s-]*(\d{4}[-\/.]\\d{1,2}[-\/.]\\d{1,2})",
        r"(?:date|invoice\s*date|dated)[:.\s-]*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
        r"\b(\d{4}-\d{2}-\d{2})\b",
    ]
    for pat in date_patterns:
        match = re.search(pat, full_text, re.IGNORECASE)
        if match:
            parsed = parse_date_string(match.group(1))
            if parsed:
                inv_date = parsed.strftime("%Y-%m-%d")
                break

    # 3. Customer extraction
    customer_name = ""
    customer_contact = ""
    cust_match = re.search(r"(?:customer|billed\s*to|buyer|patient|client|sold\s*to)[:.\s-]*([^\n,]{3,50})", full_text, re.IGNORECASE)
    if cust_match:
        customer_name = cust_match.group(1).strip()

    phone_match = re.search(r"(?:phone|mobile|tel|contact)[:.\s-]*(\+?\d[\d\s-]{8,15}\d)", full_text, re.IGNORECASE)
    if phone_match:
        customer_contact = phone_match.group(1).strip()

    # 4. Totals extraction
    subtotal = Decimal("0")
    total = Decimal("0")
    discount = Decimal("0")
    tax = Decimal("0")
    roundoff = Decimal("0")

    tot_match = re.search(r"(?:grand\s*total|net\s*total|invoice\s*total|total\s*amount|total)[:.\s-]*(?:₹|INR|Rs\.?)?\s*([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if tot_match:
        try:
            total = Decimal(tot_match.group(1).replace(",", ""))
        except Exception:
            pass

    sub_match = re.search(r"(?:sub\s*total|subtotal|taxable\s*amount)[:.\s-]*(?:₹|INR|Rs\.?)?\s*([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if sub_match:
        try:
            subtotal = Decimal(sub_match.group(1).replace(",", ""))
        except Exception:
            pass

    tax_match = re.search(r"(?:tax|gst|cgst\s*\+\s*sgst|vat)[:.\s-]*(?:₹|INR|Rs\.?)?\s*([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if tax_match:
        try:
            tax = Decimal(tax_match.group(1).replace(",", ""))
        except Exception:
            pass

    disc_match = re.search(r"(?:discount|less\s*disc)[:.\s-]*(?:₹|INR|Rs\.?)?\s*([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if disc_match:
        try:
            discount = Decimal(disc_match.group(1).replace(",", ""))
        except Exception:
            pass

    round_match = re.search(r"(?:round\s*off|roundoff)[:.\s-]*(?:₹|INR|Rs\.?)?\s*([+-]?[\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if round_match:
        try:
            roundoff = Decimal(round_match.group(1).replace(",", ""))
        except Exception:
            pass

    return {
        "invoice_number": inv_num or "",
        "invoice_date": inv_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "customer_name": customer_name,
        "customer_contact": customer_contact,
        "subtotal": float(subtotal),
        "discount": float(discount),
        "tax": float(tax),
        "charges": 0.0,
        "roundoff": float(roundoff),
        "total": float(total),
        "currency": "INR",
    }


# ─── Regex-based line extraction (used for PDFs) ─────────────────────────────

def extract_and_match_lines(text: str, db: Session) -> list[dict[str, Any]]:
    """
    Parses lines from text and matches them against existing products in db.
    Identifies SKU, name, quantities (including 10 + 2 free patterns), units, rates, and totals.
    Used for PDF extraction.
    """
    products = db.query(Product).filter(Product.active == True).all()  # noqa: E712
    conversions = db.query(ProductUnitConversion).filter(ProductUnitConversion.active == True).all()  # noqa: E712
    conversion_map = {(c.product_id, c.input_unit.lower()): Decimal(str(c.factor)) for c in conversions}

    raw_lines = [l.strip() for l in text.split("\n") if l.strip()]
    extracted_lines = []

    line_idx = 1
    for raw_l in raw_lines:
        lower_l = raw_l.lower()
        if any(h in lower_l for h in ["invoice", "date", "customer", "subtotal", "grand total", "gstin", "bill to", "taxable"]):
            continue

        matched_prod = None
        match_type = "unmatched"

        for p in products:
            if p.sku and p.sku.lower() in lower_l:
                matched_prod = p
                match_type = "exact_sku"
                break

        if not matched_prod:
            for p in products:
                name_words = [w for w in p.name.lower().split() if len(w) > 3]
                if name_words and all(w in lower_l for w in name_words):
                    matched_prod = p
                    match_type = "name_match"
                    break

        if matched_prod:
            free_qty = 0
            base_qty = 1
            bonus_match = re.search(r"(\d+)\s*\+\s*(\d+)", raw_l)
            if bonus_match:
                base_qty = int(bonus_match.group(1))
                free_qty = int(bonus_match.group(2))
            else:
                nums = re.findall(r"\b\d+(?:\.\d+)?\b", raw_l)
                if nums:
                    base_qty = int(float(nums[0])) if float(nums[0]) > 0 else 1

            unit = matched_prod.stock_unit or "unit"
            for u in ["strip", "bottle", "pack", "box", "vial", "tube", "piece", "unit"]:
                if u in lower_l:
                    unit = u
                    break

            conv_factor = conversion_map.get((matched_prod.id, unit.lower()), Decimal("1.0"))
            total_deduct_qty = int((base_qty + free_qty) * conv_factor)

            unit_price = Decimal(str(matched_prod.price))
            price_match = re.search(r"(?:rate|price|₹|INR)?\s*(\d+\.\d{2})", raw_l)
            if price_match:
                try:
                    unit_price = Decimal(price_match.group(1))
                except Exception:
                    pass

            line_total = unit_price * Decimal(base_qty)

            extracted_lines.append({
                "line_index": line_idx,
                "product_id": matched_prod.id,
                "raw_description": raw_l,
                "sku_snapshot": matched_prod.sku,
                "name_snapshot": matched_prod.name,
                "input_quantity": base_qty,
                "free_quantity": free_qty,
                "input_unit": unit,
                "conversion_factor": float(conv_factor),
                "base_quantity": total_deduct_qty,
                "unit_price": float(unit_price),
                "line_discount": 0.0,
                "line_tax": 0.0,
                "line_total": float(line_total),
                "is_non_stock": False,
                "current_stock": matched_prod.stock,
                "stock_available": matched_prod.stock >= total_deduct_qty,
                "match_type": match_type,
            })
            line_idx += 1

    return extracted_lines


# ─── Gemini Vision extraction (used for images) ───────────────────────────────

GEMINI_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
]


def extract_with_gemini_vision(image_bytes: bytes, mime_type: str) -> dict[str, Any]:
    """
    Sends an invoice image to Google Gemini Vision (google-genai SDK) using a resilient
    multi-model waterfall with retry & backoff, returning structured JSON.
    """
    import time
    from google import genai
    from google.genai import types
    from ..config import settings

    if not settings.gemini_api_key or settings.gemini_api_key in ("your_gemini_api_key_here", ""):
        raise ValueError("GEMINI_API_KEY is not set in .env.")

    # Pre-process image: resize if dimensions exceed 1600px to ensure fast, reliable upload
    safe_mime = mime_type if mime_type.startswith("image/") else "image/png"
    try:
        with Image.open(io.BytesIO(image_bytes)) as pil_img:
            if pil_img.width > 1600 or pil_img.height > 1600:
                pil_img.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                fmt = pil_img.format or ("PNG" if "png" in safe_mime else "JPEG")
                if pil_img.mode in ("RGBA", "P") and fmt == "JPEG":
                    pil_img = pil_img.convert("RGB")
                pil_img.save(buf, format=fmt, quality=85)
                image_bytes = buf.getvalue()
    except Exception:
        pass

    client = genai.Client(api_key=settings.gemini_api_key)

    prompt = """You are an expert invoice data extractor for a pharmacy management system.
Carefully analyze this invoice image and extract ALL information visible.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. Just raw JSON.

Required structure:
{
  "invoice_number": "invoice/bill number exactly as printed",
  "invoice_date": "date converted to YYYY-MM-DD format",
  "customer_name": "customer or buyer name, empty string if not shown",
  "customer_contact": "phone number if visible, empty string if not",
  "subtotal": 0.0,
  "discount": 0.0,
  "tax": 0.0,
  "total": 0.0,
  "currency": "INR",
  "line_items": [
    {
      "name": "exact product/medicine name as printed on invoice",
      "sku": "SKU or product code if visible, else empty string",
      "quantity": 1,
      "free_quantity": 0,
      "unit": "strip/bottle/box/vial/unit/pack/piece",
      "unit_price": 0.0,
      "line_total": 0.0
    }
  ]
}

Rules:
- Extract EVERY line item visible in the invoice table
- All numeric fields must be numbers (not strings)
- Convert all dates to YYYY-MM-DD format
- For missing fields: 0.0 for numbers, empty string for text
- Output ONLY the JSON object, nothing else"""

    last_error = None
    for model_name in GEMINI_MODELS:
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type=safe_mime),
                        types.Part.from_text(text=prompt),
                    ],
                )
                raw = (response.text or "").strip()
                raw = re.sub(r"^```(?:json)?\s*\n?", "", raw)
                raw = re.sub(r"\n?```\s*$", "", raw)
                data = json.loads(raw.strip())
                if isinstance(data, dict):
                    return data
            except Exception as exc:
                last_error = exc
                err_str = str(exc).lower()
                # If model is unavailable (503) or rate-limited (429), pause briefly then retry or switch model
                if "503" in err_str or "unavailable" in err_str or "429" in err_str or "resource_exhausted" in err_str:
                    time.sleep(1)
                    continue
                # If model not found (404), break immediately to next model
                if "404" in err_str or "not_found" in err_str:
                    break

    raise ValueError(f"All Gemini Vision models failed. Last error: {last_error}")


def match_gemini_lines_to_products(line_items: list[dict], db: Session) -> list[dict[str, Any]]:
    """
    Matches Gemini-extracted line items to active products in the database
    by SKU (exact) or name (fuzzy word match). Unmatched items are kept as
    non-stock lines for manual review.
    """
    products = db.query(Product).filter(Product.active == True).all()  # noqa: E712
    conversions = db.query(ProductUnitConversion).filter(ProductUnitConversion.active == True).all()  # noqa: E712
    conversion_map = {(c.product_id, c.input_unit.lower()): Decimal(str(c.factor)) for c in conversions}

    extracted_lines = []

    for idx, item in enumerate(line_items, start=1):
        item_name = (
            item.get("name")
            or item.get("description")
            or item.get("item_description")
            or item.get("product_name")
            or ""
        ).strip()
        item_sku = (item.get("sku") or "").strip().lower()
        item_name_lower = item_name.lower()

        qty = max(int(item.get("quantity") or item.get("qty") or 1), 1)
        free_qty = max(int(item.get("free_quantity") or item.get("free_qty") or 0), 0)
        unit = (item.get("unit") or "unit").strip().lower() or "unit"
        unit_price = Decimal(str(item.get("unit_price") or item.get("rate") or item.get("price") or 0))
        line_total = Decimal(str(item.get("line_total") or item.get("amount") or item.get("total") or 0))

        matched_prod = None
        match_type = "unmatched"

        # 1. Exact SKU match
        if item_sku:
            for p in products:
                if p.sku and p.sku.lower() == item_sku:
                    matched_prod = p
                    match_type = "exact_sku"
                    break

        # 2. Name word match (all significant words must appear in product name)
        if not matched_prod and item_name_lower:
            name_words = [w for w in item_name_lower.split() if len(w) > 3]
            for p in products:
                p_name_lower = p.name.lower()
                if name_words and all(w in p_name_lower for w in name_words):
                    matched_prod = p
                    match_type = "name_match"
                    break
                # Substring match as fallback
                if item_name_lower in p_name_lower or p_name_lower in item_name_lower:
                    matched_prod = p
                    match_type = "name_match"
                    break

        # 3. Fuzzy similarity match (handles OCR typos e.g. Haaime vs Haajme)
        if not matched_prod and item_name_lower:
            best_ratio = 0.0
            best_prod = None
            for p in products:
                ratio = difflib.SequenceMatcher(None, item_name_lower, p.name.lower()).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_prod = p
            if best_prod and best_ratio >= 0.70:
                matched_prod = best_prod
                match_type = f"fuzzy_match_{int(best_ratio * 100)}pct"

        if matched_prod:
            conv_factor = conversion_map.get((matched_prod.id, unit), Decimal("1.0"))
            total_deduct_qty = int((qty + free_qty) * float(conv_factor))

            # Fall back to DB price if Gemini didn't extract it
            if unit_price == 0:
                unit_price = Decimal(str(matched_prod.price))
            if line_total == 0:
                line_total = unit_price * qty

            extracted_lines.append({
                "line_index": idx,
                "product_id": matched_prod.id,
                "raw_description": item_name,
                "sku_snapshot": matched_prod.sku,
                "name_snapshot": matched_prod.name,
                "input_quantity": qty,
                "free_quantity": free_qty,
                "input_unit": unit,
                "conversion_factor": float(conv_factor),
                "base_quantity": total_deduct_qty,
                "unit_price": float(unit_price),
                "line_discount": 0.0,
                "line_tax": 0.0,
                "line_total": float(line_total),
                "is_non_stock": False,
                "current_stock": matched_prod.stock,
                "stock_available": matched_prod.stock >= total_deduct_qty,
                "match_type": match_type,
            })
        else:
            # Unmatched — keep as non-stock line so admin can remap manually
            extracted_lines.append({
                "line_index": idx,
                "product_id": None,
                "raw_description": item_name,
                "sku_snapshot": item_sku or "",
                "name_snapshot": item_name,
                "input_quantity": qty,
                "free_quantity": free_qty,
                "input_unit": unit,
                "conversion_factor": 1.0,
                "base_quantity": qty + free_qty,
                "unit_price": float(unit_price),
                "line_discount": 0.0,
                "line_tax": 0.0,
                "line_total": float(line_total),
                "is_non_stock": True,
                "current_stock": 0,
                "stock_available": False,
                "match_type": "unmatched",
            })

    return extracted_lines


# ─── Main pipeline ───────────────────────────────────────────────────────────

def process_invoice_document(raw_bytes: bytes, filename: str, mime_type: str, db: Session) -> dict[str, Any]:
    """
    Complete processing pipeline for invoice documents.

    • PDF  → pypdf text → regex extraction → DB product matching
    • Image → Gemini Vision API → structured JSON → DB product matching
    """
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    page_count = 1
    raw_text = ""
    fields: dict[str, Any] = {}
    lines: list[dict[str, Any]] = []
    extraction_method = "regex"

    warnings: list[str] = []

    if ext == ".pdf" or "pdf" in mime_type:
        # ── PDF path (unchanged) ──────────────────────────────────────────
        raw_text, page_count = extract_text_from_pdf(raw_bytes)
        fields = extract_invoice_fields(raw_text)
        lines = extract_and_match_lines(raw_text, db)

    else:
        # ── Image path: use Gemini Vision with multi-model waterfall ──────
        w, h, fmt = validate_image(raw_bytes)

        try:
            gemini_data = extract_with_gemini_vision(raw_bytes, mime_type)
            extraction_method = "gemini_vision"

            # Build standardised fields dict
            raw_date = gemini_data.get("invoice_date") or ""
            parsed_date = parse_date_string(raw_date) if raw_date else None
            invoice_date = (
                parsed_date.strftime("%Y-%m-%d")
                if parsed_date
                else datetime.now(timezone.utc).strftime("%Y-%m-%d")
            )

            fields = {
                "invoice_number":  (gemini_data.get("invoice_number") or "").strip(),
                "invoice_date":    invoice_date,
                "customer_name":   (gemini_data.get("customer_name") or "").strip(),
                "customer_contact":(gemini_data.get("customer_contact") or "").strip(),
                "subtotal":        float(gemini_data.get("subtotal") or 0),
                "discount":        float(gemini_data.get("discount") or 0),
                "tax":             float(gemini_data.get("tax") or 0),
                "charges":         0.0,
                "roundoff":        0.0,
                "total":           float(gemini_data.get("total") or 0),
                "currency":        gemini_data.get("currency") or "INR",
            }

            raw_text = (
                f"[Gemini Vision Extraction] {fmt} {w}×{h}px\n"
                f"Invoice: {fields['invoice_number']}  Date: {fields['invoice_date']}\n"
                f"Customer: {fields['customer_name']}  Contact: {fields['customer_contact']}\n"
                f"Total: {fields['total']}  Tax: {fields['tax']}"
            )

            # Match extracted line items to DB products
            lines = match_gemini_lines_to_products(
                gemini_data.get("line_items") or [], db
            )

        except Exception as exc:
            # Gemini failed — fall back gracefully with a clear informative warning
            raw_text = f"[Image: {fmt} {w}×{h}px] Gemini extraction failed: {exc}"
            fields = extract_invoice_fields(raw_text)
            lines = []
            warnings.append(
                f"AI Vision extraction temporarily busy: {str(exc)[:140]}. "
                "Please click 'Retry Extraction' or enter fields manually."
            )

    # ── Fallback: if no lines extracted and no error occurred, insert placeholder ──────
    if not lines and not warnings and db.query(Product).count() > 0:
        first_p = db.query(Product).first()
        if first_p:
            lines.append({
                "line_index": 1,
                "product_id": first_p.id,
                "raw_description": f"Manual entry from {filename}",
                "sku_snapshot": first_p.sku,
                "name_snapshot": first_p.name,
                "input_quantity": 1,
                "free_quantity": 0,
                "input_unit": first_p.stock_unit or "unit",
                "conversion_factor": 1.0,
                "base_quantity": 1,
                "unit_price": float(first_p.price),
                "line_discount": 0.0,
                "line_tax": 0.0,
                "line_total": float(first_p.price),
                "is_non_stock": False,
                "current_stock": first_p.stock,
                "stock_available": first_p.stock >= 1,
                "match_type": "manual_review",
            })
            if fields.get("total", 0) == 0:
                fields["subtotal"] = float(first_p.price)
                fields["total"] = float(first_p.price)

    # ── Computed total reconciliation ─────────────────────────────────────
    computed_line_total = sum(l["line_total"] for l in lines)
    if fields.get("total", 0) == 0 and computed_line_total > 0:
        fields["subtotal"] = computed_line_total
        fields["total"] = computed_line_total

    # ── Build warnings ────────────────────────────────────────────────────
    if not fields.get("invoice_number"):
        warnings.append("Missing invoice number — please enter manually.")

    for l in lines:
        if not l.get("product_id") and not l.get("is_non_stock"):
            warnings.append(f"Line {l['line_index']} ({l['name_snapshot']}): Unmapped product — please select manually.")
        elif l.get("is_non_stock") and not l.get("product_id"):
            warnings.append(f"Line {l['line_index']} ({l['name_snapshot']}): Not matched to any active product — please map manually.")
        if (l.get("base_quantity", 0) > l.get("current_stock", 0)) and not l.get("is_non_stock"):
            shortage = l["base_quantity"] - l["current_stock"]
            warnings.append(
                f"Line {l['line_index']} ({l['name_snapshot']}): Insufficient stock "
                f"(Needs {l['base_quantity']}, Available {l['current_stock']}, Short by {shortage})."
            )

    status = "needs_review" if warnings else "ready"

    return {
        "status": status,
        "page_count": page_count,
        "raw_text": raw_text,
        "extraction_method": extraction_method,
        "fields": fields,
        "lines": lines,
        "warnings": warnings,
    }
