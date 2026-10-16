import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Product, InventoryOperation, InventoryMovement, User, Base
from app.services.inventory_service import add_stock
import random

def test_idempotent_addition():
    # Use a fresh in-memory SQLite DB for testing
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    # Create mock owner
    user = User(email=f"test_{random.randint(1,1000)}@example.com", fullname="Test Owner", password_hash="hashed", role="owner")
    db.add(user)
    db.commit()

    # Create a test product
    prod = Product(name="Test Product", description="Test Desc", price=10.0, category="Test", sku=f"TEST-SKU-{random.randint(1,1000)}", stock=0)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    
    print(f"Initial stock for {prod.name}: {prod.stock}")
    
    from datetime import datetime, timezone
    # Simulate a restock operation
    op = InventoryOperation(operation_type="RESTOCK", source_document_id="RCV-001", actor_id=user.id, posting_key=str(uuid.uuid4()), effective_date=datetime.now(timezone.utc))
    db.add(op)
    db.flush()
    
    # 1st addition
    updated_prod = add_stock(db, prod.id, 100, op.id, "Monthly Restock")
    print(f"Stock after first addition: {updated_prod.stock}")
    
    # Try 2nd addition on the exact same product and operation.
    # In a full Postgres setup, this relies on UniqueConstraint of (operation_id, source_line_id, product_id)
    # Since we use SQLite in dev, it will also throw IntegrityError.
    
    try:
        add_stock(db, prod.id, 100, op.id, "Monthly Restock Duplicate Attempt")
        db.commit()
        print("FAIL: Duplicate was incorrectly allowed.")
    except Exception as e:
        db.rollback()
        print("SUCCESS: Duplicate addition prevented by unique constraint.")

    print("Idempotency test completed.")
    db.close()

if __name__ == "__main__":
    test_idempotent_addition()
