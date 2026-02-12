const MenuItem = require("../module/menuItem.model");
const Category = require("../module/category.model");


// CREATE MENU ITEM
exports.createMenuItem = async (req, res) => {
  try {
    const { name, description, price, image, isVeg, category } = req.body;

    // Validate category belongs to partner
    const categoryExists = await Category.findOne({
      _id: category,
      partner: req.partner.id,
    });

    if (!categoryExists) {
      return res.status(404).json({ message: "Category not found" });
    }

    const menu = await MenuItem.create({
      name,
      description,
      price,
      image,
      isVeg,
      category,
      partner: req.partner.id,
    });

    res.status(201).json({
      message: "Menu item created successfully",
      data: menu,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// GET MENU ITEMS
exports.getMenuItems = async (req, res) => {
  try {
    const menuItems = await MenuItem.find({
      partner: req.partner.id,
    }).populate("category", "name");

    res.status(200).json({
      total: menuItems.length,
      data: menuItems,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// UPDATE MENU ITEM
exports.updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await MenuItem.findOneAndUpdate(
      { _id: id, partner: req.partner.id },
      req.body,
      { new: true }
    );

    if (!menu) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({
      message: "Menu item updated successfully",
      data: menu,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// DELETE MENU ITEM
exports.deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await MenuItem.findOneAndDelete({
      _id: id,
      partner: req.partner.id,
    });

    if (!menu) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    res.status(200).json({
      message: "Menu item deleted successfully",
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
