const AddonCategory = require("../module/addonCategory.model");
const AddonItem = require("../module/addonItem.model");
const MenuItem = require("../module/menuItem.model");


// CREATE ADDON CATEGORY
exports.createAddonCategory = async (req, res) => {
  try {
    const { name, isRequired, maxSelection, menuItem } = req.body;

    const menuExists = await MenuItem.findOne({
      _id: menuItem,
      partner: req.partner.id,
    });

    if (!menuExists) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const category = await AddonCategory.create({
      name,
      isRequired,
      maxSelection,
      menuItem,
      partner: req.partner.id,
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

    const categoryExists = await AddonCategory.findOne({
      _id: addonCategory,
      partner: req.partner.id,
    });

    if (!categoryExists) {
      return res.status(404).json({ message: "Addon category not found" });
    }

    const addon = await AddonItem.create({
      name,
      price,
      addonCategory,
      partner: req.partner.id,
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
    const categories = await AddonCategory.find({
      partner: req.partner.id,
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
    const items = await AddonItem.find({
      partner: req.partner.id,
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

    await AddonItem.findOneAndDelete({
      _id: id,
      partner: req.partner.id,
    });

    res.json({ message: "Addon deleted" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
