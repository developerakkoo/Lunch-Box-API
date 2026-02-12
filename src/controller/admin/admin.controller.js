const Admin = require("../../module/admin.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Partner = require("../../module/partner.model");


exports.registerAdmin = async (req, res) => {
  try {

    const { name, email, password } = req.body;

    // Check duplicate admin
    const exists = await Admin.findOne({ email });

    if (exists) {
      return res.status(400).json({
        message: "Admin already exists"
      });
    }

    const admin = await Admin.create({
      name,
      email,
      password
    });

    res.status(201).json({
      message: "Admin registered successfully",
      adminId: admin._id
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginAdmin = async (req, res) => {
  try {

    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET
    );

    res.json({ token });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.getAllKitchens = async (req, res) => {
  res.json(await Partner.find());
};

exports.updateKitchenStatus = async (req, res) => {

  const kitchen = await Partner.findById(req.params.id);

  kitchen.isActive = !kitchen.isActive;

  await kitchen.save();

  res.json(kitchen);
};
