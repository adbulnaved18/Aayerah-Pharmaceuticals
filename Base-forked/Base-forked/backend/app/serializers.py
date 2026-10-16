from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import select
from .models import OrderItem

def user_json(user):
    return {'id': user.id, '_id': user.id, 'fullname': user.fullname, 'email': user.email, 'role': user.role, 'picture': user.picture}

def effective_price(product):
    return (product.price * (1 - product.discount / Decimal(100))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def product_json(p):
    return {**{k: getattr(p, k) for k in ['name','description','category','stock','bgColor','panelColor','textColor']},
            'id': p.id, '_id': p.id, 'price': float(p.price), 'discount': float(p.discount),
            'effectivePrice': float(effective_price(p)), 'image': {'url': p.image, 'public_id': p.image_public_id}}

def order_json(db, order):
    items = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
    return {'id': order.id, '_id': order.id, 'customerEmail': order.shipping_address['email'],
            'shippingAddress': order.shipping_address, 'total': float(order.total), 'currency': order.currency,
            'shippingFee': float(order.shipping_fee), 'subtotal': float(order.total - order.shipping_fee), 'status': order.status, 'paymentStatus': order.payment_status, 'paymentMethod': order.payment_method,
            'date': order.created_at.isoformat(), 'items': [
                {'id': i.product_id, 'name': i.name, 'image': i.image, 'price': float(i.price), 'quantity': i.quantity} for i in items]}
