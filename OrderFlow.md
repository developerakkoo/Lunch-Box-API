# Order Flow



## Roles

- User
- Partner
- Delivery Agent

## Auth

User APIs:

```text
Authorization: Bearer <user_access_token>
```

Partner APIs:

```text
Authorization: Bearer <partner_token>
```

Driver APIs:

```text
Authorization: Bearer <driver_token>
```

Socket auth uses `handshake.auth`:

```json
{
  "token": "<token>",
  "role": "USER"
}
```

Allowed socket roles:

- `USER`
- `PARTNER`
- `DELIVERY_AGENT`

## Order Status Lifecycle

Database order statuses:

```text
PLACED -> ACCEPTED -> PREPARING -> READY -> OUT_FOR_DELIVERY -> DELIVERED
```

Cancellation path:

```text
PLACED / ACCEPTED / PREPARING / READY -> CANCELLED
```

Customer-facing socket status mapping:

- `PLACED` -> `ORDER_RECEIVED`
- `ACCEPTED` -> `ACCEPTED`
- `PREPARING` -> `PROCESSING`
- `READY` -> `READY_FOR_PICKUP`
- `OUT_FOR_DELIVERY` -> `ON_ROUTE`
- `DELIVERED` -> `DELIVERED`
- `CANCELLED` -> `CANCELLED`

## Payment Rules

Supported order payment methods:

- `COD`
- `ONLINE`
- `WALLET`

Behavior:

- `COD`: order can move through full lifecycle without prepayment. Payment becomes `PAID` when delivered.
- `WALLET`: wallet amount is deducted at order creation. Payment is immediately `PAID`.
- `ONLINE`: order is created with payment `PENDING`. Kitchen cannot process the order until payment is confirmed through the confirm-payment API.

## Prerequisites Before Creating Order

Frontend should ensure:

1. User is logged in.
2. User has at least one saved address.
3. User has items in cart.
4. For wallet orders, wallet balance should be enough.

## Main REST APIs

### 1. User Login / Register

Route:

```text
POST /api/user/login
```

Purpose:

- Log in an existing user
- Register a new user if mobile number is not found

Example request:

```json
{
  "mobileNumber": "9876543210",
  "fullName": "Test User",
  "email": "testuser@example.com"
}
```

### 2. Add User Address

Route:

```text
POST /api/user/add-address
```

Auth:

- User

Example request:

```json
{
  "label": "Home",
  "fullAddress": "MG Road, Pune",
  "city": "Pune",
  "state": "Maharashtra",
  "pincode": "411001",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "isDefault": true
}
```

### 3. Get User Addresses

Route:

```text
GET /api/user/addresses
```

Auth:

- User

Purpose:

- Get address list
- Use one address `_id` as `addressId` during order creation

### 4. Add Item to Cart

Route:

```text
POST /api/cart/add
```

Auth:

- User

Example request:

```json
{
  "menuItemId": "<menu_item_id>",
  "quantity": 1
}
```

### 5. Create Order

Route:

```text
POST /api/order/create
```

Auth:

- User

Request:

```json
{
  "addressId": "<address_id>",
  "paymentMethod": "COD"
}
```

Request fields:

- `addressId`: required
- `paymentMethod`: `COD`, `ONLINE`, or `WALLET`

Response behavior:

- Creates order with status `PLACED`
- Clears cart after successful creation
- Emits realtime events to user and kitchen
- For `ONLINE`, returns `razorpayOrder`

Important notes:

- `WALLET`: payment status becomes `PAID` immediately
- `ONLINE`: payment status stays `PENDING` until confirm-payment API succeeds

### 6. Confirm Online Payment

Route:

```text
POST /api/order/confirm-payment
```

Auth:

- User

Request:

```json
{
  "orderId": "<order_id>",
  "razorpay_payment_id": "<razorpay_payment_id>",
  "razorpay_order_id": "<razorpay_order_id>",
  "razorpay_signature": "<razorpay_signature>"
}
```

Purpose:

- Confirms Razorpay payment for `ONLINE` order
- Marks order payment as `PAID`
- Kitchen can process online order only after this succeeds

### 7. Partner Order List

Route:

```text
GET /api/partner/orders?status=NEW
```

Auth:

- Partner

Supported query values:

- `NEW`
- `CANCELLED`
- `COMPLETED`

Mappings:

- `NEW` -> `PLACED`, `ACCEPTED`, `PREPARING`, `READY`
- `CANCELLED` -> `CANCELLED`
- `COMPLETED` -> `DELIVERED`

### 8. Partner Kitchen Action

Route:

```text
PATCH /api/order/kitchen-action/:orderId
```

Auth:

- Partner

Supported actions:

- `ACCEPT`
- `PREPARING`
- `READY`
- `REJECT`

Example requests:

```json
{
  "action": "ACCEPT"
}
```

```json
{
  "action": "PREPARING"
}
```

```json
{
  "action": "READY"
}
```

```json
{
  "action": "REJECT"
}
```

Action rules:

- `ACCEPT` is valid only when order is `PLACED`
- `PREPARING` is valid only when order is `ACCEPTED` or already `PREPARING`
- `READY` is valid only when order is `PREPARING` or already `READY`
- `REJECT` is valid before delivery starts
- For `ONLINE` orders, kitchen cannot do `ACCEPT`, `PREPARING`, or `READY` until payment is `PAID`

### 9. Driver Online / Availability

Routes:

```text
PUT /api/delivery/toggle-online
PATCH /api/delivery/availability
```

Auth:

- Delivery Agent

Availability request:

```json
{
  "status": "ACTIVE"
}
```

Purpose:

- Driver must be online and available to receive or accept orders

### 10. Driver Pending Orders

Route:

```text
GET /api/delivery/orders?status=PENDING
```

Auth:

- Delivery Agent

Supported query values:

- `PENDING`
- `RUNNING`
- `COMPLETED`

Mappings:

- `PENDING` -> `READY`
- `RUNNING` -> `OUT_FOR_DELIVERY`
- `COMPLETED` -> `DELIVERED`

### 11. Driver Accept Order

Route:

```text
PUT /api/delivery/accept-order/:orderId
```

Auth:

- Delivery Agent

Rules:

- Driver must be online
- Driver must be available
- Order must be `READY`
- If another driver is already assigned, API rejects the action

Effect:

- Driver becomes assigned to the order
- Driver `currentOrder` is set
- Driver `isAvailable` becomes `false`
- Order status remains `READY`

### 12. Driver Pick Order

Route:

```text
PUT /api/delivery/pick-order/:orderId
```

Auth:

- Delivery Agent

Rules:

- Driver must be the assigned driver
- Order must be `READY`

Effect:

- Order moves to `OUT_FOR_DELIVERY`
- `timeline.pickedAt` is set

### 13. Driver Complete Order

Route:

```text
PUT /api/delivery/complete-order/:orderId
```

Auth:

- Delivery Agent

Rules:

- Driver must be the assigned driver
- Order must be `OUT_FOR_DELIVERY`

Effect:

- Order becomes `DELIVERED`
- `timeline.deliveredAt` is set
- For `COD`, payment becomes `PAID`
- Driver is released from current order

### 14. User Order History

Route:

```text
GET /api/order/my-orders
```

Auth:

- User

Optional query:

- `status`
- `page`
- `limit`

### 15. User Order Details

Route:

```text
GET /api/order/my-orders/:orderId
```

Auth:

- User

Purpose:

- Fetch full order details for order tracking screen

### 16. User Cancel Order

Route:

```text
PATCH /api/order/cancel/:orderId
```

Auth:

- User

Example request:

```json
{
  "reason": "Change of plans"
}
```

Allowed cancellation statuses:

- `PLACED`
- `ACCEPTED`
- `PREPARING`
- `READY`

Effects:

- Order becomes `CANCELLED`
- For wallet-paid orders, refund is issued
- Assigned driver, if any, is released
- Kitchen receives cancel notification

### 17. Rate Order

Route:

```text
POST /api/order/:orderId/rate
```

Auth:

- User

Request:

```json
{
  "partnerRating": 5,
  "deliveryRating": 4,
  "review": "Good food"
}
```

Rules:

- Allowed only when order is `DELIVERED`

### 18. Tip Order

Route:

```text
POST /api/order/:orderId/tip
```

Auth:

- User

Request:

```json
{
  "amount": 20,
  "paymentMethod": "WALLET"
}
```

Allowed statuses:

- `OUT_FOR_DELIVERY`
- `DELIVERED`

### 19. Confirm Tip Payment

Route:

```text
POST /api/order/:orderId/tip/confirm
```

Auth:

- User

Used for:

- `RAZORPAY`
- `STRIPE`

## Recommended End-to-End Frontend Flow

### COD Flow

1. User logs in.
2. User selects or creates address.
3. User adds items to cart.
4. User creates order with `paymentMethod = COD`.
5. Kitchen receives new order event.
6. Kitchen accepts order.
7. Kitchen moves order to preparing.
8. Kitchen marks order ready.
9. Driver accepts assignment.
10. Driver picks order.
11. Driver completes order.
12. User sees delivered state.

### Wallet Flow

1. User logs in.
2. User ensures wallet balance is sufficient.
3. User creates order with `paymentMethod = WALLET`.
4. Wallet is deducted immediately.
5. Remaining flow is same as COD.

### Online Flow

1. User creates order with `paymentMethod = ONLINE`.
2. Backend returns `razorpayOrder`.
3. Frontend completes Razorpay payment.
4. Frontend calls `/api/order/confirm-payment`.
5. After payment confirmation, kitchen can begin processing.
6. Remaining flow is same as COD.

## Socket.IO Events

Socket server is enabled for order updates and delivery tracking.

### Connection Auth

Frontend must connect with:

```json
{
  "token": "<jwt_token>",
  "role": "USER"
}
```

Examples:

- user app: `role = USER`
- partner app: `role = PARTNER`
- driver app: `role = DELIVERY_AGENT`

### Room Join Events

#### `join_user`

Payload:

```json
"<user_id>"
```

Allowed for:

- authenticated user owning that ID

#### `join_kitchen`

Payload:

```json
"<partner_id>"
```

Allowed for:

- authenticated partner owning that ID

#### `join_delivery`

Payload:

```json
"<driver_id>"
```

Allowed for:

- authenticated delivery agent owning that ID

#### `join_order`

Payload:

```json
"<order_id>"
```

Allowed for:

- user who owns the order
- partner who owns the order
- assigned driver

### Socket Events Emitted by Backend

#### `new_order`

Sent to:

- `kitchen_<partnerId>`

When:

- order is created

#### `partner_notification`

Sent to:

- `kitchen_<partnerId>`

When:

- partner notification is created

#### `order_status_update`

Sent to:

- `user_<userId>`

Payload:

```json
{
  "orderId": "<order_id>",
  "status": "PROCESSING",
  "internalStatus": "PREPARING",
  "timeline": {}
}
```

Purpose:

- main status event for user tracking screen

#### `order_accepted`

Sent to:

- `user_<userId>`

When:

- kitchen accepts order

#### `order_preparing`

Sent to:

- `user_<userId>`

When:

- kitchen marks order as preparing

#### `order_ready`

Sent to:

- `user_<userId>`

When:

- kitchen marks order ready

#### `delivery_assigned`

Sent to:

- `user_<userId>`
- `kitchen_<partnerId>`

When:

- a driver gets assigned

#### `order_assigned`

Sent to:

- `delivery_<driverId>`

When:

- backend assigns order to driver

#### `delivery_notification`

Sent to:

- `delivery_<driverId>`

When:

- delivery notification is created

#### `delivery_started`

Sent to:

- `user_<userId>`

When:

- driver picks order / delivery starts

#### `delivery-location`

Sent to:

- `order_<orderId>`
- `user_<userId>`
- `kitchen_<partnerId>`

When:

- driver sends location update during `OUT_FOR_DELIVERY`

Payload:

```json
{
  "orderId": "<order_id>",
  "deliveryId": "<driver_id>",
  "latitude": 18.5204,
  "longitude": 73.8567
}
```

#### `order_delivered`

Sent to:

- `user_<userId>`

When:

- order is delivered

#### `order_cancelled`

Sent to:

- `user_<userId>`

When:

- order is rejected or cancelled

#### `order_cancelled_by_user`

Sent to:

- `kitchen_<partnerId>`

When:

- customer cancels the order

#### `wallet_refunded`

Sent to:

- `user_<userId>`

When:

- a wallet-paid order is refunded

#### `payment_success`

Sent to:

- `user_<userId>`

When:

- online order payment is confirmed

#### `payment_confirmed`

Sent to:

- `kitchen_<partnerId>`

When:

- online order payment is confirmed

## Socket Actions Frontend Can Trigger

These socket actions are available, but frontend can also use REST APIs. For most screens, REST should remain the primary integration path unless realtime command flow is explicitly required.

### `create_order`

Allowed role:

- `USER`

Payload:

```json
{
  "addressId": "<address_id>",
  "paymentMethod": "COD"
}
```

### `kitchen_action`

Allowed role:

- `PARTNER`

Payload:

```json
{
  "orderId": "<order_id>",
  "action": "READY"
}
```

### `delivery_start`

Allowed role:

- `DELIVERY_AGENT`

Payload:

```json
{
  "orderId": "<order_id>"
}
```

### `mark_delivered`

Allowed role:

- `DELIVERY_AGENT`

Payload:

```json
{
  "orderId": "<order_id>"
}
```

### `delivery-location-update`

Allowed role:

- `DELIVERY_AGENT`

Payload:

```json
{
  "orderId": "<order_id>",
  "latitude": 18.5204,
  "longitude": 73.8567
}
```

## Timeline Fields

Frontend can use these fields for order tracking UI:

- `timeline.placedAt`
- `timeline.acceptedAt`
- `timeline.preparingAt`
- `timeline.readyAt`
- `timeline.pickedAt`
- `timeline.deliveredAt`
- `timeline.cancelledAt`

## Important Frontend Rules

1. For `ONLINE` orders, do not show kitchen progress until payment confirmation succeeds.
2. Kitchen app must explicitly send `PREPARING` and `READY` actions. `ACCEPT` alone is no longer enough.
3. Driver app should not start delivery until order is `READY`.
4. Driver live tracking should begin only after `OUT_FOR_DELIVERY`.
5. User tracking UI should primarily listen to `order_status_update`.

## Suggested Frontend Tracking UI Mapping

- `ORDER_RECEIVED`: Order placed successfully
- `ACCEPTED`: Kitchen accepted your order
- `PROCESSING`: Kitchen is preparing your food
- `READY_FOR_PICKUP`: Order is ready and driver assignment/pickup is happening
- `ON_ROUTE`: Driver is on the way
- `DELIVERED`: Order completed
- `CANCELLED`: Order cancelled

## Files In Backend

Main backend files involved:

- `src/controller/order.controller.js`
- `src/controller/delivery_Agent.controller.js`
- `src/routes/order.routes.js`
- `src/routes/delivery_Agent.routes.js`
- `src/socket/order.socket.js`
- `src/socket/deliveryTracking.socket.js`
- `src/module/order.model.js`
- `src/utils/deliveryAssignment.js`

