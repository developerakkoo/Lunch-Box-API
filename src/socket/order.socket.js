let io

/*
|--------------------------------------------------------------------------
| Initialize Socket Server
|--------------------------------------------------------------------------
*/
exports.initSocket = serverIO => {
  io = serverIO

  io.on('connection', socket => {
    console.log('🔌 New Socket Connected:', socket.id)

    /*
    |--------------------------------------------------------------------------
    | USER JOIN ROOM
    |--------------------------------------------------------------------------
    */
    socket.on('join-user', userId => {
      socket.join(`user_${userId}`)
      console.log(`👤 User Joined Room user_${userId}`)
    })

    /*
   

    /*
    |--------------------------------------------------------------------------
    | DISCONNECT
    |--------------------------------------------------------------------------
    */
    socket.on('disconnect', () => {
      console.log('❌ Socket Disconnected:', socket.id)
    })
  })
}

/*
|--------------------------------------------------------------------------
| Getter
|--------------------------------------------------------------------------
*/
exports.getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized!')
  }
  return io
}

/*
|--------------------------------------------------------------------------
| 🔥 ORDER EVENTS (ZOMATO STYLE)
|--------------------------------------------------------------------------
*/

// NEW ORDER → Notify Partner
exports.emitNewOrderToPartner = (partnerId, orderData) => {
  const socket = exports.getIO()
  socket.to(`partner_${partnerId}`).emit('new-order', orderData)
}

// ORDER ACCEPTED → Notify User
exports.emitOrderAcceptedToUser = (userId, orderData) => {
  const socket = exports.getIO()
  socket.to(`user_${userId}`).emit('order-accepted', orderData)
}

// ORDER REJECTED → Notify User
exports.emitOrderRejectedToUser = (userId, orderData) => {
  const socket = exports.getIO()
  socket.to(`user_${userId}`).emit('order-rejected', orderData)
}

// ORDER READY → Notify Delivery Agents
exports.emitOrderReadyToDelivery = orderData => {
  const socket = exports.getIO()
  socket.emit('order-ready', orderData)
}

// DELIVERY ASSIGNED → Notify Delivery Agent
exports.emitDeliveryAssigned = (deliveryId, orderData) => {
  const socket = exports.getIO()
  socket.to(`delivery_${deliveryId}`).emit('delivery-assigned', orderData)
}

// DELIVERY PICKED → Notify User + Partner
exports.emitOrderPicked = orderData => {
  const socket = exports.getIO()

  socket.to(`user_${orderData.user}`).emit('order-picked', orderData)
  socket.to(`partner_${orderData.partner}`).emit('order-picked', orderData)
}

// ORDER DELIVERED → Notify User + Partner
exports.emitOrderDelivered = orderData => {
  const socket = exports.getIO()

  socket.to(`user_${orderData.user}`).emit('order-delivered', orderData)
  socket.to(`partner_${orderData.partner}`).emit('order-delivered', orderData)
}
