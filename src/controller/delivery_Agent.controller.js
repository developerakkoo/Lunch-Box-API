const DeliveryAgent = require('../module/Delivery_Agent')
const Order = require('../module/order.model')

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const {
  emitOrderPicked,
  emitOrderDelivered
} = require('../socket/order.socket')

exports.registerDriver = async (req, res) => {
  try {

    // 1️⃣ Create Driver Auth
    const driver = await Driver.create({
      fullName: req.body.fullName,
      email: req.body.email,
      password: req.body.password,
      mobileNumber: req.body.mobileNumber,
      address: req.body.address
    });

    // 2️⃣ Create DeliveryAgent Profile Automatically
    await DeliveryAgent.create({
      user: driver._id,
      fullName: req.body.fullName,
      mobileNumber: req.body.mobileNumber,
      vehicle: req.body.vehicle || {},
      documents: req.body.documents || {}
    });

    res.status(201).json({
      message: "Driver registered successfully"
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginDriver = async (req, res) => {
  try {
    const { email, password } = req.body

    const driver = await DeliveryAgent.findOne({ email })

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' })
    }

    const isMatch = await bcrypt.compare(password, driver.password)

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' })
    }

    const token = jwt.sign({ id: driver._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    })

    res.json({
      token,
      driver
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/*
|--------------------------------------------------------------------------
| CREATE DELIVERY PROFILE
|--------------------------------------------------------------------------
*/
exports.createDeliveryProfile = async (req, res) => {
  try {
    const exists = await DeliveryAgent.findOne({ user: req.driver.id })

    if (exists) {
      return res.status(400).json({ message: 'Profile already exists' })
    }

    const profile = await DeliveryAgent.create({
      user: req.driver.id,
      fullName: req.body.fullName,
      mobileNumber: req.body.mobileNumber,
      vehicle: req.body.vehicle,
      documents: req.body.documents
    })

    res.status(201).json(profile)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/*
|--------------------------------------------------------------------------
| TOGGLE ONLINE / OFFLINE
|--------------------------------------------------------------------------
*/
exports.toggleOnlineStatus = async (req, res) => {
  try {

    const agent = await DeliveryAgent.findOne({ user: req.driver.id });

    if (!agent) {
      return res.status(404).json({ message: "Agent profile not found" });
    }

    agent.isOnline = !agent.isOnline;

    if (agent.isOnline) {
      agent.shift.startedAt = new Date();
    } else {
      agent.shift.endedAt = new Date();
    }

    await agent.save();

    res.json(agent);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE LIVE LOCATION
|--------------------------------------------------------------------------
*/
exports.updateLiveLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body

    const agent = await DeliveryAgent.findOneAndUpdate(
      { user: req.driver.id },
      {
        liveLocation: {
          latitude,
          longitude,
          updatedAt: new Date()
        }
      },
      { new: true }
    )

    res.json(agent)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/*
|--------------------------------------------------------------------------
| ACCEPT ORDER
|--------------------------------------------------------------------------
*/
exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params

    const agent = await DeliveryAgent.findOne({  user: req.driver.id })

    if (!agent.isOnline) {
      return res.status(400).json({ message: 'Agent offline' })
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { deliveryAgent: agent._id },
      { new: true }
    )

    agent.currentOrder = order._id
    agent.isAvailable = false

    await agent.save()

    res.json(order)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/*
|--------------------------------------------------------------------------
| PICK ORDER
|--------------------------------------------------------------------------
*/
exports.pickOrder = async (req, res) => {
  try {
    const { orderId } = req.params

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: 'OUT_FOR_DELIVERY',
        'timeline.pickedAt': new Date()
      },
      { new: true }
    )

    emitOrderPicked(order)

    res.json(order)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/*
|--------------------------------------------------------------------------
| COMPLETE ORDER
|--------------------------------------------------------------------------
*/
exports.completeOrder = async (req, res) => {
  try {
    const { orderId } = req.params

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: 'DELIVERED',
        'timeline.deliveredAt': new Date()
      },
      { new: true }
    )

    const agent = await DeliveryAgent.findById(order.deliveryAgent)

    // Update earnings
    agent.earnings.today += 40
    agent.earnings.total += 40

    agent.currentOrder = null
    agent.isAvailable = true

    await agent.save()

    emitOrderDelivered(order)

    res.json(order)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/*
|--------------------------------------------------------------------------
| GET AGENT DASHBOARD
|--------------------------------------------------------------------------
*/
exports.getDashboard = async (req, res) => {
  try {
    const agent = await DeliveryAgent.findOne({ user: req.driver.id  })

    res.json({
      earnings: agent.earnings,
      isOnline: agent.isOnline,
      isAvailable: agent.isAvailable,
      currentOrder: agent.currentOrder
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
