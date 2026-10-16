from fastapi import APIRouter, HTTPException
from sqlalchemy import select, delete
from ..models import User, CartItem, Product, Address
from ..schemas import Quantity, Shipping, LegacyAddress
from ..config import settings
from ..security import DB, Current
from ..serializers import product_json, effective_price
from .products import get_product

router = APIRouter(prefix='/user', tags=['Cart and address'])

def lock_user(db, user):
    db.execute(select(User).where(User.id == user.id).with_for_update()).scalar_one()

def cart_json(db, user):
    rows = db.execute(select(CartItem, Product).join(Product).where(CartItem.user_id == user.id).order_by(Product.id)).all()
    items = [{**product_json(p), 'price': float(effective_price(p)), 'image': p.image, 'quantity': c.quantity,
              'available': p.active and p.stock >= c.quantity} for c, p in rows]
    subtotal = sum(effective_price(p) * c.quantity for c, p in rows)
    shipping = settings.shipping_fee if rows else 0
    discount = sum((p.price - effective_price(p)) * c.quantity for c, p in rows)
    return {'items': items, 'cart': items, 'cartCount': sum(c.quantity for c, p in rows), 'success': True,
            'total': float(subtotal + shipping), 'subtotal': float(subtotal), 'shippingFee': float(shipping),
            'pricing': {'subtotal': float(subtotal), 'shippingFee': float(shipping),
                        'discount': float(discount), 'finalAmount': float(subtotal + shipping)}}

@router.get('/cart')
def cart(db: DB, user: Current): return cart_json(db, user)

@router.post('/addtocart/{product_id}')
def add(product_id: str, db: DB, user: Current, data: Quantity = Quantity()):
    lock_user(db, user)
    product = get_product(db, product_id)
    item = db.get(CartItem, (user.id, product_id))
    quantity = (item.quantity if item else 0) + data.quantity
    if quantity > min(product.stock, 999): raise HTTPException(409, 'Insufficient stock')
    if item: item.quantity = quantity
    else: db.add(CartItem(user_id=user.id, product_id=product_id, quantity=quantity))
    db.commit()
    return cart_json(db, user)

@router.put('/cart/{product_id}')
def update(product_id: str, data: Quantity, db: DB, user: Current):
    lock_user(db, user)
    product = get_product(db, product_id)
    item = db.get(CartItem, (user.id, product_id))
    if not item: raise HTTPException(404, 'Cart item not found')
    if data.quantity > product.stock: raise HTTPException(409, 'Insufficient stock')
    item.quantity = data.quantity
    db.commit()
    return cart_json(db, user)

@router.delete('/cart/{product_id}')
def remove(product_id: str, db: DB, user: Current):
    lock_user(db, user)
    db.execute(delete(CartItem).where(CartItem.user_id == user.id, CartItem.product_id == product_id))
    db.commit()
    return cart_json(db, user)

@router.delete('/cart')
def clear(db: DB, user: Current):
    lock_user(db, user)
    db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    db.commit()
    return {'items': [], 'total': 0}

@router.get('/address')
def address(db: DB, user: Current):
    address = db.get(Address, user.id)
    return address.data if address else None

@router.post('/address')
@router.put('/address')
def save_address(data: Shipping | LegacyAddress, db: DB, user: Current):
    lock_user(db, user)
    legacy = isinstance(data, LegacyAddress)
    if legacy:
        data = Shipping(fullName=user.fullname, email=user.email, phone=data.contact, address=data.street,
                        city=data.city, state=data.state, zipCode=data.postalCode, country=data.country)
    address = db.get(Address, user.id)
    if address: address.data = data.model_dump(mode='json')
    else: db.add(Address(user_id=user.id, data=data.model_dump(mode='json')))
    db.commit()
    if legacy:
        return {'success': True, 'data': {'userId': user.id, 'address': {
            'street': data.address, 'city': data.city, 'state': data.state, 'postalCode': data.zipCode,
            'country': data.country, 'contact': data.phone}}}
    return data
