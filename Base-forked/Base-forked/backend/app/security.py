import hashlib
import secrets
from datetime import timedelta, timezone
from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pwdlib import PasswordHash
from sqlalchemy.orm import Session as DBSession
from .database import get_db
from .models import User, Session, now
from .config import settings

passwords = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
DB = Annotated[DBSession, Depends(get_db)]

def digest(token): return hashlib.sha256(token.encode()).hexdigest()

def issue_session(db, user):
    token = secrets.token_urlsafe(48)
    db.add(Session(token_hash=digest(token), user_id=user.id, expires_at=now() + timedelta(hours=settings.session_hours)))
    db.commit()
    return token

def current_user(db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if not credentials:
        raise HTTPException(401, 'Authentication required')
    session = db.get(Session, digest(credentials.credentials))
    expiry = session.expires_at if session else None
    if expiry and expiry.tzinfo is None: expiry = expiry.replace(tzinfo=timezone.utc)
    if not session or expiry <= now():
        raise HTTPException(401, 'Session expired or invalid')
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, 'Account unavailable')
    return user

Current = Annotated[User, Depends(current_user)]

def owner(user: Current):
    if user.role != 'owner': raise HTTPException(403, 'Owner access required')
    return user

Owner = Annotated[User, Depends(owner)]

def get_user_from_raw_token(db: DBSession, raw_token: str | None) -> User | None:
    if not raw_token:
        return None
    session = db.get(Session, digest(raw_token))
    if not session:
        return None
    expiry = session.expires_at
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if not expiry or expiry <= now():
        return None
    return db.get(User, session.user_id)

