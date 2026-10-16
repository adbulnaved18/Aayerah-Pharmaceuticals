# Source analysis and feature mapping

## Source inspected

The working tree in the uploaded ZIP includes a Vite/React/TypeScript frontend. The bundled archived `origin/dev` branch includes the Express/Mongoose backend. The current extracted frontend is the UI reference; archived backend models/controllers/routes are the API and data reference. Older `cart` and `jwt` branches were also inspected to confirm the evolution of cart/auth contracts.

No database dump, uploaded product images, runtime `.env`, payment credentials or working online-payment integration were included. The eight sample products in `frontend/src/data/products.ts` are static examples, not exported database records. They remain available as source examples; the live catalog starts empty.

## Attributes

| Original entity / field | New PostgreSQL representation / behavior |
| --- | --- |
| User `_id` | `users.id`, UUID string; serializers return both `id` and `_id` |
| User `fullname`, `email` | Validated name and normalized lowercase unique email |
| User `password` | `password_hash`, Argon2; never returned by API |
| User `picture` | `users.picture`, editable HTTP(S) picture URL via profile API |
| User `cart` array | `cart_items`, user/product composite key, quantity 1–999 |
| User `orders` array | `orders` and `order_items`, linked by user ID |
| Address `street` | Canonical `address` field in saved address JSON |
| Address `city`, `state`, `country` | Preserved; country defaults to India for old frontend requests |
| Address `postalCode` | Canonical `zipCode` |
| Address numeric `contact` | Canonical string `phone`, preserving leading zeros when submitted as a string |
| Frontend shipping `fullName`, `email` | Validated and stored with address/order snapshot |
| Owner email/password | `users` with role `owner`; shared unique email namespace |
| Owner `fullname` used by controllers but absent from schema | Explicitly supported in `users.fullname` |
| Owner `picture`, `gstin`, `discounts` | Preserved; validated profile API, owner-only GSTIN/discount fields |
| Owner `products` array | Normalized `products.owner_id`; profile returns associated product IDs |
| Product `_id` | UUID string, `id`/`_id` aliases |
| Product `name`, `description` | Bounded text |
| Product `price` | Exact `NUMERIC(12,2)`; nonnegative |
| Product `stock` | Nonnegative integer; checkout validates under row lock |
| Product `discount` | Percentage 0–100; exact decimal; rounded effective price per unit |
| Product `bgColor`, `panelColor`, `textColor` | Six-digit hex colors, preserved on partial updates |
| Product `image.url`, `image.public_id` | Public image URL and generated file ID; sanitized WebP images on persistent storage |
| Frontend product `category` | Explicit indexed field, absent in old backend schema |
| Browser-local order ID/date/items/total/status/address | Persistent orders with UUID, timestamp, item snapshots and shipping snapshot |

Owner `discounts` was a string metadata field with no promotion logic. It remains metadata; only product `discount` affects pricing. All owners are administrators of one shared store, matching the supplied app; this is not a multi-vendor tenant-isolated marketplace.

## Features and changes

| Feature | Old behavior | Rewrite |
| --- | --- | --- |
| Signup/login/logout | bcrypt + JWT cookies; inconsistent login token response | Argon2 + database-backed opaque bearer sessions; all login responses include a token; logout revokes it |
| Admin signup | Public registration route | First owner via CLI; additional owners require existing owner authentication |
| Product list/details | Public MongoDB queries | Public SQL queries; pagination, search and category filtering |
| Product create/edit/delete | Multipart Cloudinary uploads; write routes had auth commented out | Owner-protected multipart/JSON writes; validation; persistent-disk uploads; archive on delete |
| Category | Frontend sent it but backend did not store it | Stored and searchable |
| Cart | Backend array without real quantities; frontend used localStorage | Per-account database cart, quantity updates, remove/clear, server totals |
| Cart discount query | Client-controlled amount in query string | Ignored; discounts come only from saved product settings |
| Shipping | Backend charged 20; frontend displayed free | Configurable server shipping fee, default 20, displayed consistently |
| Address | Backend legacy fields; frontend only localStorage | Database save/load; accepts both legacy and frontend request shapes |
| Checkout | Fake payment delay, localStorage order | Transactional COD order with retry key, server pricing and stock deduction |
| Inventory | No checkout stock transaction | PostgreSQL user/product locks with deterministic product lock ordering |
| Order history | Browser-local records | Customer-owned order APIs, owner order list |
| Dashboard | Revenue/orders/customers read from browser storage | Database statistics and orders; collected revenue excludes unpaid/cancelled orders |
| Fulfilment | No server workflow | Pending → confirmed → shipped → delivered; cancellation before shipment restores stock |
| Product deletion | Deletes image and product | Archives product; retains images used in historic orders |
| Image storage | Cloudinary | Persistent filesystem, re-encoded WebP; no Cloudinary credentials required |
| Health checks | Root text response | Root compatibility plus `/health`, `/api/health`, `/api/ready` |
| Deployment | Node serverless configuration | Python ASGI, PostgreSQL migration, container/Compose and CI |

## Original UI elements that are not backend features

The home page is marketing content, with placeholder footer links. Product-detail rating/star text, available-looking size buttons and delivery copy were decorative; no reviews, variants, newsletter subscriptions, returns workflow or customer support API existed. These are not presented as implemented services. The old success page promised an email that no code sent; the rewrite removes that promise.

## Compatibility boundaries

Routes from the old frontend remain available, including POST-based product updates/deletes. Every application router is additionally reachable under `/api`. `id` and `_id` are both returned. Product write responses include the original `product` envelope as well as flat fields. Cart responses include `items`/`total` plus `cart`, `cartCount` and `pricing` aliases.

Authentication changes to `Authorization: Bearer TOKEN`. Old JWT cookies are not accepted. Both the supplied frontend API helper and its direct multipart upload call were updated. Existing browser-local carts and orders are not automatically imported because their prices, statuses and ownership are untrusted.

The legacy address POST accepts `street/city/state/postalCode/country/contact`, derives name/email from the authenticated account and returns a compatibility envelope. Canonical GET and modern POST/PUT use `fullName/email/phone/address/city/state/zipCode/country`.

The rewrite preserves application features while intentionally changing insecure behavior: anonymous product writes, public owner signup, client-selected discounts and client-declared successful payment are not retained.
