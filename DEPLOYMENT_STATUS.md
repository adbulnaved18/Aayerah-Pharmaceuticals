# Deployment preparation — 16 October 2026

Source: main at f28c7949432c7f1a67bd97e21b3817a2bf6aaccd. Follow ARCHITECTURE_DEPLOYMENT.md.

Prepared targets:
- Vercel: project root `aairah-pharma-codebase`; production output `artifacts/aairah-pharma/dist/public`. Deploy only the canonical web app. Use Node 22 and the pinned pnpm package manager. Set `VITE_API_BASE_URL` and `VITE_SITE_URL` to actual deployed URLs before the production build.
- Render: `render.yaml` specifies the canonical API in Singapore, Starter compute, one worker, and a 1 GB persistent disk at `/var/data`. This is a proposed paid configuration, not an applied resource.
- Supabase: create a dedicated Aayerah PostgreSQL project after organization selection. Do not reuse CivicPulse. Use its session-pooler connection string with TLS. Apply Alembic, then restrict public Data API access to application tables and verify RLS/advisors before public traffic.
- Legacy frontend and separate chatbot prototype: not deployed.

Deployment fixes in this branch:
1. Correct the pnpm install guard's accidental rupee symbol to the shell variable marker.
2. Correct the same marker corruption in the Alembic template.
3. Include current invoice/sheet extraction dependencies in the Python lockfile.
4. Add the missing migration for seven already-implemented offline-sales/audit tables.
5. Restrict the public upload mount to generated product WebP images. Invoices remain accessible only through existing authenticated download routes.
6. Supply Vercel build/routing configuration and a Render disk-backed blueprint.

Verification:
- Frozen frontend install, workspace typecheck and production build passed.
- Backend tests: 12 passed, 1 PostgreSQL-only concurrency test skipped without a PostgreSQL test URL.
- SQLite migration upgrade and model-drift check passed. PostgreSQL execution still needs validation on the dedicated project.
- The invoice privacy regression test passed.

Pending before production:
- User selection of Supabase organization (connected organization: adbulnaved18).
- User approval of paid Render Starter plus 1 GB persistent disk.
- Actual infrastructure provisioning and secure DATABASE_URL configuration.
- Gemini key configuration if OCR is required; no key is committed here.
- Final hostnames/CORS, owner-account bootstrap and live smoke tests.
- Existing robots/sitemap canonical host is aayerah-pharma.com; confirm domain ownership/target before switching canonical URLs or configuring custom DNS.

No live service, database, DNS or domain changes have been made by this preparation.
