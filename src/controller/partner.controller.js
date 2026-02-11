const Partner = require("../module/partner.model");

exports.createPartner = async (req, res) => {
  try {

    const partner = await Partner.create({
      userId: req.user.id,
      ...req.body
    });

    res.json(partner);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
