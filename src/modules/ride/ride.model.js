import mongoose from "mongoose"

const rideRequestSchema = new mongoose.Schema(
  {
    employee_id:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    office_id:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      required: true
    },

    destination_type:
    {
      type: String,
      enum: ["OFFICE", "HOME", "OTHER"],
      required: true
    },

    scheduled_at: Date,

    pickup_address: String,

    pickup_location:
    {
      type: {
        type: String,
        enum: ["Point"], 
        default: "Point"
      },
      coordinates: [Number],
    },

    drop_address: String,

    drop_location: 
    {
      type: 
      { 
        type: String, 
        enum: ["Point"], 
        default: "Point" 
      },
      coordinates: [Number],
    },

    solo_preference: 
    { 
      type: Boolean, 
      default: false 
    },

    invited_employee_ids:
    {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      validate: {
        validator: function(v) {
          // Ensure max 3 invited employees (plus requester = 4 total)
          return v.length <= 3;
        },
        message: "Maximum 3 people can be invited (4 total including requester)"
      }
    },

    is_late_request: 
    { 
      type: Boolean, 
      default: false 
    },

    status: 
    {
      type: String,
      enum: [
        "PENDING",
        "IN_CLUSTERING",
        "CLUSTERED",
        "BOOKED_SOLO",
        "ACCEPTED",
        "ARRIVED",
        "STARTED",
        "CANCELLED",
        "COMPLETED",
      ],
      default: "PENDING",
    },

    otp: {
      type: String,
      required: true,
    },

    batch_id: 
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RideBatch"
    },

    parent_request_id: 
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RideRequest"
    },

    pickup_order: 
    {
      type: Number,
    },

    cancelled_at: Date,
    cancel_reason: String,
  },
  {
    timestamps: true
  }
);

rideRequestSchema.index({ employee_id: 1, status: 1 })
rideRequestSchema.index({ office_id: 1, scheduled_at: 1, status: 1 })
rideRequestSchema.index({ pickup_location: "2dsphere" });

export const RideRequest = mongoose.model("RideRequest", rideRequestSchema)