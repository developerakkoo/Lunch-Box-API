const Category = require("../module/category.model");
const {
  isValidObjectId,
  resolveAccessibleHotel
} = require("../utils/partnerAccess");
const {
  getUploadedFileName,
  parsePossiblyJsonArray
} = require("../utils/media");

const getRequestedPartnerId = (req) =>
  req.body?.partnerId ||
  req.body?.hotelId ||
  req.query?.partnerId ||
  req.query?.hotelId ||
  req.params?.partnerId ||
  req.headers["x-hotel-id"];

const sanitizeCategoryPayload = (body = {}) => {
  const { partnerId, hotelId, ...payload } = body;

  return payload;
};

const resolveCategoryScope = async (req, { requirePartnerIdForAdmin = false } = {}) => {
  if (req.admin) {
    const partnerId = getRequestedPartnerId(req);

    if (partnerId && !isValidObjectId(partnerId)) {
      return {
        error: {
          status: 400,
          message: "Invalid partner id"
        }
      };
    }

    if (requirePartnerIdForAdmin && !partnerId) {
      return {
        error: {
          status: 400,
          message: "partnerId is required"
        }
      };
    }

    return {
      role: "admin",
      partnerId: partnerId || null
    };
  }

  const { selectedHotel, error } = await resolveAccessibleHotel(req);

  if (error) {
    return { error };
  }

  return {
    role: "partner",
    partnerId: selectedHotel._id,
    selectedHotel
  };
};


// CREATE CATEGORY
exports.createCategory = async (req, res) => {
  try {
    const { name, description, image } = req.body;
    let partnerId = null;
    const uploadedImage = getUploadedFileName(req.file);

    if (req.admin) {
      partnerId = null;
    } else {
      const { selectedHotel, error } = await resolveAccessibleHotel(req);

      if (error) {
        return res.status(error.status).json({ message: error.message });
      }

      partnerId = selectedHotel._id;
    }

    const category = await Category.create({
      name,
      description,
      image: uploadedImage || image,
      partner: partnerId,
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
    const { role, partnerId, error } = await resolveCategoryScope(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const query = role === "partner"
      ? {
          $or: [{ partner: partnerId }, { partner: null }]
        }
      : partnerId
        ? {
            $or: [{ partner: partnerId }, { partner: null }]
          }
        : {};

    const categories = await Category.find(query).sort({ createdAt: -1 });

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
    const { role, partnerId, error } = await resolveCategoryScope(req);
    const uploadedImage = getUploadedFileName(req.file);
    const updatePayload = sanitizeCategoryPayload(req.body);

    if (uploadedImage) {
      updatePayload.image = uploadedImage;
    }

    if (typeof updatePayload.image === "string") {
      const [firstImage] = parsePossiblyJsonArray(updatePayload.image);
      updatePayload.image = firstImage || updatePayload.image;
    }

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const filter = role === "partner"
      ? { _id: id, $or: [{ partner: partnerId }, { partner: null }] }
      : partnerId
        ? { _id: id, $or: [{ partner: partnerId }, { partner: null }] }
        : { _id: id };

    const category = await Category.findOneAndUpdate(
      filter,
      updatePayload,
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
    const { role, partnerId, error } = await resolveCategoryScope(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const filter = role === "partner"
      ? { _id: id, $or: [{ partner: partnerId }, { partner: null }] }
      : partnerId
        ? { _id: id, $or: [{ partner: partnerId }, { partner: null }] }
        : { _id: id };

    const category = await Category.findOneAndDelete({
      ...filter
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
