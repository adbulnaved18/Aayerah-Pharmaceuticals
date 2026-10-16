# Base — FastAPI + PostgreSQL rewrite

This package contains the complete Python backend and the supplied React frontend updated to use it. Start here; the feature/attribute analysis is in `docs/FEATURE_AUDIT.md`.

The ZIP's extracted working files contained only the frontend. Its bundled repository history also contained the original Express/Mongoose backend on `origin/dev`. That backend's models, controllers, routes and middleware were inspected for this rewrite. No live database export or production secrets were supplied, so this creates a fresh database; it does not migrate live records.

## Included

- FastAPI, Python 3.12, SQLAlchemy 2, psycopg 3, PostgreSQL and Alembic migrations.
- Customer and owner authentication, Argon2 password hashing, expiring and revocable bearer sessions.
- Products, category/search filters, percentage discounts, stock, theme colors and image uploads.
- User pictures, owner pictures/GSTIN/discount metadata and owner product associations.
- Persistent carts with quantity changes and per-account saved addresses.
- Transactional checkout, immutable order snapshots, idempotent retries and PostgreSQL stock locking.
- Owner order list, status transitions, cancellation/restocking and collected-revenue statistics.
- React integration: authentication, catalog/admin uploads, carts, shipping, checkout and dashboard now use the API.
- Docker Compose, schema SQL, tests, PostgreSQL CI workflow and API documentation.

## Quick start — Docker Desktop (Windows/macOS/Linux)

1. Extract the ZIP, open a terminal in `Base-forked`.
2. Copy `.env.example` to `.env` and replace `POSTGRES_PASSWORD` with a long random **alphanumeric** password. This root file is used by Compose. Never commit it.
3. Start PostgreSQL and the API:

```powershell
docker compose up --build -d
```

4. Create the first owner (the command prompts for a password):

```powershell
docker compose exec api python -m app.cli create-owner --email owner@example.com --name "Store Owner"
```

5. Open another terminal for the frontend:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev -- --host 127.0.0.1
```

On macOS/Linux, use `cp .env.example .env`. Open the frontend URL printed by Vite (the supplied config defaults to port 8080). Go to `/admin/login`, sign in with the owner account, and add products. Customer signup is separate.

API documentation: `http://localhost:8000/docs`.
Liveness: `http://localhost:8000/api/health`.
Database readiness: `http://localhost:8000/api/ready`.

Compose runs migrations before starting the API and persists both PostgreSQL data and images in named volumes. `docker compose down` keeps those volumes; `down -v` deletes them.

## Run Python directly with your own PostgreSQL

Create an empty PostgreSQL database first. In `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.lock
Copy-Item .env.example .env
```

Edit `backend/.env` with your actual PostgreSQL URL. Then:

```powershell
alembic upgrade head
python -m app.cli create-owner --email owner@example.com --name "Store Owner"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

On Linux/macOS activate with `source .venv/bin/activate`. Run these commands from `backend` so `.env` and Alembic resolve correctly. `requirements.lock` records the versions used for verification (including test dependencies); `requirements.txt` describes runtime version ranges.

The database URL accepts `postgresql+psycopg://`, `postgresql://` or `postgres://`. URL-encode special characters in manually assembled connection strings. Use your database provider's TLS connection settings in production, for example `?sslmode=require` where supported.

## Configuration

| Setting             | Default / purpose                                                               |
| ------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string; backend only                                      |
| `CORS_ORIGINS`      | JSON array of exact frontend origins; ports 5173 and 8080 locally               |
| `PUBLIC_BASE_URL`   | Browser-accessible backend origin used in uploaded image URLs                   |
| `UPLOAD_DIR`        | Image directory; must be persistent when hosted                                 |
| `MAX_IMAGE_BYTES`   | 5 MiB per image                                                                 |
| `SESSION_HOURS`     | 24-hour bearer session lifetime                                                 |
| `SHIPPING_FEE`      | 20.00 per non-empty order, matching the legacy backend; set 0 for free shipping |
| `CURRENCY`          | INR; bundled frontend displays rupees                                           |
| `VITE_API_BASE_URL` | Frontend `.env`: backend origin, with no trailing slash required                |

Root Compose `.env` and `backend/.env` serve different launch methods. Compose supplies settings directly; it does not automatically read the backend `.env` file. Set `SHIPPING_FEE` in root `.env` for Compose.

## Checkout behavior

Only pay-on-delivery (`cod`) is enabled. The old checkout merely waited two seconds and wrote a browser-local “completed” order; it did not charge a card. This rewrite removes that simulated card form. Orders start `pending` and `unpaid`; the owner advances them to `confirmed`, `shipped`, then `delivered`. The last step explicitly confirms COD collection and marks the order paid.

Real card/UPI payments and confirmation email delivery are not implemented because there was no payment or email provider integration in the supplied project. Use provider-hosted checkout and verified webhooks if adding online payments; do not send card details to this API.

Prices, discounts, shipping and totals are calculated on the server. Stock is deducted only on checkout, not when adding to cart. Pending/confirmed orders may be cancelled, restoring stock once. Products are archived instead of hard-deleted to preserve order history.

## Tests

```powershell
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

The default test suite uses an isolated SQLite database only as a fast test fixture. The application configuration targets PostgreSQL. To run all tests including row-lock concurrency against PostgreSQL:

```powershell
₹env:TEST_DATABASE_URL="postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/base_test"
python -m pytest -q
```

Create `base_test` first. The test user needs permission to create schemas; each test creates and drops its own random schema. Never point test tooling at your production database. The supplied GitHub Actions workflow provisions PostgreSQL 16, applies/checks migrations and runs all tests.

See `docs/VERIFICATION.md` for what was actually verified in the authoring environment and what remains unverified.

## Hosting

Build: `pip install -r requirements.lock` from `backend`.
Migration step: `alembic upgrade head` (once per release, before starting new workers).
Start: `uvicorn app.main:app --host 0.0.0.0 --port ₹PORT` (set the port required by your host).
Frontend: run `npm ci && npm run build` in `frontend`, publish `dist`, and configure an SPA fallback to `index.html`.

Use a persistent image mount and set `UPLOAD_DIR` and `PUBLIC_BASE_URL`. The default file storage is suitable for a single API instance with a persistent disk. Multiple instances require shared object storage; do not place these uploads on an ephemeral filesystem. Database rows contain image URLs/IDs, not image bytes. Back up the database and image directory together.

Before public deployment, configure HTTPS and gateway rate limits for authentication/upload routes and a request-body limit. Sessions are stored hashed in PostgreSQL; the frontend keeps the bearer token in localStorage, so protect the frontend against XSS. This package has not been deployed or load-tested against your hosting accounts.
