const path = require("path");

const PUBLIC_ASSET_BASE_URL =
  (process.env.PUBLIC_ASSET_BASE_URL || "https://food.techlapse.co.in").replace(/\/+$/, "");

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value);

const normalizeStoredAssetPath = (value) => {
  if (!value || typeof value !== "string") return value;

  if (isAbsoluteUrl(value)) return value;

  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return value;

  if (normalized.startsWith("uploads/")) {
    return `${PUBLIC_ASSET_BASE_URL}/${normalized}`;
  }

  return `${PUBLIC_ASSET_BASE_URL}/uploads/${normalized}`;
};

const normalizeAssetValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeAssetValue);
  }

  return normalizeStoredAssetPath(value);
};

const parsePossiblyJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];

  if (typeof value !== "string") return [value];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch (error) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

const getUploadedFileName = (file) => {
  if (!file) return "";
  return file.filename || path.basename(file.path || "");
};

module.exports = {
  PUBLIC_ASSET_BASE_URL,
  getUploadedFileName,
  normalizeAssetValue,
  parsePossiblyJsonArray
};
