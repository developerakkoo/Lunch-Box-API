const { OAuth2Client } = require("google-auth-library");
const User = require("../module/user.model");
const {
  generateReferralCode,
  issueUserTokens,
  applyReferralBonuses
} = require("../services/userAuth.service");

const oauthClient = new OAuth2Client();

const apiError = (res, status, message) =>
  res.status(status).json({ statusCode: status, message });

const authResponse = (res, status, message, tokens) =>
  res.status(status).json({
    statusCode: status,
    message,
    data: {
      userId: tokens.user._id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user
    }
  });

/**
 * Verifies a Google ID token and returns the trusted profile claims.
 * Throws with a client-safe message when the token is invalid.
 */
const verifyGoogleIdToken = async (idToken) => {
  const audiences = [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID
  ]
    .map((id) => (id || "").trim())
    .filter(Boolean);

  if (!audiences.length) {
    const err = new Error("Google Sign-In is not configured on the server");
    err.statusCode = 500;
    throw err;
  }

  let payload;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: audiences.length === 1 ? audiences[0] : audiences
    });
    payload = ticket.getPayload();
  } catch (_) {
    const err = new Error("Invalid or expired Google token");
    err.statusCode = 401;
    throw err;
  }

  if (!payload?.sub || !payload.email) {
    const err = new Error("Google account has no usable identity");
    err.statusCode = 401;
    throw err;
  }
  if (payload.email_verified !== true) {
    const err = new Error("Google account email is not verified");
    err.statusCode = 401;
    throw err;
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    fullName: payload.name || "",
    profileImage: payload.picture || ""
  };
};

const linkGoogleProfile = async (user, profile) => {
  let changed = false;
  if (!user.googleId) {
    user.googleId = profile.googleId;
    changed = true;
  }
  if (!user.email && profile.email) {
    user.email = profile.email;
    changed = true;
  }
  if (!user.profileImage && profile.profileImage) {
    user.profileImage = profile.profileImage;
    changed = true;
  }
  if (changed) await user.save();
};

/**
 * POST /api/user/google
 * Body: { idToken }
 * Logs in an existing user via Google, or reports that registration
 * (mobile number) is still needed.
 */
exports.googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return apiError(res, 400, "idToken is required");
    }

    const profile = await verifyGoogleIdToken(idToken);

    let user = await User.findOne({ googleId: profile.googleId });
    if (!user) {
      // Email is verified by Google, so it is safe to link an existing
      // mobile-login account with the same email.
      user = await User.findOne({ email: profile.email });
    }

    if (!user) {
      return res.status(200).json({
        statusCode: 200,
        message: "Registration required",
        data: {
          requiresRegistration: true,
          profile: {
            fullName: profile.fullName,
            email: profile.email
          }
        }
      });
    }

    if (user.isBlocked) {
      return apiError(res, 403, "Your account has been blocked");
    }

    await linkGoogleProfile(user, profile);
    const tokens = await issueUserTokens(user);
    return authResponse(res, 200, "Login successful", tokens);
  } catch (error) {
    return apiError(res, error.statusCode || 500, error.message);
  }
};

/**
 * POST /api/user/google/register
 * Body: { idToken, mobileNumber, countryCode?, referralCode?, fullName? }
 * Completes signup for a new Google user by attaching a mobile number.
 */
exports.googleRegister = async (req, res) => {
  try {
    const { idToken, mobileNumber, countryCode, referralCode, fullName } = req.body;
    if (!idToken) {
      return apiError(res, 400, "idToken is required");
    }
    if (!mobileNumber || !/^\d{10}$/.test(String(mobileNumber).trim())) {
      return apiError(res, 400, "A valid 10-digit mobile number is required");
    }

    const profile = await verifyGoogleIdToken(idToken);
    const mobile = String(mobileNumber).trim();

    // Already fully registered with this Google account? Just log in.
    let user = await User.findOne({ googleId: profile.googleId });
    if (!user) {
      user = await User.findOne({ email: profile.email });
    }

    // The mobile number may belong to an existing mobile-login account;
    // link Google to it (mobile login itself has no OTP, same trust model).
    if (!user) {
      user = await User.findOne({ mobileNumber: mobile });
    }

    if (user) {
      if (user.isBlocked) {
        return apiError(res, 403, "Your account has been blocked");
      }
      await linkGoogleProfile(user, profile);
      const tokens = await issueUserTokens(user);
      return authResponse(res, 200, "Login successful", tokens);
    }

    let referredBy = null;
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (!referrer) {
        return apiError(res, 400, "Invalid referral code");
      }
      referredBy = referrer.referralCode;
    }

    const name = (fullName || profile.fullName || "").trim() || "User";
    const newUser = await User.create({
      countryCode: countryCode || "+91",
      mobileNumber: mobile,
      fullName: name,
      email: profile.email,
      profileImage: profile.profileImage || undefined,
      googleId: profile.googleId,
      referralCode: await generateReferralCode(name),
      referredBy,
      isRegistered: true
    });

    await applyReferralBonuses(referrer, newUser);

    const tokens = await issueUserTokens(newUser);
    return authResponse(res, 201, "Registration successful", tokens);
  } catch (error) {
    return apiError(res, error.statusCode || 500, error.message);
  }
};
