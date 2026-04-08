import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    office_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      required: true,
    },
    name: {
      first_name: {
        type: String,
        required: true,
      },
      last_name: {
        type: String,
        required: true,
      }
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"]
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    socketId: {
      type: String
    },
    contact: {
      type: String,
      required: true,
      match: [/^\d{10}$/, "not a valid number"]
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "OFFICE_ADMIN", "EMPLOYEE", "DRIVER"],
      required: true
    },
    lastLogin: Date,
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    home_address: {
      addr: String,
      pos: [Number], // [lat, lng]
    },
    office_address: {
      addr: String,
      pos: [Number], // [lat, lng]
    },
    recent_locations: [{
      addr: String,
      pos: [Number],
      last_used: { type: Date, default: Date.now }
    }],
    saved_locations: [{
      name: String,
      addr: String,
      pos: [Number]
    }]
  },
  {
    timestamps: true
  }
);

userSchema.methods.generateAuthToken = function() {
  const token = jwt.sign({ _id: this._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  return token;
};

userSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
}

userSchema.statics.hashPassword = async function(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

export const User = mongoose.model("User", userSchema);