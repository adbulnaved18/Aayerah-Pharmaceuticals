BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 1440e7cb0ced

CREATE TABLE users (
    id VARCHAR(36) NOT NULL, 
    email VARCHAR(254) NOT NULL, 
    fullname VARCHAR(120) NOT NULL, 
    password_hash TEXT NOT NULL, 
    picture TEXT NOT NULL, 
    gstin VARCHAR(15) NOT NULL, 
    discounts VARCHAR(200) NOT NULL, 
    role VARCHAR(10) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (role IN ('user','owner'))
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE addresses (
    user_id VARCHAR(36) NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (user_id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE orders (
    id VARCHAR(36) NOT NULL, 
    user_id VARCHAR(36) NOT NULL, 
    idempotency_key VARCHAR(100) NOT NULL, 
    request_hash VARCHAR(64) NOT NULL, 
    shipping_address JSON NOT NULL, 
    shipping_fee NUMERIC(12, 2) NOT NULL, 
    total NUMERIC(20, 2) NOT NULL, 
    currency VARCHAR(3) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    payment_status VARCHAR(20) NOT NULL, 
    payment_method VARCHAR(20) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')), 
    CHECK (total >= 0), 
    FOREIGN KEY(user_id) REFERENCES users (id), 
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX ix_orders_created_at ON orders (created_at);

CREATE INDEX ix_orders_user_id ON orders (user_id);

CREATE TABLE products (
    id VARCHAR(36) NOT NULL, 
    owner_id VARCHAR(36), 
    image_public_id TEXT NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    description TEXT NOT NULL, 
    price NUMERIC(12, 2) NOT NULL, 
    category VARCHAR(100) NOT NULL, 
    stock INTEGER NOT NULL, 
    discount NUMERIC(5, 2) NOT NULL, 
    image TEXT NOT NULL, 
    "bgColor" VARCHAR(7) NOT NULL, 
    "panelColor" VARCHAR(7) NOT NULL, 
    "textColor" VARCHAR(7) NOT NULL, 
    active BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (discount BETWEEN 0 AND 100), 
    CHECK (price >= 0), 
    CHECK (stock >= 0), 
    FOREIGN KEY(owner_id) REFERENCES users (id)
);

CREATE INDEX ix_products_active ON products (active);

CREATE INDEX ix_products_category ON products (category);

CREATE INDEX ix_products_name ON products (name);

CREATE INDEX ix_products_owner_id ON products (owner_id);

CREATE TABLE sessions (
    token_hash VARCHAR(64) NOT NULL, 
    user_id VARCHAR(36) NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (token_hash), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE cart_items (
    user_id VARCHAR(36) NOT NULL, 
    product_id VARCHAR(36) NOT NULL, 
    quantity INTEGER NOT NULL, 
    PRIMARY KEY (user_id, product_id), 
    CHECK (quantity BETWEEN 1 AND 999), 
    FOREIGN KEY(product_id) REFERENCES products (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE order_items (
    id VARCHAR(36) NOT NULL, 
    order_id VARCHAR(36) NOT NULL, 
    product_id VARCHAR(36) NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    image TEXT NOT NULL, 
    price NUMERIC(12, 2) NOT NULL, 
    quantity INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (quantity > 0), 
    FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE, 
    FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX ix_order_items_order_id ON order_items (order_id);

INSERT INTO alembic_version (version_num) VALUES ('1440e7cb0ced') RETURNING alembic_version.version_num;

COMMIT;

