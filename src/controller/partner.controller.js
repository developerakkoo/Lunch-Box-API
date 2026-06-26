const mongoose = require("mongoose");
const Partner = require("../module/partner.model");
const jwt = require("jsonwebtoken");
const Category = require("../module/category.model");
const MenuItem = require("../module/menuItem.model");
const AddonCategory = require("../module/addonCategory.model");
const AddonItem = require("../module/addonItem.model");
const Order = require("../module/order.model");
const UserSubscription = require("../module/userSubscription.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const PartnerNotification = require("../module/partnerNotification.model");
const { deleteUploadedFile } = require("../utils/fileStorage");
const { notifyPartner } = require("../utils/partnerNotification");
const {
  PARTNER_APPROVAL_STATUS,
  getApprovalGate,
  normalizeApprovalStatus
} = require("../utils/partnerApproval");
const { savePartnerBase64Document } = require("../utils/partnerDocuments.util");
const {
  getManagedHotels: fetchManagedHotels,
  getManagedHotelIds,
  resolveAccessibleHotel
} = require("../utils/partnerAccess");
const {
  setPartnerPresence
} = require("../utils/orderEvents");
const logger = require("../utils/logger");
// const Review = require("../module/review.model");

const ORDER_SEGMENT_STATUS_MAP = {
  new: ["PLACED"],
  ongoing: ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"],
  completed: ["DELIVERED"],
  cancelled: ["CANCELLED"]
};

/** Legacy query param `status` — NEW includes all pre-delivery active states (incl. OUT_FOR_DELIVERY). */
const LEGACY_ORDER_STATUS_MAP = {
  NEW: ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"],
  CANCELLED: ["CANCELLED"],
  COMPLETED: ["DELIVERED"]
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const PARTNER_TOKEN_SCOPE = {
  FULL: "FULL",
  VERIFICATION: "VERIFICATION"
};

const generateToken = (partner, scope = PARTNER_TOKEN_SCOPE.FULL) => {
  return jwt.sign(
    { id: partner._id, scope },
    process.env.ACCESS_SECRET,
    { expiresIn: "1d" }
  );
};

const buildDocumentSummary = (documents = {}) => ({
  panCard: Boolean(documents?.panCard?.url),
  gstCertificate: Boolean(documents?.gstCertificate?.url),
  fssaiLicense: Boolean(documents?.fssaiLicense?.url)
});

const PARTNER_DOCUMENT_FIELDS = ["panCard", "gstCertificate", "fssaiLicense"];

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0" || value == null) return false;
  return Boolean(value);
};

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const startOfDay = (date = new Date()) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (date = new Date()) => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildDocumentMeta = (file) => ({
  url: `/uploads/partner-documents/${file.filename}`,
  originalName: file.originalname || "",
  mimeType: file.mimetype || "",
  size: file.size || 0,
  uploadedAt: new Date()
});

const cleanupPartnerDocumentFiles = (files) => {
  if (!files) return;
  for (const file of files) {
    deleteUploadedFile(file?.filename || file?.path || file?.url);
  }
};

const getUploadedPartnerFiles = (req) => {
  const files = [];
  for (const field of PARTNER_DOCUMENT_FIELDS) {
    const fieldFiles = req.files?.[field] || [];
    for (const file of fieldFiles) {
      files.push({ ...file, fieldName: field });
    }
  }
  return files;
};



/* ================= REGISTER PARTNER ================= */

exports.registerPartner = async (req, res) => {
  try {
    logger.info("Partner register request received", { email: req.body?.email });

    const {
      kitchenName,
      ownerName,
      email,
      password,
      phone,
      address,
      latitude,
      longitude,
      gstApplicable,
      selfDelivery
    } = req.body || {};

    const normalizedEmail = normalizeText(email).toLowerCase();
    const normalizedKitchenName = normalizeText(kitchenName);
    const normalizedOwnerName = normalizeText(ownerName);
    const normalizedPhone = normalizeText(phone);
    const normalizedAddress = normalizeText(address);
    const resolvedGstApplicable = toBoolean(gstApplicable);
    const resolvedSelfDelivery = toBoolean(selfDelivery);
    const parsedLatitude = parseOptionalNumber(latitude);
    const parsedLongitude = parseOptionalNumber(longitude);
    const isJson = String(req.headers["content-type"] || "").includes("application/json");
    const uploadedFiles = isJson ? [] : getUploadedPartnerFiles(req);
    const fileMap = new Map(uploadedFiles.map((file) => [file.fieldName, file]));

    // Native (Capacitor) clients send documents as base64 JSON; web uses multipart.
    const hasDoc = (field) =>
      isJson ? Boolean(req.body?.[`${field}Base64`]) : fileMap.has(field);

    if (!normalizedKitchenName || !normalizedOwnerName || !normalizedEmail || !password) {
      cleanupPartnerDocumentFiles(uploadedFiles);
      return res.status(400).json({
        message: "kitchenName, ownerName, email and password are required"
      });
    }

    if (parsedLatitude === null || parsedLongitude === null) {
      cleanupPartnerDocumentFiles(uploadedFiles);
      return res.status(400).json({
        message: "latitude and longitude must be valid numbers when provided"
      });
    }

    if (!hasDoc("panCard") || !hasDoc("fssaiLicense")) {
      cleanupPartnerDocumentFiles(uploadedFiles);
      return res.status(400).json({
        message: "PAN Card and FSSAI License are required"
      });
    }

    if (resolvedGstApplicable && !hasDoc("gstCertificate")) {
      cleanupPartnerDocumentFiles(uploadedFiles);
      return res.status(400).json({
        message: "GST Certificate is required when gstApplicable is true"
      });
    }

    const existing = await Partner.findOne({
      email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i")
    });
    if (existing) {
      cleanupPartnerDocumentFiles(uploadedFiles);
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    const resolveDocumentMeta = (field) => {
      if (isJson) {
        if (!req.body?.[`${field}Base64`]) return null;
        return savePartnerBase64Document(
          req.body[`${field}Base64`],
          req.body?.[`${field}MimeType`],
          req.body?.[`${field}Name`]
        );
      }
      const file = fileMap.get(field);
      return file ? buildDocumentMeta(file) : null;
    };

    const documents = {
      panCard: resolveDocumentMeta("panCard"),
      fssaiLicense: resolveDocumentMeta("fssaiLicense")
    };

    const gstMeta = resolveDocumentMeta("gstCertificate");
    if (gstMeta) {
      documents.gstCertificate = gstMeta;
    }

    const partner = await Partner.create({
      kitchenName: normalizedKitchenName,
      ownerName: normalizedOwnerName,
      email: normalizedEmail,
      password,
      phone: normalizedPhone || undefined,
      address: normalizedAddress || undefined,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      gstApplicable: resolvedGstApplicable,
      selfDelivery: resolvedSelfDelivery,
      documents,
      approvalStatus: PARTNER_APPROVAL_STATUS.PENDING,
      status: "INACTIVE",
      isActive: false
    });

    try {
      await notifyPartner({
        partnerId: partner._id,
        type: "REGISTRATION_RECEIVED",
        title: "Registration received",
        message: "Your partner registration has been received and is awaiting admin approval.",
        data: {
          approvalStatus: PARTNER_APPROVAL_STATUS.PENDING
        }
      });
    } catch (notifyError) {
      logger.warn("Partner registration notification failed", { message: notifyError.message, partnerId: partner._id });
    }

    const partnerData = partner.toObject();
    delete partnerData.password;

    res.status(201).json({
      message: "Partner registered successfully",
      data: partnerData,
      hotels: [partnerData],
      approvalStatus: PARTNER_APPROVAL_STATUS.PENDING
    });

  } catch (error) {
    cleanupPartnerDocumentFiles(getUploadedPartnerFiles(req));
    res.status(500).json({ message: error.message });
  }
};



/* ================= LOGIN PARTNER ================= */

exports.loginPartner = async (req, res) => {
  try {
    logger.info("Partner login request received", { email: req.body?.email });

    const { email, password } = req.body || {};
    const normalizedEmail = normalizeText(email).toLowerCase();

    const partner = await Partner.findOne({
      email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i")
    });

    if (!partner) {
      return res.status(400).json({
        message: "Invalid email"
      });
    }

    const isMatch = await partner.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    const approvalGate = getApprovalGate(partner);
    const partnerData = partner.toObject();
    delete partnerData.password;

    // Pending/rejected partners receive a limited-scope token so they can reach
    // the verification screen, refresh status, and re-upload documents.
    if (!approvalGate.allowed) {
      const token = generateToken(partner, PARTNER_TOKEN_SCOPE.VERIFICATION);
      return res.json({
        message: approvalGate.message,
        code: approvalGate.code,
        token,
        scope: PARTNER_TOKEN_SCOPE.VERIFICATION,
        approvalStatus: approvalGate.approvalStatus,
        rejectionReason: approvalGate.rejectionReason || "",
        documents: buildDocumentSummary(partner.documents),
        partner: partnerData,
        hotels: []
      });
    }

    const token = generateToken(partner, PARTNER_TOKEN_SCOPE.FULL);
    const { hotels } = await fetchManagedHotels(partner._id);

    res.json({
      message: "Login successful",
      token,
      scope: PARTNER_TOKEN_SCOPE.FULL,
      approvalStatus: approvalGate.approvalStatus,
      partner: partnerData,
      hotels
    });

  } catch (error) {
    logger.error("Partner login failed", { message: error.message });
    res.status(500).json({ message: error.message });
  }
};

/* ================= VERIFICATION STATUS ================= */

exports.getVerificationStatus = async (req, res) => {
  try {
    const partnerId = req.partner?.id || req.partnerAccount?._id;
    const partner = await Partner.findById(partnerId).select(
      "kitchenName ownerName email phone approvalStatus rejectionReason reviewedAt documents createdAt"
    );

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const approvalGate = getApprovalGate(partner);
    const payload = {
      message: "Verification status fetched successfully",
      approvalStatus: approvalGate.approvalStatus,
      rejectionReason: approvalGate.rejectionReason || "",
      documents: buildDocumentSummary(partner.documents),
      reviewedAt: partner.reviewedAt || null,
      partner: {
        _id: partner._id,
        kitchenName: partner.kitchenName,
        ownerName: partner.ownerName,
        email: partner.email,
        phone: partner.phone
      }
    };

    // Once approved, hand back a full-access token + hotels so the app can
    // proceed straight into the dashboard on refresh (no re-login needed).
    if (approvalGate.allowed) {
      const token = generateToken(partner, PARTNER_TOKEN_SCOPE.FULL);
      const { hotels } = await fetchManagedHotels(partner._id);
      payload.token = token;
      payload.scope = PARTNER_TOKEN_SCOPE.FULL;
      payload.hotels = hotels;
    }

    return res.status(200).json(payload);
  } catch (error) {
    logger.error("Partner verification status failed", { message: error.message });
    return res.status(500).json({ message: error.message });
  }
};

/* ================= RESUBMIT DOCUMENTS ================= */

exports.resubmitPartnerDocuments = async (req, res) => {
  let uploadedFiles = [];
  try {
    const partnerId = req.partner?.id || req.partnerAccount?._id;
    const partner = await Partner.findById(partnerId);

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const currentStatus = normalizeApprovalStatus(partner.approvalStatus);
    if (currentStatus === PARTNER_APPROVAL_STATUS.APPROVED) {
      return res.status(409).json({
        message: "Approved partners cannot resubmit documents"
      });
    }

    const isJson = String(req.headers["content-type"] || "").includes("application/json");
    const updates = {};

    if (isJson) {
      for (const field of PARTNER_DOCUMENT_FIELDS) {
        const base64 = req.body?.[`${field}Base64`];
        if (!base64) continue;
        const meta = savePartnerBase64Document(
          base64,
          req.body?.[`${field}MimeType`],
          req.body?.[`${field}Name`]
        );
        updates[field] = meta;
      }
    } else {
      uploadedFiles = getUploadedPartnerFiles(req);
      for (const file of uploadedFiles) {
        updates[file.fieldName] = buildDocumentMeta(file);
      }
    }

    if (Object.keys(updates).length === 0) {
      cleanupPartnerDocumentFiles(uploadedFiles);
      return res.status(400).json({
        message: "At least one document is required (panCard, fssaiLicense or gstCertificate)"
      });
    }

    partner.documents = partner.documents || {};
    for (const [field, meta] of Object.entries(updates)) {
      partner.documents[field] = meta;
    }

    partner.approvalStatus = PARTNER_APPROVAL_STATUS.PENDING;
    partner.rejectionReason = "";
    partner.reviewedAt = null;
    partner.reviewedBy = null;
    partner.markModified("documents");
    await partner.save();

    try {
      await notifyPartner({
        partnerId: partner._id,
        type: "DOCUMENTS_RESUBMITTED",
        title: "Documents resubmitted",
        message: "Your updated documents have been submitted and are awaiting admin review.",
        data: { approvalStatus: PARTNER_APPROVAL_STATUS.PENDING }
      });
    } catch (notifyError) {
      logger.warn("Partner document resubmission notification failed", {
        message: notifyError.message,
        partnerId: partner._id
      });
    }

    return res.status(200).json({
      message: "Documents resubmitted successfully",
      approvalStatus: PARTNER_APPROVAL_STATUS.PENDING,
      documents: buildDocumentSummary(partner.documents)
    });
  } catch (error) {
    cleanupPartnerDocumentFiles(uploadedFiles);
    logger.error("Partner document resubmission failed", { message: error.message });
    return res.status(error.statusCode || 500).json({
      message: error.message,
      code: error.code
    });
  }
};


exports.getDashboardStats = async (req, res) => {

  try {
    logger.debug("Partner dashboard request received", { partnerId: req.user?.id || req.partner?.id });

    const { selectedHotel, hotels, error } = await resolveAccessibleHotel(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const partnerId = selectedHotel._id;
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const liveAlertTypes = ["NEW_ORDER", "ORDER_CANCELLED", "ORDER_UPDATED", "SUBSCRIPTION_ORDER"];

    /* ---------- BASIC COUNTS ---------- */

    const [
      totalCategories,
      totalMenuItems,
      totalAddonCategories,
      totalAddonItems,
      totalNewOrders,
      totalCompletedOrders,
      totalCancelledOrders,
      todayNewOrders,
      todayCompletedOrders,
      todayCancelledOrders,
      todaySales,
      menuItems,
      topSellingItemsRaw,
      liveOrderAlerts,
      unreadLiveAlertCount
    ] = await Promise.all([

      Category.countDocuments({ $or: [{ partner: partnerId }, { partner: null }] }),

      MenuItem.countDocuments({ partner: partnerId }),

      AddonCategory.countDocuments({ partner: partnerId }),

      AddonItem.countDocuments({ partner: partnerId }),

      Order.countDocuments({
        partner: partnerId,
        status: "PLACED"
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "DELIVERED"
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "CANCELLED"
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "PLACED",
        "timeline.placedAt": { $gte: todayStart, $lte: todayEnd }
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "DELIVERED",
        "timeline.deliveredAt": { $gte: todayStart, $lte: todayEnd }
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "CANCELLED",
        "timeline.cancelledAt": { $gte: todayStart, $lte: todayEnd }
      }),

      Order.aggregate([
        {
          $match: {
            partner: partnerId,
            status: "DELIVERED",
            "timeline.deliveredAt": { $gte: todayStart, $lte: todayEnd }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$priceDetails.totalAmount" }
          }
        }
      ]),

      MenuItem.find({ partner: partnerId })
        .select("name images isAvailable stockQuantity lowStockThreshold category")
        .populate("category", "name")
        .lean(),

      Order.aggregate([
        {
          $match: {
            partner: partnerId,
            status: "DELIVERED"
          }
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.menuItem",
            name: { $first: "$items.name" },
            totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
            totalRevenue: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$items.price", 0] },
                  { $ifNull: ["$items.quantity", 0] }
                ]
              }
            }
          }
        },
        { $sort: { totalQuantity: -1, totalRevenue: -1 } },
        { $limit: 5 }
      ]),

      PartnerNotification.find({
        partnerId,
        type: { $in: liveAlertTypes }
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      PartnerNotification.countDocuments({
        partnerId,
        type: { $in: liveAlertTypes },
        isRead: false
      })

    ]);


    /* ---------- TOTAL SALES ---------- */

    const totalSales = await Order.aggregate([
      {
        $match: {
          partner: partnerId,
          status: "DELIVERED"
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$priceDetails.totalAmount" }
        }
      }
    ]);


    /* ---------- BAR CHART SALES (LAST 7 DAYS) ---------- */

    const salesChart = await Order.aggregate([
      {
        $match: {
          partner: partnerId,
          status: "DELIVERED",
          createdAt: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          totalSales: { $sum: "$priceDetails.totalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);


    // /* ---------- RATINGS ---------- */

    // const ratings = await Review.aggregate([
    //   { $match: { partnerId } },
    //   {
    //     $group: {
    //       _id: null,
    //       avgRating: { $avg: "$rating" },
    //       totalReviews: { $sum: 1 }
    //     }
    //   }
    // ]);


    const ratingStats = await Order.aggregate([
      {
        $match: {
          partner: partnerId,
          "rating.partnerRating": { $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.partnerRating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const menuItemMap = new Map(menuItems.map((item) => [String(item._id), item]));
    const topSellingItems = topSellingItemsRaw.map((item) => {
      const menuItem = menuItemMap.get(String(item._id));
      return {
        menuItemId: item._id,
        name: menuItem?.name || item.name || "Unknown item",
        category: menuItem?.category || null,
        image: menuItem?.images?.[0] || null,
        isAvailable: menuItem?.isAvailable ?? true,
        stockQuantity: menuItem?.stockQuantity ?? null,
        lowStockThreshold: menuItem?.lowStockThreshold ?? 5,
        totalQuantity: item.totalQuantity || 0,
        totalRevenue: item.totalRevenue || 0
      };
    });

    const inventoryAlerts = menuItems.reduce(
      (acc, item) => {
        const stockQuantity = item.stockQuantity;
        const threshold = Number.isFinite(item.lowStockThreshold) ? item.lowStockThreshold : 5;
        const hasNumericStock = Number.isFinite(stockQuantity);

        if (hasNumericStock && stockQuantity === 0) {
          acc.outOfStockItems.push({
            _id: item._id,
            name: item.name,
            category: item.category,
            isAvailable: item.isAvailable,
            stockQuantity,
            lowStockThreshold: threshold
          });
        } else if (hasNumericStock && stockQuantity > 0 && stockQuantity <= threshold) {
          acc.lowStockItems.push({
            _id: item._id,
            name: item.name,
            category: item.category,
            isAvailable: item.isAvailable,
            stockQuantity,
            lowStockThreshold: threshold
          });
        } else if (!hasNumericStock && item.isAvailable === false) {
          acc.outOfStockItems.push({
            _id: item._id,
            name: item.name,
            category: item.category,
            isAvailable: item.isAvailable,
            stockQuantity: null,
            lowStockThreshold: threshold
          });
        }

        return acc;
      },
      { lowStockItems: [], outOfStockItems: [] }
    );

    res.json({
      hotel: selectedHotel,
      hotels,
      totalCategories,
      totalMenuItems,
      totalAddonCategories,
      totalAddonItems,
      totalNewOrders,
      totalCompletedOrders,
      totalCancelledOrders,
      todaySummary: {
        newOrders: todayNewOrders,
        completedOrders: todayCompletedOrders,
        cancelledOrders: todayCancelledOrders,
        totalSales: todaySales[0]?.total || 0
      },
      totalSales: totalSales[0]?.total || 0,
      salesChart,
      topSellingItems,
      inventoryAlerts: {
        totalLowStockItems: inventoryAlerts.lowStockItems.length,
        totalOutOfStockItems: inventoryAlerts.outOfStockItems.length,
        lowStockItems: inventoryAlerts.lowStockItems,
        outOfStockItems: inventoryAlerts.outOfStockItems
      },
      liveOrderAlerts,
      unreadLiveAlertCount,
      averageRating: Number((ratingStats[0]?.averageRating || 0).toFixed(2)),
      totalReviews: ratingStats[0]?.totalReviews || 0
    });

  } catch (error) {
    logger.error("Partner dashboard failed", { message: error.message });
    res.status(500).json({ message: error.message });
  }
};

exports.getOrdersByStatus = async (req, res) => {
  try {
    logger.debug("Partner orders request received", {
      partnerId: req.user?.id || req.partner?.id,
      segment: req.query?.segment,
      status: req.query?.status
    });

    const { selectedHotel, hotels, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const partnerId = selectedHotel._id;
    const segmentRaw = typeof req.query.segment === "string" ? req.query.segment.toLowerCase().trim() : "";
    const legacyStatus = typeof req.query.status === "string" ? req.query.status.toUpperCase().trim() : "";

    let mappedStatuses;
    let sortSpec;

    if (segmentRaw && ORDER_SEGMENT_STATUS_MAP[segmentRaw]) {
      mappedStatuses = ORDER_SEGMENT_STATUS_MAP[segmentRaw];
      sortSpec =
        segmentRaw === "completed"
          ? { "timeline.deliveredAt": -1, updatedAt: -1 }
          : { createdAt: -1 };
    } else if (legacyStatus && LEGACY_ORDER_STATUS_MAP[legacyStatus]) {
      mappedStatuses = LEGACY_ORDER_STATUS_MAP[legacyStatus];
      sortSpec = { createdAt: -1 };
    } else if (segmentRaw) {
      return res.status(400).json({
        message: "Invalid segment. Use new, ongoing, completed, or cancelled (or legacy status NEW, COMPLETED, CANCELLED)."
      });
    } else {
      mappedStatuses = ORDER_SEGMENT_STATUS_MAP.new;
      sortSpec = { createdAt: -1 };
    }

    const pageNumber = Math.max(Number(req.query.page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const baseQuery = {
      partner: partnerId,
      status: { $in: mappedStatuses }
    };

    const [orders, total] = await Promise.all([
      Order.find(baseQuery)
        .populate("user", "fullName mobileNumber")
        .populate("deliveryAgent", "fullName mobileNumber")
        .populate("items.menuItem", "name price image")
        .sort(sortSpec)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      Order.countDocuments(baseQuery)
    ]);

    return res.status(200).json({
      message: "Orders fetched successfully",
      hotel: selectedHotel,
      hotels,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      data: orders
    });
  } catch (error) {
    logger.error("Partner orders fetch failed", { message: error.message });
    res.status(500).json({ message: error.message });
  }
};

exports.getKitchenOrdersSummary = async (req, res) => {
  try {
    const { selectedHotel, hotels, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const partnerId = selectedHotel._id;
    const [newCount, ongoingCount, completedCount, cancelledCount] = await Promise.all([
      Order.countDocuments({ partner: partnerId, status: { $in: ORDER_SEGMENT_STATUS_MAP.new } }),
      Order.countDocuments({ partner: partnerId, status: { $in: ORDER_SEGMENT_STATUS_MAP.ongoing } }),
      Order.countDocuments({ partner: partnerId, status: { $in: ORDER_SEGMENT_STATUS_MAP.completed } }),
      Order.countDocuments({ partner: partnerId, status: { $in: ORDER_SEGMENT_STATUS_MAP.cancelled } })
    ]);

    return res.status(200).json({
      message: "Order counts fetched successfully",
      hotel: selectedHotel,
      hotels,
      counts: {
        new: newCount,
        ongoing: ongoingCount,
        completed: completedCount,
        cancelled: cancelledCount
      }
    });
  } catch (error) {
    logger.error("Partner orders summary failed", { message: error.message });
    res.status(500).json({ message: error.message });
  }
};

exports.getPartnerOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const { hotelIds } = await getManagedHotelIds(req.partner.id);
    const order = await Order.findOne({
      _id: orderId,
      partner: { $in: hotelIds }
    })
      .populate("user", "fullName mobileNumber")
      .populate("deliveryAgent", "fullName mobileNumber")
      .populate("items.menuItem", "name price image description");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({
      message: "Order fetched successfully",
      data: order
    });
  } catch (error) {
    logger.error("Partner order detail failed", { message: error.message });
    res.status(500).json({ message: error.message });
  }
};

exports.updateKitchenStatus = async (req, res) => {
  try {
    logger.info("Partner kitchen status update request", { partnerId: req.user?.id || req.partner?.id, status: req.body?.status });
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const { status } = req.body;

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Use ACTIVE or INACTIVE"
      });
    }

    const partner = await Partner.findById(selectedHotel._id);

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    partner.status = status;
    partner.isActive = status === "ACTIVE";

    await partner.save();
    await setPartnerPresence(partner._id, {
      status: partner.status,
      isActive: partner.isActive
    });

    res.json({
      message: "Kitchen status updated successfully",
      status: partner.status
    });

  } catch (error) {
    logger.error("Partner kitchen status update failed", { message: error.message });
    res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptionOrdersByStatus = async (req, res) => {
  try {
    const { selectedHotel, hotels, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const partnerId = selectedHotel._id;
    const { status = "NEW", page = 1, limit = 20 } = req.query;

    const statusMap = {
      NEW: ["PENDING"],
      CANCELLED: ["CANCELLED"],
      COMPLETED: ["DELIVERED"]
    };
    const mappedStatuses = statusMap[status] || [status];

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const subscriptions = await UserSubscription.find({ partnerId, status: "ACTIVE" })
      .select("_id")
      .lean();

    const subscriptionIds = subscriptions.map((sub) => sub._id);

    const [deliveries, total] = await Promise.all([
      SubscriptionDelivery.find({
        userSubscriptionId: { $in: subscriptionIds },
        status: { $in: mappedStatuses }
      })
        .populate({
          path: "userSubscriptionId",
          populate: [
            { path: "userId", select: "fullName mobileNumber" },
            { path: "menuItemId", select: "name image price" },
            { path: "partnerId", select: "kitchenName" }
          ]
        })
        .sort({ deliveryDate: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      SubscriptionDelivery.countDocuments({
        userSubscriptionId: { $in: subscriptionIds },
        status: { $in: mappedStatuses }
      })
    ]);

    return res.status(200).json({
      message: "Subscription orders fetched successfully",
      hotel: selectedHotel,
      hotels,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      data: deliveries
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getPartnerProfile = async (req, res) => {
  try {
    const { selectedHotel, hotels, ownerPartnerId, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const partner = await Partner.findById(selectedHotel._id).select(
      "ownerPartner kitchenName ownerName email phone address latitude longitude isActive status approvalStatus rejectionReason reviewedAt documents createdAt updatedAt"
    );

    const owner = await Partner.findById(ownerPartnerId).select(
      "kitchenName ownerName email phone address latitude longitude isActive status"
    );

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    return res.status(200).json({
      message: "Profile fetched successfully",
      owner,
      selectedHotel: partner,
      hotels
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updatePartnerProfile = async (req, res) => {
  try {
    const {
      kitchenName,
      ownerName,
      phone,
      address,
      latitude,
      longitude
    } = req.body || {};

    const updatePayload = {};
    if (kitchenName !== undefined) updatePayload.kitchenName = kitchenName;
    if (ownerName !== undefined) updatePayload.ownerName = ownerName;
    if (phone !== undefined) updatePayload.phone = phone;
    if (address !== undefined) updatePayload.address = address;
    if (latitude !== undefined) updatePayload.latitude = latitude;
    if (longitude !== undefined) updatePayload.longitude = longitude;

    const { selectedHotel, hotels, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const partner = await Partner.findByIdAndUpdate(
      selectedHotel._id,
      { $set: updatePayload },
      { new: true }
    ).select("kitchenName ownerName email phone address latitude longitude isActive status");

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      data: partner,
      hotels
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getDeliveryContactForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { hotelIds } = await getManagedHotelIds(req.partner.id);

    const order = await Order.findOne({
      _id: orderId,
      partner: { $in: hotelIds }
    }).populate("deliveryAgent", "fullName mobileNumber");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!order.deliveryAgent) {
      return res.status(404).json({ message: "Delivery agent not assigned yet" });
    }

    return res.status(200).json({
      message: "Delivery contact fetched successfully",
      data: {
        orderId: order._id,
        deliveryAgentId: order.deliveryAgent._id,
        fullName: order.deliveryAgent.fullName,
        mobileNumber: order.deliveryAgent.mobileNumber,
        dialUrl: `tel:${order.deliveryAgent.mobileNumber}`
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getPartnerNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { hotelIds } = await getManagedHotelIds(req.partner.id);
    const requestedHotelId = req.query.hotelId;

    if (requestedHotelId && !hotelIds.includes(String(requestedHotelId))) {
      return res.status(403).json({ message: "You do not have access to this hotel" });
    }

    const notificationFilter = {
      partnerId: requestedHotelId ? requestedHotelId : { $in: hotelIds }
    };
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const [notifications, total, unreadCount] = await Promise.all([
      PartnerNotification.find(notificationFilter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      PartnerNotification.countDocuments(notificationFilter),
      PartnerNotification.countDocuments({ ...notificationFilter, isRead: false })
    ]);

    return res.status(200).json({
      message: "Notifications fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      unreadCount,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { hotelIds } = await getManagedHotelIds(req.partner.id);
    const notification = await PartnerNotification.findOneAndUpdate(
      { _id: notificationId, partnerId: { $in: hotelIds } },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      data: notification
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const { hotelIds } = await getManagedHotelIds(req.partner.id);
    const requestedHotelId = req.query.hotelId;

    if (requestedHotelId && !hotelIds.includes(String(requestedHotelId))) {
      return res.status(403).json({ message: "You do not have access to this hotel" });
    }

    await PartnerNotification.updateMany(
      requestedHotelId
        ? { partnerId: requestedHotelId, isRead: false }
        : { partnerId: { $in: hotelIds }, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      message: "All notifications marked as read"
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createHotel = async (req, res) => {
  try {
    const {
      kitchenName,
      ownerName,
      phone,
      address,
      latitude,
      longitude
    } = req.body || {};

    if (!kitchenName) {
      return res.status(400).json({ message: "kitchenName is required" });
    }

    const owner = await Partner.findById(req.partner.id).select("ownerName selfDelivery");

    if (!owner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    const hotel = await Partner.create({
      ownerPartner: req.partner.id,
      kitchenName,
      ownerName: ownerName || owner.ownerName,
      phone,
      address,
      latitude,
      longitude,
      approvalStatus: PARTNER_APPROVAL_STATUS.APPROVED,
      status: "ACTIVE",
      isActive: true,
      selfDelivery: owner?.selfDelivery === true
    });

    const hotelData = hotel.toObject();
    delete hotelData.password;

    const { hotels } = await fetchManagedHotels(req.partner.id);

    return res.status(201).json({
      message: "Hotel created successfully",
      data: hotelData,
      hotels
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getManagedHotels = async (req, res) => {
  try {
    const { ownerPartnerId, hotels } = await fetchManagedHotels(req.partner.id);
    const owner = await Partner.findById(ownerPartnerId).select(
      "kitchenName ownerName email phone"
    );

    return res.status(200).json({
      message: "Hotels fetched successfully",
      owner,
      data: hotels
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
