const MenuItem = require('../module/menuItem.model')
const Category = require('../module/category.model')
const {
  resolveAccessibleHotel
} = require("../utils/partnerAccess");

// CREATE MENU ITEM
exports.createMenuItem = async (req, res) => {
  try {
    const { name, description, price, discountPrice, images, isVeg, category } =
      req.body
    const { selectedHotel, error } = await resolveAccessibleHotel(req)

    if (error) {
      return res.status(error.status).json({ message: error.message })
    }

    const categoryExists = await Category.findById(category)

    if (!categoryExists) {
      return res.status(404).json({ message: 'Category not found' })
    }

    const categoryOwner = categoryExists.partner;
    const selectedHotelId = String(selectedHotel._id);

    if (categoryOwner && String(categoryOwner) !== selectedHotelId) {
      return res.status(403).json({
        message: 'Category does not belong to the selected hotel'
      })
    }

    const menu = await MenuItem.create({
      name,
      description,
      price,
      discountPrice,
      images,
      isVeg,
      category,
      partner: selectedHotel._id
    })

    res.status(201).json({
      message: 'Menu item created successfully',
      data: menu
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.bulkCreateMenuItems = async (req, res) => {
  try {
    const { items } = req.body
    const { selectedHotel, error } = await resolveAccessibleHotel(req)

    if (error) {
      return res.status(error.status).json({ message: error.message })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' })
    }

    // Get all unique category IDs
    const categoryIds = [...new Set(items.map(item => item.category))]

    // Validate categories
    const categories = await Category.find({
      _id: { $in: categoryIds }
    })

    if (categories.length !== categoryIds.length) {
      return res.status(400).json({
        message: 'Some categories are invalid'
      })
    }

    const invalidCategory = categories.find(
      (item) => item.partner && String(item.partner) !== String(selectedHotel._id)
    )

    if (invalidCategory) {
      return res.status(403).json({
        message: 'One or more categories do not belong to the selected hotel'
      })
    }

    // Prepare data
    const menuItems = items.map(item => ({
      name: item.name,
      description: item.description || '',
      price: item.price,
      discountPrice: item.discountPrice || 0,
      images: item.images || '',
      isVeg: item.isVeg ?? true,
      category: item.category,
      partner: selectedHotel._id
    }))

    const result = await MenuItem.insertMany(menuItems)

    res.status(201).json({
      message: 'Bulk menu items created successfully',
      count: result.length,
      data: result
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// GET MENU ITEMS
exports.getMenuItems = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req)

    if (error) {
      return res.status(error.status).json({ message: error.message })
    }

    const menuItems = await MenuItem.find({
      partner: selectedHotel._id
    }).populate('category', 'name')

    res.status(200).json({
      total: menuItems.length,
      data: menuItems
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// UPDATE MENU ITEM
exports.updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params
    const { selectedHotel, error } = await resolveAccessibleHotel(req)

    if (error) {
      return res.status(error.status).json({ message: error.message })
    }

    const menu = await MenuItem.findOneAndUpdate(
      { _id: id, partner: selectedHotel._id },
      req.body,
      { new: true }
    )

    if (!menu) {
      return res.status(404).json({ message: 'Menu item not found' })
    }

    res.status(200).json({
      message: 'Menu item updated successfully',
      data: menu
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// DELETE MENU ITEM
exports.deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params
    const { selectedHotel, error } = await resolveAccessibleHotel(req)

    if (error) {
      return res.status(error.status).json({ message: error.message })
    }

    const menu = await MenuItem.findOneAndDelete({
      _id: id,
      partner: selectedHotel._id
    })

    if (!menu) {
      return res.status(404).json({ message: 'Menu item not found' })
    }

    res.status(200).json({
      message: 'Menu item deleted successfully'
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// TOGGLE MENU ITEM STATUS
exports.toggleMenuItemStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { selectedHotel, error } = await resolveAccessibleHotel(req)

    if (error) {
      return res.status(error.status).json({ message: error.message })
    }

    const menu = await MenuItem.findOne({
      _id: id,
      partner: selectedHotel._id
    })

    if (!menu) {
      return res.status(404).json({ message: 'Menu item not found' })
    }

    menu.isAvailable = !menu.isAvailable
    await menu.save()

    return res.status(200).json({
      message: 'Menu item status updated successfully',
      data: {
        _id: menu._id,
        isAvailable: menu.isAvailable
      }
    })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}
