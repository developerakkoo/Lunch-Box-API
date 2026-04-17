const Category = require("../module/category.model");
const { resolveAccessibleHotel } = require("../utils/partnerAccess");


// CREATE CATEGORY
exports.createCategory = async (req, res) => {
  try {
    const { name, description, image } = req.body;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const category = await Category.create({
      name,
      description,
      image,
      partner: selectedHotel._id,
    });

    res.status(201).json({
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// GET ALL CATEGORIES (Partner Specific)
exports.getCategories = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const categories = await Category.find({
      partner: selectedHotel._id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      total: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// UPDATE CATEGORY
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const category = await Category.findOneAndUpdate(
      { _id: id, partner: selectedHotel._id },
      req.body,
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// DELETE CATEGORY
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const category = await Category.findOneAndDelete({
      _id: id,
      partner: selectedHotel._id,
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
