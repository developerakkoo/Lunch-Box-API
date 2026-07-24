const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parsePossiblyJsonArray } = require("./media");

const KITCHEN_IMAGE_MAX_COUNT = 5;

const kitchenImagesUploadsDir = path.join(
  __dirname,
  "..",
  "..",
  "uploads",
  "partner-kitchen"
);
fs.mkdirSync(kitchenImagesUploadsDir, { recursive: true });

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

const ALLOWED_MIME = new Set(Object.keys(MIME_TO_EXT));

function parseImageBase64(raw) {
  if (!raw || typeof raw !== "string") {
    const err = new Error("Kitchen image data is required");
    err.statusCode = 400;
    err.code = "INVALID_KITCHEN_IMAGE";
    throw err;
  }

  let mimeType = "image/jpeg";
  let base64Data = raw.trim();

  // Already a stored URL/path — keep as-is (edit flows).
  if (
    base64Data.startsWith("http://") ||
    base64Data.startsWith("https://") ||
    base64Data.startsWith("/uploads/")
  ) {
    return { existingUrl: base64Data };
  }

  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  }

  mimeType = (mimeType || "image/jpeg").toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    const err = new Error(`Unsupported kitchen image type: ${mimeType}`);
    err.statusCode = 400;
    err.code = "INVALID_KITCHEN_IMAGE";
    throw err;
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    const err = new Error("Invalid or empty kitchen image data");
    err.statusCode = 400;
    err.code = "INVALID_KITCHEN_IMAGE";
    throw err;
  }

  if (buffer.length > 10 * 1024 * 1024) {
    const err = new Error("Kitchen image too large (max 10MB)");
    err.statusCode = 400;
    err.code = "INVALID_KITCHEN_IMAGE";
    throw err;
  }

  return { buffer, mimeType };
}

function saveKitchenImageDataUrl(raw) {
  const parsed = parseImageBase64(raw);
  if (parsed.existingUrl) {
    return parsed.existingUrl;
  }

  const ext = MIME_TO_EXT[parsed.mimeType] || ".jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const filePath = path.join(kitchenImagesUploadsDir, filename);
  fs.writeFileSync(filePath, parsed.buffer);
  return `/uploads/partner-kitchen/${filename}`;
}

/**
 * Normalize + persist kitchen images from request body.
 * Accepts array or JSON string of data URLs / existing URLs.
 * @returns {string[]} relative upload paths
 */
function resolveKitchenImages(imagesInput, { required = true } = {}) {
  const list = parsePossiblyJsonArray(imagesInput).filter(
    (item) => typeof item === "string" && item.trim()
  );

  if (required && list.length < 1) {
    const err = new Error("At least one kitchen photo is required");
    err.statusCode = 400;
    err.code = "INVALID_KITCHEN_IMAGE";
    throw err;
  }

  if (list.length > KITCHEN_IMAGE_MAX_COUNT) {
    const err = new Error(`You can upload at most ${KITCHEN_IMAGE_MAX_COUNT} kitchen photos`);
    err.statusCode = 400;
    err.code = "INVALID_KITCHEN_IMAGE";
    throw err;
  }

  return list.map((item) => saveKitchenImageDataUrl(item));
}

module.exports = {
  KITCHEN_IMAGE_MAX_COUNT,
  kitchenImagesUploadsDir,
  resolveKitchenImages
};
