# Aayerah Pharma: Architecture and Deployment Guide

## Service Layout

| Service | Root Path | Technology | Production Role |
|---|---|---|---|
| **WEB** (Storefront) | `aairah-pharma-codebase/artifacts/aairah-pharma/` | React, Vite, TypeScript | Canonical public storefront & admin UI |
| **API** (Commerce API) | `Base-forked/Base-forked/backend/` | FastAPI, SQLAlchemy, Alembic | Canonical commerce & administration backend |
| **OLD** (Legacy Frontend) | `Base-forked/Base-forked/frontend/` | React, Vite | Reference-only (not deployed to production) |
| **BOT** (Chatbot Prototype) | `aairah-pharma-codebase/artifacts/chatbot-backend/` | FastAPI, In-memory RAG | Disabled until hardened with persistent storage & secure auth |
| **WORKSPACE** | `aairah-pharma-codebase/` | pnpm workspace | Shared workspace root |

---

## Environment Variables

### Commerce API (`Base-forked/Base-forked/backend/.env`)
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql+psycopg://user:pass@host:5432/dbname`)
- `CORS_ORIGINS`: JSON array of allowed origins (e.g. `["https://aayerah.com", "https://admin.aayerah.com"]`)
- `PUBLIC_BASE_URL`: Public-facing API origin for static uploads (e.g. `https://api.aayerah.com`)
- `UPLOAD_DIR`: Path to persistent uploads directory (e.g. `/data/uploads` or `./uploads`)
- `MAX_IMAGE_BYTES`: Maximum allowed image upload size in bytes (default: `5242880` = 5MB)
- `SESSION_HOURS`: Token session validity duration in hours (default: `24`)
- `CURRENCY`: Currency code (default: `INR`)
- `SHIPPING_FEE`: Flat shipping charge (default: `20.00`)
- `GEMINI_API_KEY`: API key for optional OCR extraction / assistant

### Storefront (`aairah-pharma-codebase/artifacts/aairah-pharma/.env`)
- `VITE_API_BASE_URL`: Public API URL for browser requests (e.g. `https://api.aayerah.com`)
- `VITE_SITE_URL`: Canonical site domain for SEO & social cards (e.g. `https://aayerah.com`)
- `PORT`: Development server port (default: `5173`)
- `BASE_PATH`: Deployment base path (default: `/`)

---

## Build & Run Commands

### Backend (Python 3.11+)
```bash
cd Base-forked/Base-forked/backend

# Install dependencies
pip install -r requirements.lock

# Run database migrations
alembic upgrade head

# Run tests
python -m pytest

# Start production server
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 4
```

### Storefront (Node 22+, pnpm 10+)
```bash
cd aairah-pharma-codebase

# Install dependencies
pnpm install --frozen-lockfile

# Typecheck and build
pnpm run build

# Build output:
# aairah-pharma-codebase/artifacts/aairah-pharma/dist/public
```

---

## Persistence & Storage Requirements

1. **PostgreSQL Database**:
   - Requires persistent PostgreSQL instance.
   - Migrations managed via Alembic (`alembic upgrade head`).
   - Transactional user & product row locking during checkout and inventory mutations.

2. **File Storage**:
   - Product images: Stored on persistent disk or S3-compatible object storage mounted at `UPLOAD_DIR`.
   - Invoice uploads & offline sales documents: Persisted and restricted from public directory listing.

3. **Security Constraints**:
   - Real `.env` files must NEVER be packaged into deployment containers.
   - All client-side secrets are strictly prohibited; `VITE_*` keys are publicly readable in bundles.
