const Banner = require("../../module/banner.model");

exports.createBanner = async (req, res) => {
  const banner = await Banner.create(req.body);
  res.json(banner);
};

exports.getBanners = async (req, res) => {
  res.json(await Banner.find());
};

exports.deleteBanner = async (req, res) => {
  await Banner.findByIdAndDelete(req.params.id);
  res.json({ message: "Banner deleted" });
};
