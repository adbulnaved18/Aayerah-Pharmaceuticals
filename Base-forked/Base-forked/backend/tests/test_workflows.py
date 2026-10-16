import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import pytest
from PIL import Image
from sqlalchemy import select
from fastapi.testclient import TestClient
from app.main import app
from app.models import Session, now

PRODUCT = dict(name='Headphones', price='100.00', description='Example product', category='Electronics', stock=5, discount='10.00')
SHIPPING = dict(fullName='Customer', email='user@example.com', phone='1234567890', address='123 Test Street', city='Kolkata', state='WB', zipCode='700001', country='India')

def create_product(client, admin, **changes):
    response = client.post('/product/createproduct', json={**PRODUCT, **changes}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()

def place(client, user, key='checkout-0001'):
    return client.post('/user/orders', json={'shippingAddress':SHIPPING}, headers={**user,'Idempotency-Key':key})

def test_auth_roles_duplicates_and_revocation(client, user, admin):
    assert client.get('/user/me', headers=user).json()['user']['role'] == 'user'
    assert client.post('/owner/register', json={'fullname':'Intruder','email':'intruder@example.com','password':'password1'}, headers=user).status_code == 403
    assert client.post('/user/register', json={'fullname':'Again','email':'USER@example.com','password':'password1'}).status_code == 409
    assert client.post('/owner/login', json={'email':'user@example.com','password':'test-password'}).status_code == 401
    assert client.get('/owner/orders', headers=user).status_code == 403
    assert client.post('/user/logout', headers=user).status_code == 200
    assert client.get('/user/cart', headers=user).status_code == 401

def test_session_expiry(client, user, database):
    with database[0]() as db:
        session = db.scalar(select(Session)); session.expires_at = now() - timedelta(seconds=10); db.commit()
    assert client.get('/user/me', headers=user).status_code == 401

def test_product_fields_filters_and_authorization(client, admin, user):
    assert client.post('/product/createproduct', json=PRODUCT).status_code == 401
    assert client.post('/product/createproduct', json=PRODUCT, headers=user).status_code == 403
    p = create_product(client, admin, bgColor='#aabbcc')
    assert p['price'] == 100 and p['effectivePrice'] == 90 and p['id'] == p['_id']
    assert client.get('/product/shop?search=head&category=Electronics').json()[0]['id'] == p['id']
    assert client.get('/product/shop?search=missing').json() == []
    assert client.get('/product/categories').json() == ['Electronics']
    updated = client.post('/product/updateproduct/'+p['id'], json={'stock':2}, headers=admin).json()
    assert updated['discount'] == 10 and updated['bgColor'] == '#aabbcc'
    assert client.post('/product/updateproduct/'+p['id'], json={'price':-1}, headers=admin).status_code == 422
    assert client.post('/product/deleteproduct/'+p['id'], headers=admin).status_code == 200
    assert client.get('/product/product/'+p['id']).status_code == 404

def test_upload_validation_and_serving(client, admin):
    data = {k:str(v) for k,v in PRODUCT.items()}
    assert client.post('/product/createproduct', data=data, files={'image':('x.png', b'not an image','image/png')}, headers=admin).status_code == 422
    img = io.BytesIO(); Image.new('RGB',(16,16),'red').save(img,'PNG')
    response = client.post('/product/createproduct', data=data, files={'image':('x.png', img.getvalue(),'image/png')}, headers=admin)
    assert response.status_code == 201, response.text
    url = response.json()['image']['url']
    assert url.endswith('.webp') and client.get(url).status_code == 200

def test_cart_address_and_account_isolation(client, user, admin):
    p = create_product(client, admin)
    assert client.post('/user/addtocart/'+p['id'], json={'quantity':2}, headers=user).json()['total'] == 180
    assert client.put('/user/cart/'+p['id'], json={'quantity':6}, headers=user).status_code == 409
    assert client.put('/user/cart/'+p['id'], json={'quantity':0}, headers=user).status_code == 422
    assert client.get('/user/cart', headers=admin).json()['items'] == []
    assert client.put('/user/address', json=SHIPPING, headers=user).status_code == 200
    assert client.get('/user/address', headers=user).json() == SHIPPING
    assert client.get('/user/address', headers=admin).json() is None
    assert client.delete('/user/cart/'+p['id'], headers=user).json()['items'] == []

def test_checkout_server_prices_idempotency_and_snapshot(client, user, admin):
    p = create_product(client, admin)
    client.post('/user/addtocart/'+p['id'], json={'quantity':2}, headers=user)
    assert client.post('/user/orders', json={'shippingAddress':SHIPPING,'total':1}, headers={**user,'Idempotency-Key':'price-tamper'}).status_code == 422
    response = place(client,user)
    assert response.status_code == 201, response.text
    order = response.json()
    assert order['total'] == 180 and order['paymentStatus'] == 'unpaid'
    assert client.get('/product/product/'+p['id']).json()['stock'] == 3
    assert client.get('/user/cart', headers=user).json()['items'] == []
    assert place(client,user).json()['id'] == order['id']
    assert client.get('/product/product/'+p['id']).json()['stock'] == 3
    assert client.post('/user/orders', json={'shippingAddress':{**SHIPPING,'city':'Delhi'}}, headers={**user,'Idempotency-Key':'checkout-0001'}).status_code == 409
    client.post('/product/updateproduct/'+p['id'], json={'price':200, 'name':'Changed'}, headers=admin)
    saved = client.get('/user/orders/'+order['id'], headers=user).json()
    assert saved['items'][0]['name'] == 'Headphones' and saved['total'] == 180
    assert client.get('/user/orders/'+order['id'], headers=admin).status_code == 404

def test_checkout_rollback_and_empty_cart(client, user, admin):
    assert place(client,user).status_code == 409
    p = create_product(client, admin); q = create_product(client, admin, name='Second')
    for x in [p,q]: client.post('/user/addtocart/'+x['id'], json={'quantity':2}, headers=user)
    client.post('/product/updateproduct/'+q['id'], json={'stock':0}, headers=admin)
    assert place(client,user).status_code == 409
    assert client.get('/product/product/'+p['id']).json()['stock'] == 5
    assert len(client.get('/user/cart', headers=user).json()['items']) == 2
    assert client.get('/user/orders', headers=user).json() == []

def test_status_transitions_cancellation_and_revenue(client, user, admin):
    p = create_product(client, admin); client.post('/user/addtocart/'+p['id'], headers=user)
    o = place(client,user).json(); path = '/owner/orders/'+o['id']+'/status'
    assert client.patch(path, json={'status':'delivered'}, headers=admin).status_code == 409
    assert client.patch(path, json={'status':'cancelled'}, headers=user).status_code == 403
    for _ in range(2): assert client.patch(path, json={'status':'cancelled'}, headers=admin).status_code == 200
    assert client.get('/product/product/'+p['id']).json()['stock'] == 5
    assert client.get('/owner/stats', headers=admin).json()['totalRevenue'] == 0
    client.post('/user/addtocart/'+p['id'], headers=user)
    o = place(client,user,'checkout-0002').json()
    for status in ['confirmed','shipped','delivered']:
        assert client.patch('/owner/orders/'+o['id']+'/status', json={'status':status}, headers=admin).status_code == 200
    assert client.get('/owner/stats', headers=admin).json()['totalRevenue'] == 90

def test_health_alias_and_cors(client):
    assert client.get('/api/health').json() == {'status':'ok'}
    assert client.get('/health').status_code == 200
    assert client.get('/api/product/shop').status_code == 200
    response = client.options('/user/login', headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization'})
    assert response.status_code == 200
    assert client.options('/user/login', headers={'Origin':'https://untrusted.example','Access-Control-Request-Method':'POST'}).status_code == 400

def test_postgres_concurrent_checkout_no_oversell(client, user, admin, database):
    if database[1].dialect.name != 'postgresql': pytest.skip('Requires TEST_DATABASE_URL; SQLite cannot test row locking')
    p = create_product(client, admin, stock=1)
    second = client.post('/user/register', json={'fullname':'Second','email':'second@example.com','password':'test-password'}).json()
    other = {'Authorization':'Bearer '+second['token']}
    for account in [user, other]: client.post('/user/addtocart/'+p['id'], headers=account)
    def submit(account):
        with TestClient(app) as c: return place(c,account).status_code
    with ThreadPoolExecutor(max_workers=2) as executor: statuses = list(executor.map(submit,[user,other]))
    assert sorted(statuses) == [201,409]
    assert client.get('/product/product/'+p['id']).json()['stock'] == 0

def test_legacy_profile_attributes_and_address(client, user, admin):
    p = create_product(client, admin)
    assert p['product']['id'] == p['id']
    assert client.get('/owner/profile', headers=admin).json()['products'] == [p['id']]
    response = client.patch('/owner/profile', json={'gstin':'27ABCDE1234F1Z5','discounts':'Seasonal offers','picture':'https://example.com/avatar.png'}, headers=admin)
    assert response.status_code == 200, response.text
    assert response.json()['gstin'] == '27ABCDE1234F1Z5'
    assert client.patch('/user/profile', json={'role':'owner'}, headers=user).status_code == 422
    legacy = dict(street='123 Test Street', city='Kolkata', state='WB', postalCode='700001', country='India', contact=1234567890)
    assert client.post('/user/address', json=legacy, headers=user).json()['data']['address']['country'] == 'India'
    assert client.get('/user/address', headers=user).json()['phone'] == '1234567890'

def test_shipping_fee_and_discount_are_server_controlled(client, user, admin, monkeypatch):
    from app.config import settings
    from decimal import Decimal
    monkeypatch.setattr(settings, 'shipping_fee', Decimal('20.00'))
    p = create_product(client, admin)
    client.post('/user/addtocart/'+p['id'], headers=user)
    cart = client.get('/user/cart?discount=999999', headers=user).json()
    assert cart['total'] == 110 and cart['pricing']['shippingFee'] == 20
    order = place(client, user).json()
    assert order['total'] == 110 and order['shippingFee'] == 20
