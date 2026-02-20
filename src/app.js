const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

const app = express();

/* -------------------------------------------------------------------------- */
/*                              GLOBAL MIDDLEWARES                            */
/* -------------------------------------------------------------------------- */

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(helmet());
app.use(compression());

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
const adminKitchenRoutes = require("./routes/admin/kitchen.routes");

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



/* ----------------------------- ADMIN ROUTES -------------------------------- */

app.use("/api/admin", adminAuthRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/banner", adminBannerRoutes);
app.use("/api/admin", adminKitchenRoutes);

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

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error"
  });
});

module.exports = app;
