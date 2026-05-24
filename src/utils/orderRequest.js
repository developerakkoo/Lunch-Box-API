const mongoose = require("mongoose");

const VALID_ORDER_PAYMENT_METHODS = ["COD", "ONLINE", "WALLET"];

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const extractAddressId = (value) => {
  if (!value) return null;
  if (typeof value === "string") return isValidObjectId(value) ? String(value) : null;
  if (typeof value === "object") {
    const nestedId = value._id || value.id;
    return typeof nestedId === "string" && isValidObjectId(nestedId) ? nestedId : null;
  }
  return null;
};

const normalizePaymentMethod = (value, fallback = "COD") => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toUpperCase();
  return VALID_ORDER_PAYMENT_METHODS.includes(normalized) ? normalized : null;
};

const resolveOrderAddress = (user, payload = {}) => {
  const addresses = Array.isArray(user?.addresses) ? user.addresses : [];

  const candidates = [
    payload.addressId,
    payload.selectedAddressId,
    payload.deliveryAddressId,
    payload.shippingAddressId,
    payload.address,
    payload.selectedAddress,
    payload.deliveryAddress,
    payload.shippingAddress
  ];

  for (const candidate of candidates) {
    const addressId = extractAddressId(candidate);
    if (!addressId) continue;
    const address = addresses.id(addressId);
    if (address) {
      return {
        address,
        addressId: String(address._id),
        source: "provided"
      };
    }
  }

  const defaultAddress = addresses.find((addr) => addr.isDefault) || addresses[0] || null;
  if (defaultAddress) {
    return {
      address: defaultAddress,
      addressId: String(defaultAddress._id),
      source: "fallback"
    };
  }

  return {
    address: null,
    addressId: null,
    source: "missing"
  };
};

module.exports = {
  VALID_ORDER_PAYMENT_METHODS,
  normalizePaymentMethod,
  resolveOrderAddress
};
