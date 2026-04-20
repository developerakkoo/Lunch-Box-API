const Banner = require("../../module/banner.model");
const { getUploadedFileName } = require("../../utils/media");

exports.createBanner = async (req, res) => {
  const banner = await Banner.create({
    ...req.body,
    image: getUploadedFileName(req.file) || req.body?.image
  });

  res.json(banner);
};

exports.getBanners = async (req, res) => {
  res.json(await Banner.find());
};

exports.deleteBanner = async (req, res) => {
  await Banner.findByIdAndDelete(req.params.id);
  res.json({ message: "Banner deleted" });
};
