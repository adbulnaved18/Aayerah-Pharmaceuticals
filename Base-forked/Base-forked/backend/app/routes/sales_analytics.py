from typing import Optional
from fastapi import APIRouter, Depends, Query
from ..security import DB, Owner
from ..services.sales_analytics import (
    get_sales_summary,
    get_timeseries,
    get_top_products,
)

router = APIRouter(prefix="/admin/sales-analytics", tags=["Sales Analytics"])


@router.get("/summary")
def sales_summary(db: DB, _: Owner, period: Optional[str] = Query(None)):
    """
    Summary KPI Cards: Net product sales, Total invoiced, Collections,
    Outstanding balance, Units sold, Low-stock alerts.
    Supports optional period filtering (current_week, last_week, two_weeks_ago, 3_weeks, all).
    """
    return get_sales_summary(db, period=period)


@router.get("/timeseries")
def sales_timeseries(
    db: DB,
    _: Owner,
    period: str = Query("3_weeks", pattern="^(3_weeks|last_3_weeks|current_week|last_week|two_weeks_ago|past_2_weeks|last_7_days|last_14_days|last_21_days|all)$"),
):
    """
    Zero-filled daily sales series.
    Supports 3-week views: Current week, Last week, 2 weeks ago, or All 3 weeks.
    """
    return get_timeseries(db, period=period)


@router.get("/products")
def sales_top_products(
    db: DB,
    _: Owner,
    by: str = Query("units", pattern="^(units|revenue)$"),
    limit: int = Query(8, le=20),
):
    """Product performance ranking by units sold or net revenue."""
    return get_top_products(db, limit=limit, by=by)
