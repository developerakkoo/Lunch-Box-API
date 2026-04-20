# Partner app — API integration guide

Canonical reference for building the partner (kitchen) frontend against **Lunch-Box-API**. Paths match [`src/app.js`](src/app.js) mounts. For real-time behavior, see also [`OrderFlow.md`](OrderFlow.md) (Socket.IO section).

---

## 1. Base URL and environment

| Environment | Base URL |
|-------------|----------|
| Local default | `http://localhost:8000` (`PORT` from env, default `8000` in `src/index.js`) |
| Production | Your deployed API origin (e.g. `https://api.example.com`) |

All paths below are relative to this origin.

**Content type:** `application/json` for bodies.

---

## 2. Authentication (HTTP)

### 2.1 Login

`POST /api/partner/login`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `password` | string | Yes |

**Success — `200 OK`**

```json
{
  "message": "Login successful",
  "token": "<JWT>",
  "partner": { },
  "hotels": [ ]
}
```

- **`token`:** JWT signed with `ACCESS_SECRET`, payload `{ "id": "<mongoId>" }`, expiry **1 day** (see `generateToken` in `src/controller/partner.controller.js`). The `id` is the **logged-in partner document** id (owner account).
- **`partner` / `hotels`:** Raw Mongoose documents/arrays. **Do not persist or display `password` if present** (see appendix).
- **`hotels`:** All kitchens this account may manage (owner row + child hotels with `ownerPartner` set).

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ "message": "Invalid email" }` or `{ "message": "Invalid password" }` |
| `500` | `{ "message": "<error.message>" }` |

### 2.2 Authenticated requests

Header on every protected route:

```http
Authorization: Bearer <token>
```

**Errors — `src/middlewares/partnerAuth.middleware.js`**

| Status | Body |
|--------|------|
| `401` | `{ "message": "Unauthorized" }` (no token) |
| `401` | `{ "message": "Invalid token" }` (bad/expired JWT) |

---

## 3. Multi-hotel (“selected kitchen”) context

Many handlers call `resolveAccessibleHotel` (`src/utils/partnerAccess.js`), which picks **one** kitchen document for the request.

### 3.1 How `hotelId` is resolved

The server reads the target hotel id from **the first match**, in this order:

1. `req.query.hotelId`
2. `req.body.hotelId`
3. `req.params.hotelId` (if present on that route)
4. Header `x-hotel-id`

If **no** `hotelId` is sent, the server uses the **first** hotel in the managed list (sorted by `createdAt` ascending).

The JWT `id` must be a partner that belongs to that hotel group (owner or staff linked via `ownerPartner`).

### 3.2 Multi-hotel errors

| Status | `message` |
|--------|-----------|
| `404` | `Partner not found` (no managed hotels for this token) |
| `403` | `You do not have access to this hotel` (`hotelId` not in managed list) |

### 3.3 Which routes use `resolveAccessibleHotel` (hotel-scoped)

Used for **dashboard, orders, subscription orders, kitchen status, profile, catalog** — any controller that imports `resolveAccessibleHotel`:

- Partner: `GET /dashboard`, `GET /orders`, `GET /subscription-orders`, `PUT /kitchen/status`, `GET /profile`, `PATCH /profile`
- Partner: `POST /hotels` uses `req.partner.id` only (creates child hotel; does not use `resolveAccessibleHotel` for selection)
- Category: all `/api/category/*` partner routes
- Menu: all `/api/menu/*` partner routes
- Addon: all `/api/addon/*` partner routes

### 3.4 Routes that use `getManagedHotelIds` only (not `resolveAccessibleHotel`)

- `GET /api/partner/orders/:orderId/delivery-contact` — access if order’s `partner` is in `hotelIds`
- `GET /api/partner/notifications` — filter by all managed hotels or optional `hotelId`
- `PATCH /api/partner/notifications/:notificationId/read`
- `PATCH /api/partner/notifications/read-all`

For these, optional **`hotelId` query** still scopes notifications; invalid `hotelId` → `403` with `You do not have access to this hotel`.

---

## 4. Error response shapes (important)

Two patterns exist in the codebase.

### 4.1 Simple `{ message }` (most partner/catalog routes)

```json
{ "message": "Human-readable text" }
```

Typical statuses: `400`, `403`, `404`, `500`.

### 4.2 Structured kitchen action errors

`PATCH /api/order/kitchen-action/:orderId` uses `apiError` in `src/controller/order.controller.js`:

```json
{
  "statusCode": 400,
  "code": "INVALID_ACTION",
  "message": "action must be ACCEPT, PREPARING, READY or REJECT",
  "details": null
}
```

(`details` may be omitted or present depending on call site.)

---

## 5. Partner routes — `/api/partner`

### 5.1 Register

`POST /api/partner/register`  
**Auth:** None

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `kitchenName` | string | Yes (implicit for create) |
| `ownerName` | string | Yes |
| `email` | string | Yes |
| `password` | string | Yes |

**Success — `201 Created`**

```json
{
  "message": "Partner registered successfully",
  "data": { },
  "hotels": [ ]
}
```

**Errors**

| Status | `message` |
|--------|-----------|
| `400` | `Email already registered` |
| `500` | Server error message |

---

### 5.2 Login

See [§2.1](#21-login).

---

### 5.3 Create hotel (additional kitchen)

`POST /api/partner/hotels`  
**Auth:** Bearer

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `kitchenName` | string | Yes |
| `ownerName` | string | No (defaults from owner profile) |
| `phone` | string | No |
| `address` | string | No |
| `latitude` | number | No |
| `longitude` | number | No |

**Success — `201 Created`**

```json
{
  "message": "Hotel created successfully",
  "data": { },
  "hotels": [ ]
}
```

**Errors**

| Status | `message` |
|--------|-----------|
| `400` | `kitchenName is required` |
| `404` | `Partner not found` |
| `401` | Invalid/missing token |
| `500` | Server error message |

---

### 5.4 List managed hotels

`GET /api/partner/hotels`  
**Auth:** Bearer

**Success — `200 OK`**

```json
{
  "message": "Hotels fetched successfully",
  "owner": {
    "kitchenName": "",
    "ownerName": "",
    "email": "",
    "phone": ""
  },
  "data": [ ]
}
```

`data` — array of full `Partner` kitchen documents (owner + children).

---

### 5.5 Dashboard

`GET /api/partner/dashboard`  
**Auth:** Bearer  
**Hotel context:** optional `hotelId` (query or `x-hotel-id`) per [§3](#3-multi-hotel-selected-kitchen-context).

**Success — `200 OK`**

```json
{
  "hotel": { },
  "hotels": [ ],
  "totalCategories": 0,
  "totalMenuItems": 0,
  "totalAddonCategories": 0,
  "totalAddonItems": 0,
  "totalNewOrders": 0,
  "totalCompletedOrders": 0,
  "totalCancelledOrders": 0,
  "totalSales": 0,
  "salesChart": [
    { "_id": "2026-04-12", "totalSales": 0 }
  ],
  "averageRating": 0,
  "totalReviews": 0
}
```

- **`totalNewOrders`:** orders with `status: "PLACED"` for selected hotel.
- **`totalCompletedOrders`:** `status: "DELIVERED"`.
- **`totalCancelledOrders`:** `status: "CANCELLED"`.
- **`totalSales`:** sum of `priceDetails.totalAmount` for delivered orders.
- **`salesChart`:** last 7 days, delivered only, grouped by date string `YYYY-MM-DD`.

**Errors:** `403` / `404` / `500` with `{ "message" }`.

---

### 5.6 Orders by status tab

`GET /api/partner/orders`  
**Auth:** Bearer  
**Hotel context:** optional `hotelId`.

**Query:**

| Param | Required | Values |
|-------|----------|--------|
| `status` | No (default `NEW`) | `NEW`, `CANCELLED`, `COMPLETED` |

**Internal mapping** (`getOrdersByStatus`):

| Query `status` | Order `status` values included |
|----------------|--------------------------------|
| `NEW` | `PLACED`, `ACCEPTED`, `PREPARING`, `READY` |
| `CANCELLED` | `CANCELLED` |
| `COMPLETED` | `DELIVERED` |

**Success — `200 OK`**

```json
{
  "hotel": { },
  "hotels": [ ],
  "data": [ ]
}
```

Each order is populated with:

- `user` — `fullName`, `mobileNumber`
- `deliveryAgent` — `fullName`, `mobileNumber`
- `items.menuItem` — `name`, `price`, `image`

Sorted by `createdAt` descending.

**Order document** (schema summary): `user`, `partner`, `deliveryAgent`, `items[]`, `priceDetails`, `deliveryAddress`, `payment` (`method` COD/ONLINE/WALLET, `paymentStatus`), `status` (enum below), `timeline`, `cancellation`, `rating`, `tip`, timestamps.

**Full order `status` enum** (`src/module/order.model.js`):  
`PLACED` | `ACCEPTED` | `PREPARING` | `READY` | `OUT_FOR_DELIVERY` | `DELIVERED` | `CANCELLED`

---

### 5.7 Subscription deliveries by status tab

`GET /api/partner/subscription-orders`  
**Auth:** Bearer  
**Hotel context:** optional `hotelId`.

**Query:**

| Param | Required | Notes |
|-------|----------|--------|
| `status` | No (default `NEW`) | `NEW`, `CANCELLED`, `COMPLETED` |
| `page` | No (default `1`) | integer ≥ 1 |
| `limit` | No (default `20`) | integer ≥ 1 |

**Internal mapping:**

| Query `status` | `SubscriptionDelivery.status` |
|----------------|--------------------------------|
| `NEW` | `PENDING` |
| `CANCELLED` | `CANCELLED` |
| `COMPLETED` | `DELIVERED` |

**Subscription delivery `status` enum** (model): `PENDING`, `DELIVERED`, `SKIPPED`, `CANCELLED`  
(Partner listing filters only use the mapped subset above; `SKIPPED` is not returned by these tabs unless you add a dedicated filter.)

**Success — `200 OK`**

```json
{
  "message": "Subscription orders fetched successfully",
  "hotel": { },
  "hotels": [ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  },
  "data": [ ]
}
```

Each delivery populates `userSubscriptionId` with nested `userId`, `menuItemId`, `partnerId` (selected fields).

---

### 5.8 Update kitchen active flag

`PUT /api/partner/kitchen/status`  
**Auth:** Bearer  
**Hotel context:** optional `hotelId` (updates **that** kitchen row).

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `status` | string | Yes — `ACTIVE` or `INACTIVE` |

Server sets `partner.status` and `partner.isActive` (`true` when `ACTIVE`).

**Success — `200 OK`**

```json
{
  "message": "Kitchen status updated successfully",
  "status": "ACTIVE"
}
```

**Errors**

| Status | `message` |
|--------|-----------|
| `400` | `Invalid status. Use ACTIVE or INACTIVE` |
| `404` | `Partner not found` |
| `403` / `404` | Hotel access errors |

---

### 5.9 Profile

**GET** `/api/partner/profile`  
**Auth:** Bearer  
**Hotel context:** optional `hotelId`.

**Success — `200 OK`**

```json
{
  "message": "Profile fetched successfully",
  "owner": { },
  "selectedHotel": { },
  "hotels": [ ]
}
```

- **`owner`:** owner account fields (`kitchenName`, `ownerName`, `email`, `phone`, `address`, `latitude`, `longitude`, `isActive`, `status`).
- **`selectedHotel`:** fields `ownerPartner`, `kitchenName`, `ownerName`, `email`, `phone`, `address`, `latitude`, `longitude`, `isActive`, `status`, `createdAt`, `updatedAt`.

**PATCH** `/api/partner/profile`  
**Auth:** Bearer  
**Hotel context:** optional `hotelId` (updates selected kitchen).

**Body** (all optional; only sent fields are applied):

| Field | Type |
|-------|------|
| `kitchenName` | string |
| `ownerName` | string |
| `phone` | string |
| `address` | string |
| `latitude` | number |
| `longitude` | number |

**Success — `200 OK`**

```json
{
  "message": "Profile updated successfully",
  "data": { },
  "hotels": [ ]
}
```

**Errors:** `404` `Partner not found`; access errors as in §3.

---

### 5.10 Delivery contact for an order

`GET /api/partner/orders/:orderId/delivery-contact`  
**Auth:** Bearer

No `resolveAccessibleHotel` — uses all `hotelIds` for the token’s owner group.

**Success — `200 OK`**

```json
{
  "message": "Delivery contact fetched successfully",
  "data": {
    "orderId": "",
    "deliveryAgentId": "",
    "fullName": "",
    "mobileNumber": "",
    "dialUrl": "tel:+..."
  }
}
```

**Errors**

| Status | `message` |
|--------|-----------|
| `404` | `Order not found` |
| `404` | `Delivery agent not assigned yet` |
| `401` | Unauthorized |
| `500` | Server error |

---

### 5.11 Notifications

**GET** `/api/partner/notifications`  
**Auth:** Bearer

**Query:**

| Param | Required |
|-------|----------|
| `hotelId` | No — if set, must be in managed list |
| `page` | No (default `1`) |
| `limit` | No (default `20`) |

**Success — `200 OK`**

```json
{
  "message": "Notifications fetched successfully",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  },
  "unreadCount": 0,
  "data": [ ]
}
```

**Notification `type` enum** (`src/module/partnerNotification.model.js`):  
`NEW_ORDER` | `ORDER_CANCELLED` | `ORDER_UPDATED` | `SUBSCRIPTION_ORDER` | `SYSTEM`

Fields include: `partnerId`, `type`, `title`, `message`, `data` (mixed), `isRead`, `createdAt`, `updatedAt`.

**Errors:** `403` if invalid `hotelId`; `500` on failure.

**PATCH** `/api/partner/notifications/:notificationId/read`  
**Auth:** Bearer

**Success — `200 OK`**

```json
{
  "message": "Notification marked as read",
  "data": { }
}
```

**Errors:** `404` `Notification not found`; `401`; `500`.

**PATCH** `/api/partner/notifications/read-all`  
**Auth:** Bearer

**Query:** optional `hotelId` (must be allowed).

**Success — `200 OK`**

```json
{
  "message": "All notifications marked as read"
}
```

---

## 6. Kitchen order actions — `/api/order`

### 6.1 Kitchen action

`PATCH /api/order/kitchen-action/:orderId`  
**Auth:** Bearer (partner JWT)

**Body:**

```json
{
  "action": "ACCEPT"
}
```

| `action` | Meaning |
|----------|---------|
| `ACCEPT` | `PLACED` → `ACCEPTED` |
| `PREPARING` | `ACCEPTED` or `PREPARING` → `PREPARING` |
| `READY` | `PREPARING` or `READY` → `READY` (may trigger delivery assignment) |
| `REJECT` | Allowed from `PLACED`, `ACCEPTED`, `PREPARING`, `READY` → `CANCELLED` |

**Online payment:** If `payment.method === "ONLINE"` and `payment.paymentStatus !== "PAID"`, only `REJECT` is allowed until payment is confirmed.

**Success — `200 OK`**

```json
{
  "message": "Action updated",
  "order": { }
}
```

Socket events may be emitted to users/kitchen/driver (see `OrderFlow.md`).

### 6.2 Kitchen action — error codes (`apiError`)

| HTTP | `code` | When |
|------|--------|------|
| `400` | `INVALID_ORDER_ID` | `orderId` not a valid Mongo id |
| `400` | `INVALID_ACTION` | `action` not one of `ACCEPT`, `PREPARING`, `READY`, `REJECT` |
| `404` | `ORDER_NOT_FOUND` | No order with that id |
| `403` | `ROLE_NOT_ALLOWED` | Token not a partner or order’s `partner` not in managed `hotelIds` |
| `409` | `ORDER_ALREADY_CLOSED` | Status `CANCELLED` or `DELIVERED` |
| `409` | `PAYMENT_PENDING` | Online order not paid yet |
| `409` | `INVALID_ORDER_STATE` | Transition not allowed for current status (per action) |
| `500` | `KITCHEN_ACTION_FAILED` | Uncaught error; `message` contains detail |

---

## 7. Category — `/api/category`

Mounted at **`/api/category`** (`app.js`). All routes require partner Bearer token.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/create` | Create category |
| `GET` | `/list` | List categories for selected hotel |
| `PUT` | `/update/:id` | Update category |
| `DELETE` | `/delete/:id` | Delete category |

**Hotel context:** optional `hotelId` / `x-hotel-id` on all (via `resolveAccessibleHotel`).

### POST `/api/category/create`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `description` | string | No |
| `image` | string | No |

**Success — `201`:** `{ "message": "Category created successfully", "data": { } }`

### GET `/api/category/list`

**Success — `200`:** `{ "total": 0, "data": [ ] }`

### PUT `/api/category/update/:id`

**Body:** any of `name`, `description`, `image` (passed through `req.body`).

**Success — `200`:** `{ "message": "Category updated successfully", "data": { } }`  
**404:** `{ "message": "Category not found" }`

### DELETE `/api/category/delete/:id`

**Success — `200`:** `{ "message": "Category deleted successfully" }`  
**404:** `{ "message": "Category not found" }`

---

## 8. Menu — `/api/menu`

Swagger comments may say `/api/menuItem`; the **real** base path is **`/api/menu`**. Partner Bearer required.

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/create` | Single item |
| `POST` | `/bulk` | Many items |
| `GET` | `/list` | Optional `?hotelId=` |
| `PUT` | `/update/:id` | Optional `?hotelId=` |
| `DELETE` | `/delete/:id` | Optional `?hotelId=` |
| `PATCH` | `/status/:id` | Toggle `isAvailable`; optional `?hotelId=` |

### POST `/api/menu/create`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `price` | number | Yes |
| `category` | string (ObjectId) | Yes — must belong to selected hotel |
| `description` | string | No |
| `discountPrice` | number | No (≤ `price`) |
| `images` | string[] | No |
| `isVeg` | boolean | No (default true) |
| `hotelId` | string | No — selects hotel context |

**Success — `201`:** `{ "message": "Menu item created successfully", "data": { } }`  
**404:** `{ "message": "Category not found" }` if category not for this partner.

### POST `/api/menu/bulk`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `items` | array | Yes — non-empty |
| `hotelId` | string | No |

Each element: `name`, `price`, `category` (required per item), optional `description`, `discountPrice`, `images`, `isVeg`.

**Success — `201`:** `{ "message": "Bulk menu items created successfully", "count": 0, "data": [ ] }`  
**400:** `{ "message": "Items array is required" }` or invalid categories message.

### GET `/api/menu/list`

**Query:** `hotelId` optional.

**Success — `200`:** `{ "total": 0, "data": [ ] }` (items populated with `category.name`). There are no `search` or `isVeg` query parameters; the partner app filters and searches in memory unless the backend is extended later.

### PUT `/api/menu/update/:id`

**Body:** fields to merge (same shape as create; typical: `name`, `description`, `price`, `discountPrice`, `images`, `isVeg`, `category`).

**Success — `200`:** `{ "message": "Menu item updated successfully", "data": { } }`  
**404:** `{ "message": "Menu item not found" }`

### DELETE `/api/menu/delete/:id`

**Success — `200`:** `{ "message": "Menu item deleted successfully" }`  
**404:** `{ "message": "Menu item not found" }`

### PATCH `/api/menu/status/:id`

Toggles `isAvailable` boolean.

**Success — `200`:**

```json
{
  "message": "Menu item status updated successfully",
  "data": {
    "_id": "",
    "isAvailable": true
  }
}
```

---

## 9. Addons — `/api/addon`

Partner Bearer required. Optional `hotelId` query on list/delete where noted.

| Method | Path |
|--------|------|
| `POST` | `/category/create` |
| `POST` | `/item/create` |
| `GET` | `/category/list` |
| `GET` | `/item/list` |
| `DELETE` | `/item/delete/:id` |

### POST `/api/addon/category/create`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `menuItem` | string (ObjectId) | Yes — must be menu item of selected hotel |
| `isRequired` | boolean | No |
| `maxSelection` | number | No |
| `hotelId` | string | No |

**Success — `201`:** `{ "message": "Addon category created", "data": { } }`  
**404:** `{ "message": "Menu item not found" }`

### POST `/api/addon/item/create`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `price` | number | Yes |
| `addonCategory` | string (ObjectId) | Yes — must belong to selected hotel |
| `hotelId` | string | No |

**Success — `201`:** `{ "message": "Addon item created", "data": { } }`  
**404:** `{ "message": "Addon category not found" }`

### GET `/api/addon/category/list`

**Success — `200`:** `{ "data": [ ] }` (populated `menuItem.name`)

### GET `/api/addon/item/list`

**Success — `200`:** `{ "data": [ ] }` (populated `addonCategory.name`)

### DELETE `/api/addon/item/delete/:id`

**Query:** optional `hotelId`

**Success — `200`:** `{ "message": "Addon deleted" }`  
(Implementation does not return 404 if id missing; it still responds success.)

---

## 10. Global HTTP behaviors

- **Unknown route:** `404` `{ "message": "Route not found" }` (`app.js`).
- **Unhandled errors:** Express error handler may return `{ "message": "<err.message>" }` with status from `err.status` or `500`.

---

## 11. Socket.IO (partner realtime)

- **Library:** server uses `socket.io` v4; client should use **`socket.io-client` v4.x**.
- **URL:** same host as API; Socket attaches to the HTTP server in `src/index.js` (same port as REST unless you put a reverse proxy in front — use the **same public origin** the app uses for HTTP).

### Connection auth

Pass JWT from partner login and role:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:8000", {
  auth: {
    token: "<same Bearer JWT>",
    role: "PARTNER"
  }
});
```

Server verifies `token` with `ACCESS_SECRET` for `role: "PARTNER"` (`src/socket/order.socket.js`).

### Join kitchen room

After connect, emit:

- Event: `join_kitchen`
- Payload: `"<kitchenMongoId>"` (must be a hotel id the partner manages)
- Optional ack callback: `(res) => { }` — `{ "status": "ok" }` or `{ "status": "error", "message": "..." }`

### Partner-relevant server events (listen)

Full payloads and edge cases: **[`OrderFlow.md`](OrderFlow.md) — “Socket.IO Events”**. Commonly used on partner apps:

- `new_order` — to room `kitchen_<partnerId>`
- `partner_notification` — to `kitchen_<partnerId>`
- `delivery_assigned` — user + kitchen
- `delivery-location` — order, user, kitchen rooms (when driver streams location)
- `order_status_update` — primarily user-facing; partner may listen on `join_order` if needed

**Delivery agent-only** events (e.g. `delivery-location-update` emit) use `JWT_SECRET` and `role: "DELIVERY_AGENT"` — not for partner app.

---

## Appendix A — Partner “NEW” orders vs kitchen actions

- List **NEW** tab includes `READY` orders still in progress until delivered or cancelled.
- Moving to **`OUT_FOR_DELIVERY`** is **not** a kitchen endpoint here; it is driver flow (`PATCH /api/order/delivery-action/:orderId` with driver auth).

---

## Appendix B — Security note for JSON responses

Register/login and some list endpoints may serialize full Mongoose `Partner` documents. **Do not store or log `password`.** Prefer treating auth responses as opaque except `token`, `message`, and non-sensitive display fields. Long-term, the API should strip `password` in `toJSON`; frontend should still be defensive.

---

## Quick reference — partner-facing HTTP paths

| Method | Path |
|--------|------|
| POST | `/api/partner/register` |
| POST | `/api/partner/login` |
| POST | `/api/partner/hotels` |
| GET | `/api/partner/hotels` |
| GET | `/api/partner/dashboard` |
| GET | `/api/partner/orders` |
| GET | `/api/partner/subscription-orders` |
| PUT | `/api/partner/kitchen/status` |
| GET | `/api/partner/profile` |
| PATCH | `/api/partner/profile` |
| GET | `/api/partner/orders/:orderId/delivery-contact` |
| GET | `/api/partner/notifications` |
| PATCH | `/api/partner/notifications/:notificationId/read` |
| PATCH | `/api/partner/notifications/read-all` |
| PATCH | `/api/order/kitchen-action/:orderId` |
| POST | `/api/category/create` |
| GET | `/api/category/list` |
| PUT | `/api/category/update/:id` |
| DELETE | `/api/category/delete/:id` |
| POST | `/api/menu/create` |
| POST | `/api/menu/bulk` |
| GET | `/api/menu/list` |
| PUT | `/api/menu/update/:id` |
| DELETE | `/api/menu/delete/:id` |
| PATCH | `/api/menu/status/:id` |
| POST | `/api/addon/category/create` |
| POST | `/api/addon/item/create` |
| GET | `/api/addon/category/list` |
| GET | `/api/addon/item/list` |
| DELETE | `/api/addon/item/delete/:id` |
