const { randomBytes } = require("crypto");
const User = require("../module/user.model");
const WalletTransaction = require("../module/walletTransaction.model");
const {
  generateAccessToken,
  generateRefreshToken
} = require("../utils/token.utils");

const REFERRAL_REWARD_REFERRER = 50;
const REFERRAL_REWARD_NEW_USER = 25;

const generateReferralCode = async (fullName = "USER") => {
  const base = fullName.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "USER";
  for (let i = 0; i < 10; i += 1) {
    const code = `${base}${randomBytes(2).toString("hex").toUpperCase()}`;
    const exists = await User.findOne({ referralCode: code }).select("_id");
    if (!exists) return code;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
};

const issueUserTokens = async (user) => {
  if (!user.referralCode) {
    user.referralCode = await generateReferralCode(user.fullName || "USER");
  }
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken, user };
};

/**
 * Credits signup referral bonuses to both the referrer and the new user,
 * writing matching wallet ledger entries. Shared by the mobile and Google
 * registration flows.
 */
const applyReferralBonuses = async (referrer, user) => {
  if (!referrer) return;

  const referrerBefore = referrer.walletBalance || 0;
  referrer.walletBalance = referrerBefore + REFERRAL_REWARD_REFERRER;
  referrer.referralEarnings = (referrer.referralEarnings || 0) + REFERRAL_REWARD_REFERRER;
  referrer.referralCount = (referrer.referralCount || 0) + 1;
  await referrer.save();

  await WalletTransaction.create({
    userId: referrer._id,
    type: "CREDIT",
    source: "REFERRAL_BONUS",
    amount: REFERRAL_REWARD_REFERRER,
    balanceBefore: referrerBefore,
    balanceAfter: referrer.walletBalance,
    status: "SUCCESS",
    gateway: "SYSTEM",
    referenceType: "User",
    referenceId: user._id,
    notes: `Referral bonus for inviting ${user.mobileNumber}`
  });

  const newUserBefore = user.walletBalance || 0;
  user.walletBalance = newUserBefore + REFERRAL_REWARD_NEW_USER;
  await user.save();

  await WalletTransaction.create({
    userId: user._id,
    type: "CREDIT",
    source: "REFERRAL_BONUS",
    amount: REFERRAL_REWARD_NEW_USER,
    balanceBefore: newUserBefore,
    balanceAfter: user.walletBalance,
    status: "SUCCESS",
    gateway: "SYSTEM",
    referenceType: "User",
    referenceId: referrer._id,
    notes: "Referral signup bonus"
  });
};

module.exports = {
  REFERRAL_REWARD_REFERRER,
  REFERRAL_REWARD_NEW_USER,
  generateReferralCode,
  issueUserTokens,
  applyReferralBonuses
};
