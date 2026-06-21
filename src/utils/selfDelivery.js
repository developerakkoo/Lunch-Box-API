const isSelfDeliveryOrder = (order) => order?.selfDelivery === true;

module.exports = {
  isSelfDeliveryOrder,
};
