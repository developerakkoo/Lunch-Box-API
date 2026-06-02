const crypto = require("crypto");
const logger = require("../utils/logger");

function extractProofFile(req) {
  if (req.file) return req.file;

  const files = req.files;
  if (!files) return null;

  if (Array.isArray(files)) {
    return files.find(Boolean) || null;
  }

  const fileFields = ["proof", "deliveryProof", "delivery_proof", "image", "photo"];
  for (const field of fileFields) {
    const file = files[field];
    if (Array.isArray(file) && file[0]) return file[0];
    if (file && !Array.isArray(file)) return file;
  }

  return null;
}

/** First middleware on complete-order routes — assigns a trace id and logs inbound request. */
function logCompleteOrderEntry(req, res, next) {
  req.completeOrderDebugId = crypto.randomUUID();
  logger.info("Complete order pipeline: entry", {
    debugId: req.completeOrderDebugId,
    method: req.method,
    path: req.originalUrl || req.path,
    orderId: req.params.orderId,
    contentType: req.headers["content-type"],
    contentLength: req.headers["content-length"],
    userAgent: req.headers["user-agent"]
  });
  next();
}

/** After attachDeliveryAgent — logs authenticated driver context. */
function logCompleteOrderAfterAuth(req, res, next) {
  const agent = req.deliveryAgent;
  logger.info("Complete order pipeline: authenticated", {
    debugId: req.completeOrderDebugId,
    driverId: req.driver?.id,
    agentId: agent?._id?.toString(),
    agentStatus: agent?.status,
    isAvailable: agent?.isAvailable,
    isOnline: agent?.isOnline
  });
  next();
}

/** After multer — logs whether proof file was parsed. */
function logCompleteOrderAfterUpload(req, res, next) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    logger.info("Complete order pipeline: json body mode", {
      debugId: req.completeOrderDebugId,
      hasProofBase64: Boolean(req.body?.proofBase64),
      proofMimeType: req.body?.proofMimeType
    });
    return next();
  }

  const proof = extractProofFile(req);
  const files = req.files;
  const fileFieldNames =
    files && !Array.isArray(files) ? Object.keys(files) : Array.isArray(files) ? ["array"] : [];

  if (proof) {
    logger.info("Complete order pipeline: upload parsed", {
      debugId: req.completeOrderDebugId,
      hasFiles: true,
      fileFieldNames,
      proofMeta: {
        originalname: proof.originalname,
        mimetype: proof.mimetype,
        size: proof.size,
        filename: proof.filename
      }
    });
  } else {
    logger.warn("Complete order pipeline: no proof file after multer", {
      debugId: req.completeOrderDebugId,
      hasFiles: Boolean(files),
      fileFieldNames,
      contentType: req.headers["content-type"]
    });
  }

  next();
}

module.exports = {
  logCompleteOrderEntry,
  logCompleteOrderAfterAuth,
  logCompleteOrderAfterUpload
};
