const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { driverDocumentsUploadsDir } = require("../middlewares/driverDocumentUpload.middleware");

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

function documentError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "INVALID_DRIVER_DOCUMENT";
  return err;
}

function parseBase64Input(raw, mimeTypeHint) {
  if (!raw || typeof raw !== "string") {
    throw documentError("Document data is required");
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
    throw documentError(`Unsupported document type: ${mimeType}`);
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    throw documentError("Invalid or empty document data");
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw documentError("Document too large (max 10MB)");
  }

  return { buffer, mimeType };
}

/**
 * Persist a base64 driver document to uploads/driver-documents/ and
 * return metadata matching the multipart `buildDocumentMeta` shape.
 */
function saveDriverBase64Document(base64, mimeTypeHint, originalName) {
  const { buffer, mimeType } = parseBase64Input(base64, mimeTypeHint);
  const ext = MIME_TO_EXT[mimeType] || ".jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const filePath = path.join(driverDocumentsUploadsDir, filename);

  fs.writeFileSync(filePath, buffer);

  return {
    url: `/uploads/driver-documents/${filename}`,
    originalName: originalName || filename,
    mimeType,
    size: buffer.length,
    uploadedAt: new Date()
  };
}

function deleteDriverDocumentFile(stored) {
  if (!stored) return false;

  const uploadsRoot = path.resolve(driverDocumentsUploadsDir);
  const tryUnlink = (filePath) => {
    const resolved = path.resolve(filePath);
    if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) {
      return false;
    }
    if (!fs.existsSync(resolved)) return false;
    fs.unlinkSync(resolved);
    return true;
  };

  if (typeof stored === "object" && stored.path && tryUnlink(stored.path)) {
    return true;
  }

  const raw = typeof stored === "string" ? stored : (stored.filename || stored.url || "");
  const base = path.basename(String(raw).split("?")[0]);
  if (!base || base === "." || base === "..") return false;
  return tryUnlink(path.join(uploadsRoot, base));
}

module.exports = {
  saveDriverBase64Document,
  deleteDriverDocumentFile
};
