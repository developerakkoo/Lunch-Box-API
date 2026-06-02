const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { uploadsDir } = require("../middlewares/upload.middleware");

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

function parseBase64Input(raw, mimeTypeHint) {
  if (!raw || typeof raw !== "string") {
    const err = new Error("proofBase64 is required");
    err.statusCode = 400;
    err.code = "INVALID_PROOF_FILE";
    throw err;
  }

  let mimeType = mimeTypeHint || "image/jpeg";
  let base64Data = raw.trim();

  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  }

  mimeType = mimeType.toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    const err = new Error(`Unsupported proof image type: ${mimeType}`);
    err.statusCode = 400;
    err.code = "INVALID_PROOF_FILE";
    throw err;
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    const err = new Error("Invalid or empty proofBase64 data");
    err.statusCode = 400;
    err.code = "INVALID_PROOF_FILE";
    throw err;
  }

  if (buffer.length > 10 * 1024 * 1024) {
    const err = new Error("Image too large (max 10MB)");
    err.statusCode = 400;
    err.code = "INVALID_PROOF_FILE";
    throw err;
  }

  return { buffer, mimeType };
}

/**
 * Persist a base64 delivery proof to uploads/ and return the stored filename.
 */
function saveBase64Proof(proofBase64, proofMimeType) {
  const { buffer, mimeType } = parseBase64Input(proofBase64, proofMimeType);
  const ext = MIME_TO_EXT[mimeType] || ".jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, buffer);
  return filename;
}

module.exports = {
  saveBase64Proof
};
