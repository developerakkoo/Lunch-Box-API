const Delivery = require("../module/Delivery_Agent");

exports.createDeliveryProfile = async (req, res) => {
  try {

    const delivery = await Delivery.create({
      userId: req.user.id,
      ...req.body
    });

    res.json(delivery);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
