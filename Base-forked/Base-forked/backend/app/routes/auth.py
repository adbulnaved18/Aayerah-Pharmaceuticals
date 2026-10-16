from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..models import User, Session, Product
from ..schemas import Register, Login, Profile, OwnerProfile
from ..security import DB, Current, Owner, passwords, issue_session, digest, bearer
from ..serializers import user_json

router = APIRouter(tags=['Authentication'])

def register_account(data, db, role):
    user = User(email=str(data.email).lower(), fullname=data.fullname, password_hash=passwords.hash(data.password), role=role)
    db.add(user)
    try: db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Email already registered')
    return user

@router.post('/user/register', status_code=201)
def register(data: Register, db: DB):
    user = register_account(data, db, 'user')
    u = user_json(user)
    return {'user': u, 'token': issue_session(db, user)}

@router.post('/owner/register', status_code=201)
def register_owner(data: Register, db: DB, admin: Owner):
    user = register_account(data, db, 'owner')
    return {'owner': user_json(user), 'user': user_json(user)}

def login_account(data, db, role):
    user = db.scalar(select(User).where(User.email == str(data.email).lower(), User.role == role))
    # Verify a dummy hash on unknown accounts to avoid an obvious timing distinction.
    target = user.password_hash if user else DUMMY_HASH
    valid = passwords.verify(data.password, target)
    if not user or not valid: raise HTTPException(401, 'Invalid email or password')
    u_json = user_json(user)
    return {'owner': u_json, 'user': u_json, 'token': issue_session(db, user)}

DUMMY_HASH = passwords.hash('unused-random-dummy-password')

@router.post('/user/login')
def login(data: Login, db: DB): return login_account(data, db, 'user')

@router.post('/owner/login')
def owner_login(data: Login, db: DB): return login_account(data, db, 'owner')

@router.get('/user/me')
def me(user: Current):
    u = user_json(user)
    return {'user': u, 'owner': u, **u}

@router.post('/user/logout')
@router.post('/owner/logout')
def logout(db: DB, user: Current, credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)]):
    session = db.get(Session, digest(credentials.credentials))
    if session: db.delete(session)
    db.commit()
    return {'message': 'Logged out'}


@router.get('/user/profile')
def get_profile(user: Current): return user_json(user)

@router.patch('/user/profile')
def update_profile(data: Profile, db: DB, user: Current):
    for key, value in data.model_dump(exclude_none=True, mode='json').items(): setattr(user, key, value)
    db.commit()
    return user_json(user)

@router.get('/owner/profile')
def get_owner_profile(db: DB, admin: Owner):
    return {**user_json(admin), 'gstin': admin.gstin, 'discounts': admin.discounts,
            'products': list(db.scalars(select(Product.id).where(Product.owner_id == admin.id, Product.active.is_(True))))}

@router.patch('/owner/profile')
def update_owner_profile(data: OwnerProfile, db: DB, admin: Owner):
    for key, value in data.model_dump(exclude_none=True, mode='json').items(): setattr(admin, key, value)
    db.commit()
    return get_owner_profile(db, admin)
