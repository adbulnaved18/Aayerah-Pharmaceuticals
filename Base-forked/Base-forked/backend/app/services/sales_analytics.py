from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..models import (
    OfflineSale,
    OfflineSaleLine,
    Product,
    SalePayment,
    SaleReturn,
)

IST = timezone(timedelta(hours=5, minutes=30))


def get_period_dates(period: str, db: Session | None = None) -> tuple[datetime.date, datetime.date, str]:
    """Calculates date range and human-readable label for reporting periods in IST."""
    now_ist = datetime.now(IST)
    weekday = now_ist.weekday()  # Monday = 0, Sunday = 6
    current_monday = now_ist.date() - timedelta(days=weekday)
    current_sunday = current_monday + timedelta(days=6)
    last_monday = current_monday - timedelta(days=7)
    last_sunday = last_monday + timedelta(days=6)
    two_weeks_ago_monday = current_monday - timedelta(days=14)
    two_weeks_ago_sunday = two_weeks_ago_monday + timedelta(days=6)

    if period == "current_week":
        return current_monday, current_sunday, f"Current Week ({current_monday.strftime('%a %d %b')} – {current_sunday.strftime('%a %d %b %Y')})"
    elif period == "last_week":
        return last_monday, last_sunday, f"Last Week ({last_monday.strftime('%a %d %b')} – {last_sunday.strftime('%a %d %b %Y')})"
    elif period in ("two_weeks_ago", "past_2_weeks"):
        return two_weeks_ago_monday, two_weeks_ago_sunday, f"2 Weeks Ago ({two_weeks_ago_monday.strftime('%a %d %b')} – {two_weeks_ago_sunday.strftime('%a %d %b %Y')})"
    elif period == "last_7_days":
        start = now_ist.date() - timedelta(days=6)
        end = now_ist.date()
        return start, end, f"Last 7 Days ({start.strftime('%d %b')} – {end.strftime('%d %b %Y')})"
    elif period == "last_14_days":
        start = now_ist.date() - timedelta(days=13)
        end = now_ist.date()
        return start, end, f"Last 14 Days ({start.strftime('%d %b')} – {end.strftime('%d %b %Y')})"
    elif period == "last_21_days":
        start = now_ist.date() - timedelta(days=20)
        end = now_ist.date()
        return start, end, f"Last 21 Days ({start.strftime('%d %b')} – {end.strftime('%d %b %Y')})"
    else:
        # Default: 3 weeks or adapted historical range
        start_date = two_weeks_ago_monday
        end_date = current_sunday
        if db is not None:
            min_inv = db.query(func.min(OfflineSale.invoice_date)).filter(OfflineSale.status != "voided").scalar()
            if min_inv:
                min_date = min_inv.astimezone(IST).date() if min_inv.tzinfo else min_inv.date()
                earliest_monday = min_date - timedelta(days=min_date.weekday())
                if earliest_monday < start_date:
                    start_date = earliest_monday
            max_inv = db.query(func.max(OfflineSale.invoice_date)).filter(OfflineSale.status != "voided").scalar()
            if max_inv:
                max_date = max_inv.astimezone(IST).date() if max_inv.tzinfo else max_inv.date()
                latest_sunday = max_date + timedelta(days=6 - max_date.weekday())
                if latest_sunday > end_date:
                    end_date = latest_sunday

        total_days = (end_date - start_date).days + 1
        weeks = max(3, (total_days + 6) // 7)
        if weeks > 3:
            return start_date, end_date, f"All {weeks} Weeks ({start_date.strftime('%a %d %b')} – {end_date.strftime('%a %d %b %Y')})"
        return two_weeks_ago_monday, current_sunday, f"All 3 Weeks ({two_weeks_ago_monday.strftime('%a %d %b')} – {current_sunday.strftime('%a %d %b %Y')})"


def get_sales_summary(
    db: Session,
    period: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """Authoritative sales metrics computed directly in SQL to prevent client-side discrepancies."""
    period_label = "All-Time"
    if period and period != "all":
        d_start, d_end, period_label = get_period_dates(period, db=db)
        start_date = datetime.combine(d_start, datetime.min.time(), tzinfo=IST)
        end_date = datetime.combine(d_end, datetime.max.time(), tzinfo=IST)

    base_query = db.query(OfflineSale).filter(OfflineSale.status != "voided")
    if start_date:
        base_query = base_query.filter(OfflineSale.invoice_date >= start_date)
    if end_date:
        base_query = base_query.filter(OfflineSale.invoice_date <= end_date)

    sales = base_query.all()
    sale_ids = [s.id for s in sales]

    total_invoiced = sum(s.total for s in sales) if sales else Decimal("0.00")
    total_transactions = len(sales)

    # Payments & Collections
    pay_query = db.query(func.coalesce(func.sum(SalePayment.amount), 0))
    if sale_ids:
        pay_query = pay_query.filter(SalePayment.sale_id.in_(sale_ids))
    else:
        pay_query = pay_query.filter(False)
    collections = Decimal(str(pay_query.scalar() or "0.00"))

    # Returns & Credits
    ret_query = db.query(func.coalesce(func.sum(SaleReturn.credit_amount), 0), func.coalesce(func.sum(SaleReturn.quantity), 0))
    if sale_ids:
        ret_query = ret_query.filter(SaleReturn.sale_id.in_(sale_ids))
    else:
        ret_query = ret_query.filter(False)
    ret_res = ret_query.first()
    credits_amount = Decimal(str(ret_res[0] or "0.00"))
    returned_units = int(ret_res[1] or 0)

    # Line Item Aggregations
    lines_query = db.query(
        func.coalesce(func.sum(OfflineSaleLine.line_total), 0),
        func.coalesce(func.sum(OfflineSaleLine.base_quantity), 0)
    )
    if sale_ids:
        lines_query = lines_query.filter(OfflineSaleLine.sale_id.in_(sale_ids))
    else:
        lines_query = lines_query.filter(False)
    lines_res = lines_query.first()
    gross_product_sales = Decimal(str(lines_res[0] or "0.00"))
    gross_units = int(lines_res[1] or 0)

    net_product_sales = gross_product_sales - credits_amount
    net_invoiced = total_invoiced - credits_amount
    net_units = max(0, gross_units - returned_units)
    outstanding = max(Decimal("0.00"), net_invoiced - collections)

    avg_invoice_value = (total_invoiced / total_transactions) if total_transactions > 0 else Decimal("0.00")

    # Current stock inventory checks
    low_stock_count = db.query(Product).filter(Product.active == True, Product.stock < 25).count()  # noqa: E712

    return {
        "timezone": "Asia/Kolkata (IST)",
        "period": period or "all",
        "period_label": period_label,
        "gross_product_sales": float(gross_product_sales),
        "net_product_sales": float(net_product_sales),
        "total_invoiced": float(total_invoiced),
        "net_invoiced": float(net_invoiced),
        "collections": float(collections),
        "outstanding": float(outstanding),
        "total_transactions": total_transactions,
        "gross_units_sold": gross_units,
        "net_units_sold": net_units,
        "credits_amount": float(credits_amount),
        "avg_invoice_value": float(avg_invoice_value),
        "low_stock_count": low_stock_count,
    }


def get_timeseries(db: Session, period: str = "3_weeks") -> list[dict[str, Any]]:
    """
    Produces daily buckets zero-filled for chart display.
    Supports 3 weeks: Current week, Last week, 2 weeks ago, or all 3 weeks.
    """
    start_date, end_date, cohort_label = get_period_dates(period, db=db)

    # Initialize daily buckets with zero counts
    date_buckets: dict[str, dict[str, Any]] = {}
    curr = start_date
    while curr <= end_date:
        d_str = curr.strftime("%Y-%m-%d")
        label = curr.strftime("%a %d %b")
        date_buckets[d_str] = {
            "date": d_str,
            "label": label,
            "net_sales": 0.0,
            "invoice_amount": 0.0,
            "invoice_count": 0,
            "units_sold": 0,
        }
        curr += timedelta(days=1)

    # Query posted non-voided sales in the range
    dt_start = datetime.combine(start_date, datetime.min.time(), tzinfo=IST)
    dt_end = datetime.combine(end_date, datetime.max.time(), tzinfo=IST)

    sales = db.query(OfflineSale).filter(
        OfflineSale.status != "voided",
        OfflineSale.invoice_date >= dt_start,
        OfflineSale.invoice_date <= dt_end,
    ).all()

    for s in sales:
        d_key = (s.invoice_date.astimezone(IST) if s.invoice_date.tzinfo else s.invoice_date).strftime("%Y-%m-%d")
        if d_key in date_buckets:
            bucket = date_buckets[d_key]
            bucket["invoice_amount"] += float(s.total)
            bucket["net_sales"] += float(s.subtotal - s.discount)
            bucket["invoice_count"] += 1

    # Query units for sales in this range
    sale_ids = [s.id for s in sales]
    if sale_ids:
        lines = db.query(OfflineSaleLine, OfflineSale.invoice_date).join(
            OfflineSale, OfflineSale.id == OfflineSaleLine.sale_id
        ).filter(OfflineSaleLine.sale_id.in_(sale_ids)).all()

        for line, inv_date in lines:
            d_key = (inv_date.astimezone(IST) if inv_date.tzinfo else inv_date).strftime("%Y-%m-%d")
            if d_key in date_buckets:
                date_buckets[d_key]["units_sold"] += line.base_quantity

    return list(date_buckets.values())


def get_top_products(db: Session, limit: int = 8, by: str = "units") -> list[dict[str, Any]]:
    """Returns ranked top products by units sold or net revenue."""
    results = (
        db.query(
            OfflineSaleLine.product_id,
            OfflineSaleLine.sku_snapshot,
            OfflineSaleLine.name_snapshot,
            OfflineSaleLine.input_unit,
            func.sum(OfflineSaleLine.base_quantity).label("total_units"),
            func.sum(OfflineSaleLine.line_total).label("total_revenue"),
        )
        .join(OfflineSale, OfflineSale.id == OfflineSaleLine.sale_id)
        .filter(OfflineSale.status != "voided", OfflineSaleLine.product_id != None)  # noqa: E711
        .group_by(OfflineSaleLine.product_id, OfflineSaleLine.sku_snapshot, OfflineSaleLine.name_snapshot, OfflineSaleLine.input_unit)
        .order_by(func.sum(OfflineSaleLine.base_quantity).desc() if by == "units" else func.sum(OfflineSaleLine.line_total).desc())
        .limit(limit)
        .all()
    )

    out = []
    for r in results:
        out.append({
            "product_id": r[0],
            "sku": r[1],
            "name": r[2],
            "unit": r[3],
            "units_sold": int(r[4] or 0),
            "revenue": float(r[5] or 0.0),
        })
    return out
