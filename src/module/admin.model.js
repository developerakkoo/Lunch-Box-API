const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminSchema = new mongoose.Schema(
{
  name: String,
  email: {
    type: String,
    unique: true
  },
  password: String,

  role: {
    type: String,
    enum: ["SUPER_ADMIN", "SUB_ADMIN"],
    default: "SUPER_ADMIN"
  },

  isActive: {
    type: Boolean,
    default: true
  }
},
{ timestamps: true }
);


// Password Hash
adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model("Admin", adminSchema);
