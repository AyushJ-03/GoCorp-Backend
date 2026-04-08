import mongoose from "mongoose";

const batchedSchema = new mongoose.Schema(
  {
    office_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      required: true,
    },

    scheduled_at: {
      type: Date,
      required: true,
    },

    // Array of all employees/ride_ids in this batch (max 4)
    ride_ids: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "RideRequest",
      required: true,
      validate: {
        validator: function (v) {
          return v.length >= 1 && v.length <= 4;
        },
        message: "Batch must contain 1-4 rides",
      },
    },

    batch_size: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
    },

    // Polyline for pickup route
    pickup_polyline: {
      type: {
        type: String,
        enum: ["LineString"],
      },
      coordinates: [[Number]],
    },

    // Pickup centroid
    pickup_centroid: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: [Number],
    },

    // Drop location
    drop_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: [Number],
    },

    // Status progression
    status: {
      type: String,
      enum: [
        "CREATED",
        "READY_FOR_ASSIGNMENT",
        "ASSIGNED_TO_DRIVER",
        "DRIVER_ACCEPTED",
        "IN_TRANSIT",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "CREATED",
    },

    // Driver assignment
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
    },

    assigned_at: Date,

    // Timestamp when batch was created from clustering
    batched_at: {
      type: Date,
      default: Date.now,
    },

    // Metadata
    metadata: {
      // Whether this was auto-batched due to time pressure
      force_batched: { type: Boolean, default: false },
      force_batch_reason: String,
      // Which clustering record this came from
      clustering_id: mongoose.Schema.Types.ObjectId,
      // Estimated fare (can be calculated later)
      estimated_fare: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
batchedSchema.index({ office_id: 1, scheduled_at: 1, status: 1 });
batchedSchema.index({ scheduled_at: 1, status: 1 });
batchedSchema.index({ driver_id: 1, status: 1 });
batchedSchema.index({ status: 1 });

export const Batched = mongoose.model("Batched", batchedSchema);
