import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, ForeignKey, CheckConstraint, UniqueConstraint, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

def uid(): return str(uuid.uuid4())
def now(): return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    fullname: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(Text)
    picture: Mapped[str] = mapped_column(Text, default='')
    gstin: Mapped[str] = mapped_column(String(15), default='')
    discounts: Mapped[str] = mapped_column(String(200), default='0')
    role: Mapped[str] = mapped_column(String(10), default='user')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (CheckConstraint("role IN ('user','owner')"),)

class Session(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class Product(Base):
    __tablename__ = 'products'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), index=True)
    image_public_id: Mapped[str] = mapped_column(Text, default='')
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    category: Mapped[str] = mapped_column(String(100), index=True)
    stock: Mapped[int] = mapped_column(default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    image: Mapped[str] = mapped_column(Text, default='')
    bgColor: Mapped[str] = mapped_column(String(7), default='#ffffff')
    panelColor: Mapped[str] = mapped_column(String(7), default='#ffffff')
    textColor: Mapped[str] = mapped_column(String(7), default='#000000')
    active: Mapped[bool] = mapped_column(default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    sku: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    stock_unit: Mapped[str] = mapped_column(String(50), default='unit')
    stock_version: Mapped[int] = mapped_column(default=1)
    __table_args__ = (CheckConstraint('price >= 0'), CheckConstraint('stock >= 0'), CheckConstraint('discount BETWEEN 0 AND 100'))

class ProductUnitConversion(Base):
    __tablename__ = 'product_unit_conversions'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id', ondelete='CASCADE'), index=True)
    input_unit: Mapped[str] = mapped_column(String(50))
    factor: Mapped[Decimal] = mapped_column(Numeric(10, 4))
    active: Mapped[bool] = mapped_column(default=True)
    __table_args__ = (UniqueConstraint('product_id', 'input_unit'),)

class StoredFile(Base):
    __tablename__ = 'stored_files'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    original_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column()
    sha256: Mapped[str] = mapped_column(String(64))
    uploader_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class StockImport(Base):
    __tablename__ = 'stock_imports'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    file_id: Mapped[str] = mapped_column(ForeignKey('stored_files.id'))
    receipt_reference: Mapped[str] = mapped_column(String(100), index=True)
    source: Mapped[str | None] = mapped_column(String(100))
    month: Mapped[str | None] = mapped_column(String(20))
    received_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(50), default='uploaded')
    draft_revision: Mapped[int] = mapped_column(default=1)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request_fingerprint: Mapped[str | None] = mapped_column(String(100))

class StockImportRow(Base):
    __tablename__ = 'stock_import_rows'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    import_id: Mapped[str] = mapped_column(ForeignKey('stock_imports.id', ondelete='CASCADE'), index=True)
    row_number: Mapped[int] = mapped_column()
    raw_sku: Mapped[str | None] = mapped_column(String(100))
    product_id: Mapped[str | None] = mapped_column(ForeignKey('products.id'))
    received_quantity: Mapped[int] = mapped_column()
    input_unit: Mapped[str] = mapped_column(String(50))
    conversion_factor: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=1)
    validation_messages: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(50), default='pending')

class InventoryOperation(Base):
    __tablename__ = 'inventory_operations'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    operation_type: Mapped[str] = mapped_column(String(50))
    source_document_id: Mapped[str] = mapped_column(String(100), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    effective_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    posting_key: Mapped[str] = mapped_column(String(100), unique=True)
    reversal_of: Mapped[str | None] = mapped_column(ForeignKey('inventory_operations.id'))

class InventoryMovement(Base):
    __tablename__ = 'inventory_movements'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    operation_id: Mapped[str] = mapped_column(ForeignKey('inventory_operations.id', ondelete='CASCADE'), index=True)
    source_line_id: Mapped[str] = mapped_column(String(100))
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id'), index=True)
    delta: Mapped[int] = mapped_column()
    balance_before: Mapped[int] = mapped_column()
    balance_after: Mapped[int] = mapped_column()
    reason: Mapped[str | None] = mapped_column(String(255))
    __table_args__ = (UniqueConstraint('operation_id', 'source_line_id', 'product_id'),)

class CartItem(Base):
    __tablename__ = 'cart_items'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id'), primary_key=True)
    quantity: Mapped[int] = mapped_column()
    __table_args__ = (CheckConstraint('quantity BETWEEN 1 AND 999'),)

class Address(Base):
    __tablename__ = 'addresses'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)

class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    shipping_address: Mapped[dict] = mapped_column(JSON)
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(20), default='pending')
    payment_status: Mapped[str] = mapped_column(String(20), default='unpaid')
    payment_method: Mapped[str] = mapped_column(String(20), default='cod')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    __table_args__ = (UniqueConstraint('user_id', 'idempotency_key'), CheckConstraint('total >= 0'), CheckConstraint("status IN ('pending','confirmed','shipped','delivered','cancelled')"))

class OrderItem(Base):
    __tablename__ = 'order_items'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id', ondelete='CASCADE'), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id'))
    name: Mapped[str] = mapped_column(String(200))
    image: Mapped[str] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column()
    __table_args__ = (CheckConstraint('quantity > 0'),)


# ─── Feature 2: Offline Sales & Invoice Models ───────────────────────────────

class InvoiceUpload(Base):
    __tablename__ = 'invoice_uploads'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    file_id: Mapped[str | None] = mapped_column(ForeignKey('stored_files.id'), nullable=True)
    original_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column()
    page_count: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(50), default='uploaded')  # uploaded, queued, extracting, needs_review, ready, posted, failed
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reviewed_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    revision: Mapped[int] = mapped_column(default=1)
    history_only: Mapped[bool] = mapped_column(default=False)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class OfflineSale(Base):
    __tablename__ = 'offline_sales'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    upload_id: Mapped[str | None] = mapped_column(ForeignKey('invoice_uploads.id'), nullable=True, index=True)
    business_name: Mapped[str] = mapped_column(String(200), default='Aayerah Pharmaceuticals')
    invoice_series: Mapped[str] = mapped_column(String(50), default='')
    invoice_number: Mapped[str] = mapped_column(String(100), index=True)
    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(200), default='')
    customer_contact: Mapped[str] = mapped_column(String(100), default='')
    currency: Mapped[str] = mapped_column(String(3), default='INR')
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    charges: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    roundoff: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    payment_status: Mapped[str] = mapped_column(String(30), default='unpaid')  # unpaid, partial, paid
    status: Mapped[str] = mapped_column(String(30), default='posted')  # posted, partially_credited, credited, voided
    inventory_applied: Mapped[bool] = mapped_column(default=True)
    history_only: Mapped[bool] = mapped_column(default=False)
    posting_key: Mapped[str] = mapped_column(String(100), unique=True)
    posted_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (CheckConstraint('total >= 0'),)


class OfflineSaleLine(Base):
    __tablename__ = 'offline_sale_lines'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sale_id: Mapped[str] = mapped_column(ForeignKey('offline_sales.id', ondelete='CASCADE'), index=True)
    line_index: Mapped[int] = mapped_column()
    product_id: Mapped[str | None] = mapped_column(ForeignKey('products.id'), nullable=True, index=True)
    is_non_stock: Mapped[bool] = mapped_column(default=False)
    sku_snapshot: Mapped[str] = mapped_column(String(100), default='')
    name_snapshot: Mapped[str] = mapped_column(String(200), default='')
    input_quantity: Mapped[int] = mapped_column()
    free_quantity: Mapped[int] = mapped_column(default=0)
    input_unit: Mapped[str] = mapped_column(String(50), default='unit')
    conversion_factor: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=1)
    base_quantity: Mapped[int] = mapped_column()  # total base units to deduct
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    line_tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    returned_quantity: Mapped[int] = mapped_column(default=0)


class SaleAttachment(Base):
    __tablename__ = 'sale_attachments'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sale_id: Mapped[str | None] = mapped_column(ForeignKey('offline_sales.id', ondelete='CASCADE'), nullable=True, index=True)
    upload_id: Mapped[str | None] = mapped_column(ForeignKey('invoice_uploads.id', ondelete='CASCADE'), nullable=True, index=True)
    file_id: Mapped[str] = mapped_column(ForeignKey('stored_files.id'))
    original_filename: Mapped[str] = mapped_column(String(255))
    page_order: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SalePayment(Base):
    __tablename__ = 'sale_payments'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sale_id: Mapped[str] = mapped_column(ForeignKey('offline_sales.id', ondelete='CASCADE'), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    collection_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    method: Mapped[str] = mapped_column(String(50), default='cash')  # cash, upi, bank_transfer, card, cheque
    reference: Mapped[str] = mapped_column(String(100), default='')
    recording_key: Mapped[str] = mapped_column(String(100), unique=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SaleReturn(Base):
    __tablename__ = 'sale_returns'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sale_id: Mapped[str] = mapped_column(ForeignKey('offline_sales.id'), index=True)
    line_id: Mapped[str | None] = mapped_column(ForeignKey('offline_sale_lines.id'), nullable=True)
    quantity: Mapped[int] = mapped_column()
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    return_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    restock_sellable: Mapped[bool] = mapped_column(default=True)
    disposition: Mapped[str] = mapped_column(String(50), default='sellable')  # sellable, damaged, expired, quarantined
    reason: Mapped[str] = mapped_column(String(255))
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = 'audit_events'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(50))
    revision: Mapped[int] = mapped_column(default=1)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

