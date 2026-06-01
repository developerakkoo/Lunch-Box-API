const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const { uploadsDir } = require("./middlewares/upload.middleware");

const app = express();

/* -------------------------------------------------------------------------- */
/*                              GLOBAL MIDDLEWARES                            */
/* -------------------------------------------------------------------------- */

app.use(cors());
// Partners sometimes send menu images as JSON/base64 payloads from the admin app.
// Keep the global limit high enough for those requests while still preventing
// excessively large bodies from being accepted by default.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(morgan("dev"));
app.use(helmet());
app.use(compression());
app.use(
  "/uploads",
  express.static(path.resolve(uploadsDir), {
    setHeaders: (res) => {
      // Allow admin.techlapse.co.in to embed public image assets from this API host.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  })
);

/* -------------------------------------------------------------------------- */
/*                                  SWAGGER                                   */
/* -------------------------------------------------------------------------- */

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* -------------------------------------------------------------------------- */
/*                                  ROUTES                                    */
/* -------------------------------------------------------------------------- */

// User Routes
const userRoutes = require("./routes/user.routes");

// Partner Routes
const partnerRoutes = require("./routes/partner.routes");

// Delivery Agent Routes
const deliveryRoutes = require("./routes/delivery_Agent.routes");

// Category Routes
const categoryRoutes = require("./routes/category.routes");

// Menu Routes
const menuRoutes = require("./routes/menuItem.routes");

// Addon Routes
const addonRoutes = require("./routes/addon.routes");

// Order Routes
const orderRoutes = require("./routes/order.routes");

//Create cart
const createCart = require("./routes/cart.routes");

/* ---------------------------- ADMIN ROUTES -------------------------------- */

const adminAuthRoutes = require("./routes/admin/admin.routes");
const adminDashboardRoutes = require("./routes/admin/dashboard.routes");
const adminBannerRoutes = require("./routes/admin/banner.routes");
const adminCategoryRoutes = require("./routes/admin/category.routes");
const adminKitchenRoutes = require("./routes/admin/kitchen.routes");
const adminOrderRoutes = require("./routes/admin/order.routes");
const adminDriverRoutes = require("./routes/admin/driver.routes");
const adminUserRoutes = require("./routes/admin/user.routes");
const adminSubscriptionRoutes = require("./routes/admin/subscription.routes");
const adminNotificationRoutes = require("./routes/admin/notification.routes");
const adminSettingsRoutes = require("./routes/admin/settings.routes");

/* -------------------------------------------------------------------------- */
/*                                HEALTH CHECK                                */
/* -------------------------------------------------------------------------- */

app.get("/", (req, res) => {
  res.send("EatEpic API Running 🚀");
});

/* -------------------------------------------------------------------------- */
/*                             MOUNT APPLICATION ROUTES                       */
/* -------------------------------------------------------------------------- */

app.use("/api/user", userRoutes);
app.use("/api/partner", partnerRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/addon", addonRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/cart", createCart);

const webhookController = require("./controller/webhook.controller");
app.post("/api/webhooks/razorpay", webhookController.razorpayWebhook);



/* ----------------------------- ADMIN ROUTES -------------------------------- */

app.use("/api/admin", adminAuthRoutes);
app.use("/api/admin", adminDriverRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/banner", adminBannerRoutes);
app.use("/api/admin/category", adminCategoryRoutes);
app.use("/api/admin", adminKitchenRoutes);
app.use("/api/admin", adminOrderRoutes);
app.use("/api/admin", adminUserRoutes);
app.use("/api/admin", adminSubscriptionRoutes);
app.use("/api/admin", adminNotificationRoutes);
app.use("/api/admin", adminSettingsRoutes);

/* -------------------------------------------------------------------------- */
/*                              404 ROUTE HANDLER                             */
/* -------------------------------------------------------------------------- */

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

/* -------------------------------------------------------------------------- */
/*                           GLOBAL ERROR HANDLER                             */
/* -------------------------------------------------------------------------- */


app.use((err, req, res, next) => {
  console.error(err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request body is too large. Please upload a smaller image or send it as multipart/form-data."
    });
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error"
  });
});

module.exports = app;
