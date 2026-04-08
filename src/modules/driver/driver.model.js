import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const driverSchema = new mongoose.Schema({

  name: {
    first_name: {
      type: String,
      required: true,
      minlength: [3, "First name must be at least 3 characters long"]
    },
    last_name: {
      type: String,
    },

  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"]
  },

  contact: {
    type: String,
    required: true,
    match: [/^\d{10}$/, "Please provide a valid 10-digit phone number"]
  },

  password: {
    type: String,
    required: true,
    select: false,
    minlength: [6, "Password must be at least 6 characters long"]
  },

  socketId: {
    type: String
  },

  status: {
    type: String,
    enum: ["available", "on_trip", "offline"],
    default: "available"
  },

  vehicle: {
    color: {
      type: String,
      required: true,
      minlength: [3, "Color must be at least 3 characters long"]
    },
    capacity: {
      type: Number,
      required: true,
      min: [1, "Capacity must be at least 1"],
      max: [7, "Capacity cannot exceed 7"]
    },
    license_plate: {
      type: String,
      required: true,
      unique: true,
      match: [/^[A-Z]{2}[ -]?[0-9]{2}[ -]?[A-Z]{1,2}[ -]?[0-9]{4}$/, "License plate must be alphanumeric and can include dashes"]
    },
    vehicleType: {
      type: String,
      enum: ["sedan", "bike", "auto", "suv"],
      required: true
    }
  },

  driver_location: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: [Number]
  }

});

driverSchema.index({ driver_location: "2dsphere" });

driverSchema.methods.generateAuthToken = async function () {
  const token = jwt.sign({ _id: this._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  return token;
}

driverSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
}

driverSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

export const Driver = mongoose.model('Driver', driverSchema);