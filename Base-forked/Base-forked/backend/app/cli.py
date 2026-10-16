import argparse
import getpass
from sqlalchemy import select
from .database import SessionLocal
from .models import User
from .schemas import Register
from .security import passwords

def main():
    parser = argparse.ArgumentParser(description='Create the first owner without public administrator signup')
    parser.add_argument('command', choices=['create-owner'])
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--password', required=False, default=None)
    args = parser.parse_args()
    if args.password:
        password = args.password
    else:
        password = getpass.getpass('Password (8+ characters): ')
        if password != getpass.getpass('Confirm password: '): raise SystemExit('Passwords differ')
    data = Register(email=args.email, fullname=args.name, password=password)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == str(data.email).lower())):
            raise SystemExit('Email already exists; no changes made')
        db.add(User(email=str(data.email).lower(), fullname=data.fullname, password_hash=passwords.hash(data.password), role='owner'))
        db.commit()
    print('Owner created')

if __name__ == '__main__': main()
