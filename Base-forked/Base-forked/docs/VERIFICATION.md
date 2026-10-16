# Verification record

## Executed in the authoring environment

- API workflow suite: **11 passed, 1 skipped** using isolated SQLite fixtures.
- Python source compiled successfully.
- Alembic initial migration applied to a fresh local test database; `alembic check` reported no model/schema differences.
- PostgreSQL-dialect migration SQL generated successfully in `postgresql_schema.sql`.
- Frontend TypeScript typecheck and production Vite build passed.

The workflow tests cover:

1. Customer/owner roles, duplicate normalized email, private owner registration, logout revocation.
2. Expired session rejection, including timezone normalization.
3. Product fields, effective prices, search/category, protected writes, partial updates and archive.
4. Invalid-image rejection, actual PNG decode/re-encoding and serving uploaded WebP.
5. Cart quantities, stock limits, saved addresses and account isolation.
6. Rejection of client-supplied totals, server prices, retry idempotency and immutable order snapshots.
7. Failed checkout leaving stock, cart and order state unchanged.
8. Fulfilment transitions, cancellation restoring stock exactly once, paid-revenue totals.
9. Health aliases and CORS allowed/disallowed origins.
10. Preserved owner profile attributes, product associations and legacy address translation.
11. Server-controlled shipping fees and rejection of client-controlled cart discounts.

## Included but not executed here

`test_postgres_concurrent_checkout_no_oversell` uses simultaneous checkouts for the last unit of stock. It is skipped by the SQLite fixture because SQLite cannot verify PostgreSQL row locks. Set `TEST_DATABASE_URL` to run it. The GitHub Actions workflow runs this test against PostgreSQL 16, but that remote workflow has not been triggered by this task.

Native PostgreSQL and Docker were unavailable in this environment. Therefore successful SQLite tests and PostgreSQL SQL generation are **not** a claim of executed PostgreSQL integration testing. Container startup, PostgreSQL concurrency, hosted image persistence and production deployment must still be verified on the target environment.

The frontend was built and typechecked, not tested interactively in a browser. The static homepage and original decorative components remain supplied UI content.

## Dependency notices

The installed FastAPI/Starlette test client emits upstream deprecation notices for its httpx/AnyIO interfaces; tests pass despite them. Vite reports the supplied Browserslist data is old. The dependency snapshot is recorded in `backend/requirements.lock`; the supplied frontend package lock is retained.
