const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET);

    req.partner = decoded;

    next();

  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
