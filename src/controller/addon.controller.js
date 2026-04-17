const AddonCategory = require("../module/addonCategory.model");
const AddonItem = require("../module/addonItem.model");
const MenuItem = require("../module/menuItem.model");
const { resolveAccessibleHotel } = require("../utils/partnerAccess");


// CREATE ADDON CATEGORY
exports.createAddonCategory = async (req, res) => {
  try {
    const { name, isRequired, maxSelection, menuItem } = req.body;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const menuExists = await MenuItem.findOne({
      _id: menuItem,
      partner: selectedHotel._id,
    });

    if (!menuExists) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const category = await AddonCategory.create({
      name,
      isRequired,
      maxSelection,
      menuItem,
      partner: selectedHotel._id,
    });

    res.status(201).json({
      message: "Addon category created",
      data: category,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// CREATE ADDON ITEM
exports.createAddonItem = async (req, res) => {
  try {
    const { name, price, addonCategory } = req.body;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const categoryExists = await AddonCategory.findOne({
      _id: addonCategory,
      partner: selectedHotel._id,
    });

    if (!categoryExists) {
      return res.status(404).json({ message: "Addon category not found" });
    }

    const addon = await AddonItem.create({
      name,
      price,
      addonCategory,
      partner: selectedHotel._id,
    });

    res.status(201).json({
      message: "Addon item created",
      data: addon,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// GET ADDON CATEGORIES
exports.getAddonCategories = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const categories = await AddonCategory.find({
      partner: selectedHotel._id,
    }).populate("menuItem", "name");

    res.status(200).json({
      data: categories,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// GET ADDON ITEMS
exports.getAddonItems = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const items = await AddonItem.find({
      partner: selectedHotel._id,
    }).populate("addonCategory", "name");

    res.status(200).json({
      data: items,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// DELETE ADDON ITEM
exports.deleteAddonItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    await AddonItem.findOneAndDelete({
      _id: id,
      partner: selectedHotel._id,
    });

    res.json({ message: "Addon deleted" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
