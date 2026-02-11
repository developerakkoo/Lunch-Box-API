const User = require("../module/user.model");
const {
  generateAccessToken,
  generateRefreshToken
} = require("../utils/token.utils");
const jwt = require("jsonwebtoken");


/* ================= LOGIN USER ================= */

exports.loginUser = async (req, res) => {

  try {

    const {
      mobileNumber,
      fullName,
      email,
      address
    } = req.body;

    let user = await User.findOne({ mobileNumber });

    /* ===== NEW USER ===== */

    if (!user) {

      if (!fullName || !email || !address) {
        return res.status(400).json({
          statusCode: 400,
          message: "Full name, email and address required"
        });
      }

      user = await User.create({
        mobileNumber,
        fullName,
        email,
        address,
        isRegistered: true
      });

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      user.refreshToken = refreshToken;
      await user.save();

      return res.status(201).json({
        statusCode: 201,
        message: "User registered successfully",
        data: {
          userId: user._id,
          accessToken,
          refreshToken,
          user
        }
      });
    }


    /* ===== EXISTING USER ===== */

    if (!user.isRegistered) {
      return res.status(400).json({
        statusCode: 400,
        message: "User profile incomplete"
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    return res.json({
      statusCode: 200,
      message: "Login successful",
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        user
      }
    });

  } catch (error) {

    res.status(500).json({
      statusCode: 500,
      message: error.message
    });

  }
};


/* ================= PROFILE ================= */

exports.getProfile = async (req, res) => {

  const user = await User.findById(req.user.id);

  res.json({
    statusCode: 200,
    data: user
  });
};



/* ================= REFRESH TOKEN ================= */

exports.refreshAccessToken = async (req, res) => {

  try {

    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token required"
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        message: "Invalid refresh token"
      });
    }

    const accessToken = generateAccessToken(user);

    res.json({
      statusCode: 200,
      message: "Access token refreshed",
      data: { accessToken }
    });

  } catch (error) {
    res.status(401).json({
      message: "Refresh token expired"
    });
  }
};
