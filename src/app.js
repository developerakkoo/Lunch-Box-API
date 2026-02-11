const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(helmet());
app.use(compression());

// Import Routes
const userRoutes = require("./routes/user.routes");
const partnerRoutes = require("./routes/partner.routes");
const deliveryRoutes = require("./routes/delivery_Agent.routes");

// Health Route
app.get("/", (req, res) => {
  res.send("Lunch Box API Running 🚀");
});

// Mount Routes
app.use("/api/user", userRoutes);
app.use("/api/partner", partnerRoutes);
app.use("/api/delivery", deliveryRoutes);

module.exports = app;
