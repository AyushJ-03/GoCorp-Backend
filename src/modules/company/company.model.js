import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  companyContact: {
    primary_email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"]
    },
    primary_number: {
      type: String,
      match: [/^\d{10}$/, "not a valid number"],
      required: true
    }
  },
  address: {
    country: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    address_line: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      match: [/^\d{6}$/, "not a valid pincode"],
      required: true,
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ["free_tier", "startup", "enterprise"],
      default: "free_tier",
    },
    starts_at: {
      type: Date,
    },
    expires_at: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "inactive"]
    }
  },
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true })

export const Company = mongoose.model("Company", companySchema)