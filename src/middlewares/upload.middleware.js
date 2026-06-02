const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const logger = require("../utils/logger");

const uploadsDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 10 && ALLOWED_IMAGE_EXT.has(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
  }
});

function hasAllowedImageExtension(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return ALLOWED_IMAGE_EXT.has(ext);
}

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
    return;
  }

  if (hasAllowedImageExtension(file.originalname)) {
    cb(null, true);
    return;
  }

  const err = new Error("Only image files are allowed");
  err.code = "INVALID_PROOF_FILE";
  err.status = 400;
  cb(err);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/** Use after multer on driver proof routes — returns 400 instead of generic 500. */
function handleUploadError(err, req, res, next) {
  if (!err) return next();

  logger.error("Complete order upload rejected", {
    debugId: req.completeOrderDebugId,
    code: err.code,
    message: err.message,
    contentType: req.headers["content-type"]
  });

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Image too large (max 10MB)",
      code: "INVALID_PROOF_FILE",
      debugId: req.completeOrderDebugId
    });
  }

  if (err.code === "INVALID_PROOF_FILE" || err.message === "Only image files are allowed") {
    return res.status(400).json({
      message: err.message,
      code: "INVALID_PROOF_FILE",
      debugId: req.completeOrderDebugId
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: err.message,
      code: "INVALID_PROOF_FILE",
      debugId: req.completeOrderDebugId
    });
  }

  return next(err);
}

module.exports = {
  upload,
  uploadsDir,
  handleUploadError
};
