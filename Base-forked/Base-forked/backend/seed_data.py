import uuid
from decimal import Decimal
from app.database import SessionLocal
from app.models import User, Product
from sqlalchemy import select

SAMPLE_PRODUCTS = []


def seed():
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.role == "owner"))
        owner_id = owner.id if owner else None
        
        for pdata in SAMPLE_PRODUCTS:
            existing = db.scalar(select(Product).where(Product.id == pdata["id"]))
            if not existing:
                prod = Product(
                    id=pdata["id"],
                    owner_id=owner_id,
                    name=pdata["name"],
                    description=pdata["description"],
                    category=pdata["category"],
                    price=pdata["price"],
                    stock=pdata["stock"],
                    discount=pdata["discount"],
                    image=pdata["image"],
                    bgColor=pdata["bgColor"],
                    panelColor=pdata["panelColor"],
                    textColor=pdata["textColor"],
                    active=True
                )
                db.add(prod)
                print(f"Added product: {pdata['name']}")
            else:
                print(f"Product exists: {pdata['name']}")
        db.commit()
    print("Seeding finished.")

if __name__ == "__main__":
    seed()
