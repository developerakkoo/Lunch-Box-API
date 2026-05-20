const { getIO } = require("../socket/socket");

const emitCatalogUpdated = (type, action) => {
  try {
    const io = getIO();
    io.emit("catalog_updated", { type, action, at: new Date().toISOString() });
  } catch (error) {
    console.warn("catalog_updated emit skipped:", error.message);
  }
};

module.exports = { emitCatalogUpdated };
