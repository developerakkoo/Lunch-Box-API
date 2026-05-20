const Banner = require("../../module/banner.model");
const { getUploadedFileName } = require("../../utils/media");
const { deleteUploadedFile } = require("../../utils/fileStorage");
const { emitCatalogUpdated } = require("../../utils/catalogEvents");

exports.createBanner = async (req, res) => {
  try {
    const banner = await Banner.create({
      ...req.body,
      image: getUploadedFileName(req.file) || req.body?.image,
    });
    emitCatalogUpdated("banner", "create");
    res.json(banner);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });
    res.json(banners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    const newImage = getUploadedFileName(req.file);
    if (newImage) {
      deleteUploadedFile(banner.image);
      banner.image = newImage;
    }

    if (req.body.title !== undefined) banner.title = req.body.title;
    if (req.body.redirectLink !== undefined) banner.redirectLink = req.body.redirectLink;
    if (req.body.isActive !== undefined) {
      banner.isActive = req.body.isActive === "true" || req.body.isActive === true;
    }

    await banner.save();
    emitCatalogUpdated("banner", "update");
    res.json(banner);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    deleteUploadedFile(banner.image);
    await Banner.findByIdAndDelete(req.params.id);
    emitCatalogUpdated("banner", "delete");
    res.json({ message: "Banner deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
