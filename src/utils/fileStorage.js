const fs = require("fs");
const path = require("path");
const { uploadsDir } = require("../middlewares/upload.middleware");

const extractFilename = (value) => {
  if (!value || typeof value !== "string") return null;
  if (value.includes("/uploads/")) {
    return value.split("/uploads/").pop().split("?")[0];
  }
  return path.basename(value);
};

const deleteUploadedFile = (storedValue) => {
  const filename = extractFilename(storedValue);
  if (!filename) return false;

  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    console.error("Failed to delete file:", filePath, error.message);
    return false;
  }
};

module.exports = {
  extractFilename,
  deleteUploadedFile,
};
