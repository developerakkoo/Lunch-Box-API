const mongoose = require("mongoose");
const Partner = require("../module/partner.model");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const getOwnerPartnerId = async (actorPartnerId) => {
  if (!isValidObjectId(actorPartnerId)) return null;

  const actor = await Partner.findById(actorPartnerId).select("_id ownerPartner");
  if (!actor) return null;

  return String(actor.ownerPartner || actor._id);
};

const getManagedHotels = async (actorPartnerId) => {
  const ownerPartnerId = await getOwnerPartnerId(actorPartnerId);

  if (!ownerPartnerId) {
    return {
      ownerPartnerId: null,
      hotels: []
    };
  }

  const hotels = await Partner.find({
    $or: [{ _id: ownerPartnerId }, { ownerPartner: ownerPartnerId }]
  }).sort({ createdAt: 1 });

  return {
    ownerPartnerId,
    hotels
  };
};

const getManagedHotelIds = async (actorPartnerId) => {
  const { ownerPartnerId, hotels } = await getManagedHotels(actorPartnerId);

  return {
    ownerPartnerId,
    hotelIds: hotels.map((hotel) => String(hotel._id))
  };
};

const getRequestedHotelId = (req) =>
  req.query?.hotelId ||
  req.body?.hotelId ||
  req.params?.hotelId ||
  req.headers["x-hotel-id"];

const resolveAccessibleHotel = async (req, options = {}) => {
  const { required = false } = options;
  const actorPartnerId = req?.partner?.id;
  const requestedHotelId = getRequestedHotelId(req);
  const { ownerPartnerId, hotels } = await getManagedHotels(actorPartnerId);

  if (!hotels.length) {
    return {
      error: {
        status: 404,
        message: "Partner not found"
      }
    };
  }

  const selectedHotel =
    requestedHotelId
      ? hotels.find((hotel) => String(hotel._id) === String(requestedHotelId))
      : hotels[0];

  if (requestedHotelId && !selectedHotel) {
    return {
      error: {
        status: 403,
        message: "You do not have access to this hotel"
      }
    };
  }

  if (required && !selectedHotel) {
    return {
      error: {
        status: 400,
        message: "hotelId is required"
      }
    };
  }

  return {
    ownerPartnerId,
    hotels,
    selectedHotel
  };
};

module.exports = {
  isValidObjectId,
  getOwnerPartnerId,
  getManagedHotels,
  getManagedHotelIds,
  resolveAccessibleHotel
};
