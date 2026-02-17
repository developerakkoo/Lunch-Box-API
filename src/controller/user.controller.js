const User = require("../module/user.model");
const {
  generateAccessToken,
  generateRefreshToken
} = require("../utils/token.utils");
const jwt = require("jsonwebtoken");


/* ================= LOGIN / REGISTER USER ================= */

exports.loginUser = async (req, res) => {
  try {

    const { countryCode, mobileNumber, fullName, email } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        statusCode: 400,
        message: "Mobile number is required"
      });
    }

    let user = await User.findOne({ mobileNumber });

    /* ===== NEW USER ===== */

    if (!user) {

      if (!fullName || !email) {
        return res.status(400).json({
          statusCode: 400,
          message: "Full name and email required for new user"
        });
      }

      user = await User.create({
        countryCode: countryCode || "+91",
        mobileNumber,
        fullName,
        email,
        isRegistered: true
      });

      console.log("🆕 New user created:", user._id);
    }

    /* ===== GENERATE TOKENS ===== */

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    return res.status(user.isNew ? 201 : 200).json({
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
    console.log("🔥 Login Error:", error.message);

    res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

/* ================= ADD ADDRESS ================= */

exports.addAddress = async (req, res) => {
  try {

    const userId = req.user.id;   // from auth middleware

    const {
      label,
      fullAddress,
      city,
      state,
      pincode,
      latitude,
      longitude,
      isDefault
    } = req.body;

    if (!fullAddress) {
      return res.status(400).json({
        statusCode: 400,
        message: "Full address is required"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found"
      });
    }

    // 🔥 If new address is default → make others false
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    user.addresses.push({
      label,
      fullAddress,
      city,
      state,
      pincode,
      latitude,
      longitude,
      isDefault: isDefault || false
    });

    await user.save();

    console.log("🏠 Address added for user:", userId);

    res.status(201).json({
      statusCode: 201,
      message: "Address added successfully",
      data: user.addresses
    });

  } catch (error) {

    console.log("🔥 Add Address Error:", error.message);

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
