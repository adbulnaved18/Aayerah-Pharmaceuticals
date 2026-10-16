import hashlib
import json
from typing import Annotated
from fastapi import APIRouter, Header, HTTPException, Query
from sqlalchemy import select, delete, func
from ..models import Order, OrderItem, CartItem, Product, User
from ..schemas import Checkout, Status
from ..security import DB, Current, Owner
from ..serializers import effective_price, order_json
from ..config import settings
from .cart import lock_user

router = APIRouter(tags=['Orders'])

@router.post('/user/orders', status_code=201)
def checkout(data: Checkout, db: DB, user: Current,
             idempotency_key: Annotated[str, Header(min_length=8, max_length=100)]):
    lock_user(db, user)
    fingerprint = hashlib.sha256(json.dumps(data.model_dump(mode='json'), sort_keys=True).encode()).hexdigest()
    existing = db.scalar(select(Order).where(Order.user_id == user.id, Order.idempotency_key == idempotency_key))
    if existing:
        if existing.request_hash != fingerprint: raise HTTPException(409, 'Idempotency key used with different details')
        return order_json(db, existing)
    cart = db.scalars(select(CartItem).where(CartItem.user_id == user.id).order_by(CartItem.product_id)).all()
    if not cart: raise HTTPException(409, 'Cart is empty')
    products = db.scalars(select(Product).where(Product.id.in_([c.product_id for c in cart])).order_by(Product.id).with_for_update()).all()
    by_id = {p.id: p for p in products}
    for item in cart:
        product = by_id.get(item.product_id)
        if not product or not product.active or product.stock < item.quantity:
            raise HTTPException(409, 'A cart product is unavailable or has insufficient stock')
    order = Order(user_id=user.id, idempotency_key=idempotency_key, request_hash=fingerprint,
                  shipping_address=data.shippingAddress.model_dump(mode='json'), currency=settings.currency, shipping_fee=settings.shipping_fee,
                  total=sum(effective_price(by_id[c.product_id]) * c.quantity for c in cart) + settings.shipping_fee)
    db.add(order)
    db.flush()
    for item in cart:
        p = by_id[item.product_id]
        p.stock -= item.quantity
        db.add(OrderItem(order_id=order.id, product_id=p.id, name=p.name, image=p.image,
                         price=effective_price(p), quantity=item.quantity))
    db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    db.commit()
    return order_json(db, order)

@router.get('/user/orders')
def user_orders(db: DB, user: Current, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    return [order_json(db, o) for o in db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()).offset(offset).limit(limit))]

@router.get('/user/orders/{order_id}')
def user_order(order_id: str, db: DB, user: Current):
    order = db.get(Order, order_id)
    if not order or order.user_id != user.id: raise HTTPException(404, 'Order not found')
    return order_json(db, order)

@router.get('/owner/orders')
def all_orders(db: DB, admin: Owner, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    return [order_json(db, o) for o in db.scalars(select(Order).order_by(Order.created_at.desc()).offset(offset).limit(limit))]

@router.get('/owner/stats')
def stats(db: DB, admin: Owner):
    return {'totalRevenue': float(db.scalar(select(func.coalesce(func.sum(Order.total), 0)).where(Order.payment_status == 'paid'))),
            'totalOrders': db.scalar(select(func.count()).select_from(Order)),
            'products': db.scalar(select(func.count()).select_from(Product).where(Product.active.is_(True))),
            'customers': db.scalar(select(func.count()).select_from(User).where(User.role == 'user'))}

@router.patch('/owner/orders/{order_id}/status')
def change_status(order_id: str, data: Status, db: DB, admin: Owner):
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if not order: raise HTTPException(404, 'Order not found')
    if data.status == order.status: return order_json(db, order)
    allowed = {'pending': {'confirmed','cancelled'}, 'confirmed': {'shipped','cancelled'}, 'shipped': {'delivered'}, 'delivered': set(), 'cancelled': set()}
    if data.status not in allowed[order.status]: raise HTTPException(409, 'Invalid order status transition')
    if data.status == 'cancelled':
        items = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
        quantities = {i.product_id: i.quantity for i in items}
        for product in db.scalars(select(Product).where(Product.id.in_(quantities)).order_by(Product.id).with_for_update()):
            product.stock += quantities[product.id]
    if data.status == 'delivered': order.payment_status = 'paid'  # Owner confirms COD collection.
    order.status = data.status
    db.commit()
    return order_json(db, order)
