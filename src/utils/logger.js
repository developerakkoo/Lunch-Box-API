const formatMeta = (meta) => {
  if (meta === undefined || meta === null) return "";
  if (typeof meta === "string") return meta;
  try {
    return JSON.stringify(meta);
  } catch (error) {
    return String(meta);
  }
};

const log = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const suffix = meta !== undefined ? ` ${formatMeta(meta)}` : "";
  console.log(`[${timestamp}] [${level}] ${message}${suffix}`);
};

module.exports = {
  debug: (message, meta) => log("DEBUG", message, meta),
  info: (message, meta) => log("INFO", message, meta),
  warn: (message, meta) => log("WARN", message, meta),
  error: (message, meta) => log("ERROR", message, meta)
};
