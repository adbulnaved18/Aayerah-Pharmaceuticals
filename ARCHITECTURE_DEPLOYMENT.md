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

## Storage Architecture & Migration (Render Free + Supabase)

To support deploying the FastAPI backend on **Render Free** (which does not provide persistent disk storage and uses an ephemeral filesystem that resets on every deploy or restart), durable file storage has been migrated to **Supabase Storage**.

### Storage Modes (`STORAGE_BACKEND`)
- **`local` (Development / Test default)**:
  - Uses `UPLOAD_DIR` (e.g. `./uploads`).
  - FastAPI mounts `/uploads` as a `StaticFiles` route.
  - Suitable for local development and offline unit testing without external network dependencies.
- **`supabase` (Production on Render Free)**:
  - Uses Supabase Storage REST API with bounded timeouts and safe retries via HTTPX.
  - Does NOT mount `/uploads` as a static directory.
  - All product images are uploaded to the public `product-images` bucket.
  - All invoices and offline sale attachments are uploaded to the private `private-documents` bucket.
  - Never silently falls back to local disk if Supabase calls fail in production.

---

## Supabase Buckets & Access Configuration

### 1. `product-images` (Public Read)
- **Public**: `true`
- **Allowed MIME Types**: `image/webp`, `image/jpeg`, `image/png`, `image/gif`
- **File Size Limit**: 5 MB (`MAX_IMAGE_BYTES=5242880`)
- **Row-Level Security (RLS)**:
  - Public `SELECT` policy enabled for direct CDN/browser consumption.
  - **No public `INSERT`, `UPDATE`, or `DELETE` policies**.
  - All image uploads, replacements, and deletions are executed server-side by FastAPI using the `SUPABASE_SERVICE_ROLE_KEY`.

### 2. `private-documents` (Private)
- **Public**: `false`
- **Allowed MIME Types**: `application/pdf`, `image/*`, `application/vnd.ms-excel`, `.xlsx`, `.csv`
- **File Size Limit**: 15 MB
- **Access Control**:
  - Strictly private with no public policies.
  - Authenticated and authorized owner access only.
  - FastAPI acts as a secure streaming proxy (`Content-Disposition: inline` for preview, `attachment` for download, and `Cache-Control: private, no-cache, no-store`).

### Setup Commands
To automatically initialize the buckets and policies, run either:
```bash
# Option A: Automated Python script
cd Base-forked/Base-forked/backend
python -m scripts.setup_supabase_storage

# Option B: Run SQL script in Supabase Dashboard SQL Editor
# File: Base-forked/Base-forked/backend/scripts/setup_supabase_storage.sql
```

---

## Free-Tier Limits & Operational Considerations

### 1. Render Free Web Services
- **Ephemeral Filesystem**: Any files written to disk (e.g., `/tmp`) disappear when the container restarts or redeploys. Supabase Storage ensures zero data loss.
- **Cold Starts**: Render Free instances spin down after 15 minutes of inactivity. The initial incoming request incurs a 30–50 second cold start delay.
- **Resources**: 512 MB RAM, 0.1 CPU core, 750 free instance hours per month.
- **No Disks**: Persistent disks (`disk:` directive) are prohibited on the free plan; `render.yaml` specifies `plan: free` without disk mounts.

### 2. Supabase Storage Free Tier Limits
- **Storage Allowance**: 1 GB total storage across all buckets.
- **Egress Bandwidth**: 2 GB per month cached egress.
- **File Size Limit**: Up to 50 MB per object (project restricts images to 5 MB and documents to 15 MB).
- **Security**: The `SUPABASE_SERVICE_ROLE_KEY` must remain strictly server-side in backend environment variables. It must **never** be injected into Vite storefront environment variables or committed to version control.

---

## Environment Variables

### Commerce API (`Base-forked/Base-forked/backend/.env`)
| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://user:pass@host:5432/dbname` |
| `CORS_ORIGINS` | JSON array of allowed browser origins | `["https://aayerah.com", "http://localhost:5173"]` |
| `PUBLIC_BASE_URL` | Public origin of the API | `https://api.aayerah.com` |
| `STORAGE_BACKEND` | Storage provider (`local` or `supabase`) | `supabase` (prod) / `local` (dev) |
| `UPLOAD_DIR` | Local storage folder (local mode only) | `./uploads` |
| `SUPABASE_URL` | Supabase Project URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend service-role secret | `ey...` |
| `SUPABASE_PRODUCT_IMAGES_BUCKET` | Public bucket for product pictures | `product-images` |
| `SUPABASE_PRIVATE_FILES_BUCKET` | Private bucket for invoices/attachments | `private-documents` |
| `MAX_IMAGE_BYTES` | Maximum image size in bytes | `5242880` (5 MB) |
| `SESSION_HOURS` | Session expiry time in hours | `24` |
| `CURRENCY` | Active currency code | `INR` |
| `SHIPPING_FEE` | Flat delivery charge | `20.00` |
| `GEMINI_API_KEY` | OCR / Gemini AI API Key (optional) | `AIza...` |

### Storefront (`aairah-pharma-codebase/artifacts/aairah-pharma/.env`)
| Variable | Description | Example / Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API URL | `https://api.aayerah.com` |
| `VITE_SITE_URL` | Storefront canonical URL | `https://aayerah.com` |

---

## Existing File Migration Tool

To migrate existing local files from `uploads/` to Supabase Storage:
```bash
cd Base-forked/Base-forked/backend

# 1. Run dry-run simulation (no changes made)
python -m app.commands.migrate_storage --dry-run

# 2. Execute live migration with verification
python -m app.commands.migrate_storage --apply
```
- **Safe & Idempotent**: Skips already migrated files.
- **Verification**: Confirms remote file read before updating database pointers.
- **Non-destructive**: Preserves original local files on disk.
- **Rollback on Error**: Rolls back database transaction if any failure occurs.
