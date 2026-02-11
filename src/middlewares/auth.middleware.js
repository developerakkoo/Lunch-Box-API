const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      statusCode: 401,
      message: "Token missing"
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET);

    req.user = decoded;

    next();

  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: "Invalid token"
    });
  }
};
