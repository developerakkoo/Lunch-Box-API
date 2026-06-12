const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { partnerDocumentsUploadsDir } = require("../middlewares/partnerDocumentUpload.middleware");

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf"
};

const ALLOWED_MIME = new Set(Object.keys(MIME_TO_EXT));

function parseBase64Input(raw, mimeTypeHint) {
  if (!raw || typeof raw !== "string") {
    const err = new Error("Document data is required");
    err.statusCode = 400;
    err.code = "INVALID_PARTNER_DOCUMENT";
    throw err;
  }

  let mimeType = mimeTypeHint || "";
  let base64Data = raw.trim();

  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  }

  mimeType = (mimeType || "image/jpeg").toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    const err = new Error(`Unsupported document type: ${mimeType}`);
    err.statusCode = 400;
    err.code = "INVALID_PARTNER_DOCUMENT";
    throw err;
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    const err = new Error("Invalid or empty document data");
    err.statusCode = 400;
    err.code = "INVALID_PARTNER_DOCUMENT";
    throw err;
  }

  if (buffer.length > 10 * 1024 * 1024) {
    const err = new Error("Document too large (max 10MB)");
    err.statusCode = 400;
    err.code = "INVALID_PARTNER_DOCUMENT";
    throw err;
  }

  return { buffer, mimeType };
}

/**
 * Persist a base64 partner document to uploads/partner-documents/ and
 * return metadata matching the multipart `buildDocumentMeta` shape.
 */
function savePartnerBase64Document(base64, mimeTypeHint, originalName) {
  const { buffer, mimeType } = parseBase64Input(base64, mimeTypeHint);
  const ext = MIME_TO_EXT[mimeType] || ".jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const filePath = path.join(partnerDocumentsUploadsDir, filename);

  fs.writeFileSync(filePath, buffer);

  return {
    url: `/uploads/partner-documents/${filename}`,
    originalName: originalName || filename,
    mimeType,
    size: buffer.length,
    uploadedAt: new Date()
  };
}

module.exports = {
  savePartnerBase64Document
};
