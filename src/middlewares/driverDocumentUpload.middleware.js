const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadsDir = path.join(__dirname, "..", "..", "uploads", "driver-documents");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf"
]);

const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".pdf"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : (file.mimetype === "application/pdf" ? ".pdf" : ".jpg");
    cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const mime = String(file.mimetype || "").toLowerCase();
  if (ALLOWED_MIME.has(mime)) {
    return cb(null, true);
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ALLOWED_EXT.has(ext)) {
    return cb(null, true);
  }

  const err = new Error("Only image or PDF files are allowed");
  err.code = "INVALID_DRIVER_DOCUMENT";
  err.status = 400;
  return cb(err);
};

const uploadDriverDocuments = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 4
  }
});

function handleDriverDocumentUploadError(err, req, res, next) {
  if (!err) return next();

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Document too large (max 10MB)",
      code: "INVALID_DRIVER_DOCUMENT"
    });
  }

  if (err.code === "INVALID_DRIVER_DOCUMENT" || err.message === "Only image or PDF files are allowed") {
    return res.status(400).json({
      message: err.message,
      code: "INVALID_DRIVER_DOCUMENT"
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: err.message,
      code: "INVALID_DRIVER_DOCUMENT"
    });
  }

  return next(err);
}

module.exports = {
  uploadDriverDocuments,
  handleDriverDocumentUploadError,
  driverDocumentsUploadsDir: uploadsDir
};
