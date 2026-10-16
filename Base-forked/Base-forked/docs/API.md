# API guide

Base URL is the backend origin. Interactive docs are at `/docs`, machine schema at `/openapi.json`. Application routes have an equivalent `/api` prefix. Protected routes require `Authorization: Bearer <token>`; cookie credentials are not used.

## Routes

| Method | Path | Access / purpose |
| --- | --- | --- |
| POST | `/user/register` | Public signup: fullname, email, password (8–128 chars) |
| POST | `/user/login` | Public customer login: email, password |
| POST | `/owner/login` | Public owner login |
| POST | `/owner/register` | Existing owner creates another owner |
| POST | `/user/logout`, `/owner/logout` | Revoke the current session |
| GET | `/user/me` | Current account, ID and role |
| GET/PATCH | `/user/profile` | Current account fullname/picture |
| GET/PATCH | `/owner/profile` | Owner profile, GSTIN, discount metadata, product IDs |
| GET | `/product/shop` | Product array; `search`, `category`, `offset=0`, `limit=200` (max 500) |
| GET | `/product/categories` | Active category strings |
| GET | `/product/product/{id}` | Active product details |
| POST | `/product/createproduct` | Owner; product JSON or multipart form |
| POST/PUT | `/product/updateproduct/{id}` | Owner; partial fields, optional replacement image |
| POST/DELETE | `/product/deleteproduct/{id}` | Owner; archive product |
| GET | `/user/cart` | Current cart, availability, subtotal, shipping and total |
| POST | `/user/addtocart/{id}` | Add quantity (`{"quantity":1}`; optional body) |
| PUT | `/user/cart/{id}` | Set positive quantity |
| DELETE | `/user/cart/{id}` | Remove a line |
| DELETE | `/user/cart` | Clear cart |
| GET | `/user/address` | Saved address or null |
| POST/PUT | `/user/address` | Save canonical or legacy address |
| POST | `/user/orders` | Checkout; requires `Idempotency-Key` header (8–100 chars) |
| GET | `/user/orders` | Own orders; offset/limit |
| GET | `/user/orders/{id}` | Own order details; another user's order returns 404 |
| GET | `/owner/orders` | All store orders; offset/limit |
| GET | `/owner/stats` | Paid revenue, order count, active product count, customer count |
| PATCH | `/owner/orders/{id}/status` | Owner; `{"status":"confirmed"}` etc. |
| GET | `/health`, `/api/health` | Liveness |
| GET | `/api/ready` | Database/schema readiness |

## Product fields

Required on creation: `name`, `description`, `price`, `stock`, `category`.
Optional: `discount` (0), `bgColor` (#ffffff), `panelColor` (#ffffff), `textColor` (#000000).
Multipart `image`: JPEG, PNG or WebP, maximum 5 MiB and 20 megapixels. Files are decoded, resized to fit 1600×1600, re-encoded as WebP and renamed with random IDs. Metadata and original filenames are not retained. JSON creates may omit an image; the supplied admin form requires one. A JSON image URL is not accepted for product writes.

Fields are validated on updates too. Unknown fields are rejected. Monetary values use Decimal/NUMERIC internally; JSON exposes numeric prices for the existing frontend. Product `price` is list price and `effectivePrice` is the rounded discounted price. Cart/order line `price` is the actual discounted unit price.

The create/update product bodies are described here because those endpoints accept either JSON or multipart dynamically. Their dynamic bodies are not fully modeled as interactive Swagger form inputs.

## Checkout request

```json
{
  "shippingAddress": {
    "fullName": "Example Customer",
    "email": "customer@example.com",
    "phone": "1234567890",
    "address": "123 Example Road",
    "city": "Kolkata",
    "state": "West Bengal",
    "zipCode": "700001",
    "country": "India"
  },
  "paymentMethod": "cod"
}
```

The API loads the authenticated user's cart. It does not accept client-supplied items, totals, paid status or card details. Reuse the same `Idempotency-Key` and body after a network failure. A repeated successful request returns the existing order even though its cart has been cleared. Reusing that key with a different address/body returns 409. Start a new key for a genuinely new purchase.

Order items preserve product name, image, quantity and charged price; shipping and currency are also snapshotted. Later product edits cannot change historical order totals.

## Errors

Errors use `{"error":"message"}`. Framework validation errors add sanitized `details` entries. Common statuses: 401 unauthenticated/expired, 403 owner required, 404 unavailable resource, 409 stock/duplicate/transition conflict, 413 image too large, 422 invalid input. Password values are excluded from validation responses.

## Intentional limits

One saved address per account; the order retains its own copy. No tax calculation, coupon engine, multi-currency conversion, online payment provider, email delivery, password recovery or customer cancellation UI is included. None was implemented in the source. Owner profile metadata is available through the API, without a new profile-editing screen.
