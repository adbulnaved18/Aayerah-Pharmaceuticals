import os
import tempfile
os.environ.setdefault('DATABASE_URL', 'sqlite://')
os.environ['SHIPPING_FEE'] = '0.00'
os.environ.setdefault('UPLOAD_DIR', tempfile.mkdtemp(prefix='base-images-'))
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app
from app.models import User
from app.security import passwords

@pytest.fixture()
def database():
    test_url = os.getenv('TEST_DATABASE_URL')
    schema = None
    if test_url:
        import uuid
        schema = 'test_' + uuid.uuid4().hex
        admin_engine = create_engine(test_url)
        with admin_engine.begin() as connection: connection.execute(text(f'CREATE SCHEMA {schema}'))
        engine = create_engine(test_url, connect_args={'options': f'-csearch_path={schema}'})
    else:
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        @event.listens_for(engine, 'connect')
        def foreign_keys(connection, _): connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    def override():
        with factory() as db:
            try: yield db
            except Exception:
                db.rollback()
                raise
    app.dependency_overrides[get_db] = override
    yield factory, engine
    app.dependency_overrides.clear()
    engine.dispose()
    if schema:
        with admin_engine.begin() as connection: connection.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        admin_engine.dispose()

@pytest.fixture()
def client(database):
    with TestClient(app) as client: yield client

@pytest.fixture()
def admin(client, database):
    with database[0]() as db:
        db.add(User(fullname='Owner', email='owner@example.com', role='owner', password_hash=passwords.hash('test-password')))
        db.commit()
    response = client.post('/owner/login', json={'email':'owner@example.com','password':'test-password'})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['token']}

@pytest.fixture()
def user(client):
    response = client.post('/user/register', json={'fullname':'Customer', 'email':'user@example.com', 'password':'test-password'})
    assert response.status_code == 201, response.text
    return {'Authorization': 'Bearer ' + response.json()['token']}
