# Lunch-box-api — Progress Report

Version: snapshot (March 17, 2026)

This document summarizes the project structure, module flows, every API route (by route file), and a detailed step-by-step description of the **Create Order** flow implemented in `src/controller/order.controller.js`.

**Project structure (high-level)**
- `src/app.js`, `src/index.js`: application bootstrap and server start.
- `src/config/`: DB and swagger configuration.
- `src/routes/`: Express route definitions (user, partner, order, cart, admin, etc.).
- `src/controller/`: request handlers per domain (order.controller.js, user.controller.js, partner.controller.js, etc.).
- `src/module/`: Mongoose models for all entities (Order, Cart, User, Partner, Delivery_Agent, etc.).
- `src/middlewares/`: authentication for user/partner/admin/driver.
- `src/utils/`: helpers (payment wrappers, delivery assignment, notifications, token utils, etc.).

**Module flow overview**
- Controllers: receive requests, validate input, call model-level operations and utils, emit socket events and notifications, return HTTP responses.
- Models: persist business entities (orders, carts, users, partners, delivery agents).
- Middlewares: authenticate and attach actor identity to the request (`req.user`, `req.partner`, `req.driver`).
- Utils: payment (Razorpay, Stripe), delivery assignment (`deliveryAssignment.js`), notifications (`notifyPartner`, delivery/partner notifications), token utilities.

API routes (grouped by route file)

- src/routes/menuItem.routes.js
  - POST  /api/menu-item/create (partnerAuth) — create a menu item
  - GET   /api/menu-item/list   (partnerAuth) — list menu items
  - PUT   /api/menu-item/update/:id (partnerAuth) — update menu item
  - DELETE /api/menu-item/delete/:id (partnerAuth) — delete menu item
  - PATCH /api/menu-item/status/:id (partnerAuth) — toggle menu item status

- src/routes/delivery_Agent.routes.js
  - POST  /api/delivery/register — register delivery driver
  - POST  /api/delivery/login — driver login
  - GET   /api/delivery/profile (driverAuth) — get profile
  - PATCH /api/delivery/profile (driverAuth) — update profile
  - PUT   /api/delivery/toggle-online (driverAuth) — toggle online/offline
  - PATCH /api/delivery/availability (driverAuth) — change availability
  - PUT   /api/delivery/update-location (driverAuth) — update live location
  - GET   /api/delivery/orders (driverAuth) — list orders by status (query param)
  - GET   /api/delivery/orders/:orderId/route (driverAuth) — get route details
  - GET   /api/delivery/orders/:orderId/customer-contact (driverAuth) — customer contact
  - PUT   /api/delivery/accept-order/:orderId (driverAuth) — accept assigned order
  - PUT   /api/delivery/reject-order/:orderId (driverAuth) — reject assigned order
  - PUT   /api/delivery/pick-order/:orderId (driverAuth) — mark picked
  - PUT   /api/delivery/complete-order/:orderId (driverAuth) — mark complete
  - GET   /api/delivery/notifications (driverAuth) — get notifications
  - PATCH /api/delivery/notifications/:notificationId/read (driverAuth)
  - PATCH /api/delivery/notifications/read-all (driverAuth)
  - GET   /api/delivery/dashboard (driverAuth)

- src/routes/user.routes.js
  - POST  /api/user/login — login or register user
  - GET   /api/user/nearby-kitchens — search kitchens (lat/long, radius, search, pagination)
  - GET   /api/user/kitchen/:kitchenId/menu — get kitchen menu for customer
  - GET   /api/user/menu-item/:menuItemId — get menu item details
  - GET   /api/user/offers — get public offers/banners
  - GET   /api/user/profile (auth) — get user profile
  - PATCH /api/user/profile (auth) — update profile
  - POST  /api/user/add-address (auth) — add address
  - GET   /api/user/addresses (auth) — list addresses
  - PUT   /api/user/address/:addressId (auth) — update address
  - DELETE /api/user/address/:addressId (auth) — delete address
  - PATCH /api/user/address/:addressId/default (auth) — set default address
  - GET   /api/user/wallet (auth) — wallet summary
  - GET   /api/user/wallet/transactions (auth)
  - POST  /api/user/wallet/topup/create (auth) — create top-up (Razorpay/Stripe)
  - POST  /api/user/wallet/topup/confirm (auth) — confirm top-up
  - GET   /api/user/referral (auth)
  - POST  /api/user/referral/apply (auth)
  - GET   /api/user/favorites (auth)
  - POST  /api/user/favorites/:kitchenId (auth)

- src/routes/category.routes.js
  - POST  /api/category/create (partnerAuth) — create category
  - GET   /api/category/list (partnerAuth) — list categories
  - PUT   /api/category/update/:id (partnerAuth) — update category
  - DELETE /api/category/delete/:id (partnerAuth)

- src/routes/cart.routes.js
  - POST  /api/cart/add (auth) — add item to cart
  - POST  /api/cart/checkout (auth) — checkout cart, apply coupon

- src/routes/order.routes.js
  - POST  /api/order/create (auth) — Create order from cart (detailed flow below)
  - PATCH /api/order/kitchen-action/:orderId (partnerAuth) — partner accept/reject
  - PATCH /api/order/delivery-action/:orderId (driverAuth) — mark out-for-delivery
  - PATCH /api/order/deliver/:orderId (driverAuth) — mark delivered
  - POST  /api/order/confirm-payment (auth) — confirm Razorpay payment for order
  - GET   /api/order/my-orders (auth) — user order history
  - GET   /api/order/my-orders/:orderId (auth) — order details
  - PATCH /api/order/cancel/:orderId (auth) — cancel user's order
  - POST  /api/order/:orderId/rate (auth) — rate/review delivered order
  - POST  /api/order/:orderId/tip (auth) — add tip (wallet/razorpay/stripe)
  - POST  /api/order/:orderId/tip/confirm (auth) — confirm tip payment

- src/routes/partner.routes.js
  - POST  /api/partner/register — partner register
  - POST  /api/partner/login — partner login
  - GET   /api/partner/dashboard (partnerAuth) — partner dashboard
  - GET   /api/partner/orders (partnerAuth) — partner orders by status
  - GET   /api/partner/subscription-orders (partnerAuth)
  - PUT   /api/partner/kitchen/status (partnerAuth)
  - GET   /api/partner/profile (partnerAuth)
  - PATCH /api/partner/profile (partnerAuth)
  - GET   /api/partner/orders/:orderId/delivery-contact (partnerAuth)
  - GET   /api/partner/notifications (partnerAuth)
  - PATCH /api/partner/notifications/:notificationId/read (partnerAuth)
  - PATCH /api/partner/notifications/read-all (partnerAuth)

- src/routes/addon.routes.js
  - POST  /api/addon/category/create (partnerAuth)
  - POST  /api/addon/item/create (partnerAuth)
  - GET   /api/addon/category/list (partnerAuth)
  - GET   /api/addon/item/list (partnerAuth)
  - DELETE /api/addon/item/delete/:id (partnerAuth)

- src/routes/admin/kitchen.routes.js
  - GET   /api/admin/kitchens (adminAuth) — list all kitchens
  - PUT   /api/admin/kitchen/status/:id (adminAuth)

- src/routes/admin/dashboard.routes.js
  - GET   /api/admin/dashboard (adminAuth) — admin dashboard overview

- src/routes/admin/banner.routes.js
  - POST  /api/admin/banner/create (adminAuth)
  - GET   /api/admin/banner/list (adminAuth)
  - DELETE /api/admin/banner/:id (adminAuth)

- src/routes/admin/admin.routes.js
  - POST  /api/admin/register — register admin
  - POST  /api/admin/login — admin login


Create Order flow (detailed)
--------------------------------
This flow is implemented in `src/controller/order.controller.js` -> `createOrder`.

1. Actor & role check
   - Actor identity is derived from request (`getActorIdFromReq(req)`) using `req.user`.
   - `getActorRole()` ensures the actor is a `USER` (only users may create orders). Returns 403 otherwise.

2. Input validation
   - Required: `addressId` (valid Mongo ObjectId). Optional: `paymentMethod` (defaults to `COD`).
   - Allowed payment methods: `COD`, `ONLINE`, `WALLET`.

3. Cart lookup and validation
   - Load `Cart.findOne({ userId })`. If cart missing or empty -> error `CART_EMPTY`.

4. Address validation
   - Load user document and locate address by `addressId`. If not found -> `ADDRESS_NOT_FOUND`.

5. Prepare `orderData`
   - Items: transformed from cart items with menuItem id, name, price, quantity and addons.
   - `priceDetails`: itemTotal = cart.totalAmount, tax/delivery/platformFee/discount set to 0 (placeholders).
   - `deliveryAddress` filled from selected address.
   - `payment`: method set; if `WALLET` then paymentStatus set to `PAID` immediately.
   - `status` initialized to `PLACED`, timeline.placedAt set.

6. Wallet deduction (if `WALLET`)
   - Validate user wallet balance; if insufficient -> `INSUFFICIENT_WALLET_BALANCE`.
   - Deduct cart total from `user.walletBalance` and save user.

7. Persist order
   - `Order.create(orderData)` to persist.

8. Online payment preparation (if `ONLINE`)
   - Create a Razorpay order via `createRazorOrder(amountInPaise)` and attach returned data to response (`razorpayOrder`).
   - The actual payment confirmation uses `/api/order/confirm-payment`.

9. Clear cart
   - Empty cart items and set `cart.totalAmount = 0` then save.

10. Notifications & real-time events
   - Emit socket to kitchen room: `global.io?.to(kitchen_<partnerId>).emit('new_order', order)`.
   - Emit to user socket: `order_status_update` with `ORDER_RECEIVED` state.
   - Send partner push/notification via `notifyPartner({ partnerId, type: 'NEW_ORDER', ... })`.

11. Response
   - HTTP 201 with JSON: { message: "Order created successfully", order, razorpayOrder }.

Edge cases and important notes
- Orders created with `WALLET` have `payment.paymentStatus = 'PAID'` immediately and the wallet is debited.
- Orders created with `ONLINE` return a `razorpayOrder` object to the client; client must call `/api/order/confirm-payment` to finalize.
- The `kitchenAction` flow (partner accepts/rejects): on `ACCEPT`, partner sets `ACCEPTED`, timeline updated, `assignDeliveryBoy(order)` is attempted.
- If partner `REJECT`s the order, status becomes `CANCELLED` and when payment is `WALLET` and `PAID` the amount is refunded to the user's wallet.

Where to look next in the codebase
- Create Order core: [src/controller/order.controller.js](src/controller/order.controller.js#L1-L220)
- Payment helpers: [src/utils/razorpay.js](src/utils/razorpay.js)
- Delivery assignment: [src/utils/deliveryAssignment.js](src/utils/deliveryAssignment.js)
- Socket implementations: [src/socket/socket.js](src/socket/socket.js)

