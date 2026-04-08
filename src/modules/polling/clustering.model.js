import mongoose from "mongoose";

const clusteringSchema = new mongoose.Schema(
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

    // Array of ride_ids (RideRequest._id) that are part of this cluster
    ride_ids: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "RideRequest",
      default: [],
      validate: {
        validator: function (v) {
          // Max 4 rides/people in a cluster
          return v.length <= 4;
        },
        message: "Maximum 4 people can be in a cluster",
      },
    },

    // Additional metadata about the cluster
    current_size: {
      type: Number,
      default: 0,
    },

    // Polyline route from OSRM or other routing service
    // Contains GeoJSON LineString for the cluster pickup route
    pickup_polyline: {
      type: {
        type: String,
        enum: ["LineString"],
      },
      coordinates: [[Number]],
    },

    // Average/centroid of all pickup points
    pickup_centroid: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: [Number],
    },

    // Common drop location (or centroid if varied)
    drop_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: [Number],
    },

    // Status of the cluster
    status: {
      type: String,
      enum: ["IN_CLUSTERING", "READY_FOR_BATCH", "BATCHED"],
      default: "IN_CLUSTERING",
    },

    // Timestamp when cluster is ready to be batched
    ready_for_batch_at: Date,

    // Reference to the batch if this cluster has been moved to Batched
    batch_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RideBatch",
    },

    // Metadata for optimization/debugging
    metadata: {
      // Track why this cluster was force-batched
      force_batched: { type: Boolean, default: false },
      force_batch_reason: String,
      // Track merge history
      merge_events: [
        {
          merged_cluster_id: mongoose.Schema.Types.ObjectId,
          merged_at: Date,
          new_size: Number,
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
clusteringSchema.index({ office_id: 1, scheduled_at: 1, status: 1 });
clusteringSchema.index({ scheduled_at: 1, status: 1 });
clusteringSchema.index({ pickup_location: "2dsphere" });
clusteringSchema.index({ status: 1, ready_for_batch_at: 1 });

export const Clustering = mongoose.model("Clustering", clusteringSchema);
