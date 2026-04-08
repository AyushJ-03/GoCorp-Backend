import { RideRequest } from "../ride/ride.model.js";
import { Clustering } from "./clustering.model.js";
import { Batched } from "./batched.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";
import { routeRideRequest } from "./polling.service.js";
import { validationResult } from "express-validator";

/**
 * Submit a ride request to the polling/clustering system
 * This endpoint takes a completed ride request and routes it through clustering rules
 */
export const submitRideForPolling = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { ride_id } = req.body;

    // Get the ride request
    const ride = await RideRequest.findById(ride_id);
    if (!ride) {
      throw new ApiError(404, "Ride request not found");
    }

    // Verify ride status is PENDING
    if (ride.status !== "PENDING") {
      throw new ApiError(400, `Ride must be in PENDING status, currently ${ride.status}`);
    }

    // Route ride through polling system
    const result = await routeRideRequest(ride);

    let response = {
      ride_id: ride._id,
      ...result,
    };

    if (result.batch_id) {
      const batch = await Batched.findById(result.batch_id);
      response.batch_details = {
        batch_id: batch._id,
        size: batch.batch_size,
        status: batch.status,
      };
    }

    if (result.cluster_id) {
      const cluster = await Clustering.findById(result.cluster_id);
      response.cluster_details = {
        cluster_id: cluster._id,
        size: cluster.current_size,
        status: cluster.status,
      };
    }

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          `Ride routed successfully via Case ${result.case}`,
          response
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Get clustering status for a ride
 */
export const getRideClusteringStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { ride_id } = req.params;

    // Get the ride
    const ride = await RideRequest.findById(ride_id);
    if (!ride) {
      throw new ApiError(404, "Ride not found");
    }

    let status = {
      ride_id: ride._id,
      ride_status: ride.status,
      employee_id: ride.employee_id,
      scheduled_at: ride.scheduled_at,
      pickup_location: ride.pickup_location.coordinates,
      drop_location: ride.drop_location.coordinates,
    };

    // Check if in clustering
    if (ride.status === "IN_CLUSTERING") {
      const cluster = await Clustering.findOne({ ride_ids: ride_id });
      if (cluster) {
        status.cluster_id = cluster._id;
        status.cluster_size = cluster.current_size;
        status.cluster_status = cluster.status;
        status.cluster_rides = cluster.ride_ids;
      }
    }

    // Check if batched
    if (ride.batch_id) {
      const batch = await Batched.findById(ride.batch_id);
      if (batch) {
        status.batch_id = batch._id;
        status.batch_size = batch.batch_size;
        status.batch_status = batch.status;
        status.batch_rides = batch.ride_ids;
        if (batch.driver_id) {
          status.assigned_driver_id = batch.driver_id;
          status.assigned_at = batch.assigned_at;
        }
      }
    }

    res
      .status(200)
      .json(new ApiResponse(200, "Ride clustering status retrieved", status));
  } catch (error) {
    next(error);
  }
};

/**
 * Get all clusters for an office at a specific time
 */
export const getClustersByOfficeAndTime = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { office_id, scheduled_at } = req.query;

    const clusters = await Clustering.find({
      office_id: office_id,
      scheduled_at: new Date(scheduled_at),
    })
      .populate("ride_ids", "_id employee_id pickup_location drop_location")
      .sort({ createdAt: -1 });

    const total = clusters.length;
    const activeCount = clusters.filter((c) => c.status === "IN_CLUSTERING").length;
    const readyCount = clusters.filter((c) => c.status === "READY_FOR_BATCH").length;

    res.status(200).json(
      new ApiResponse(200, "Clusters retrieved", {
        total,
        active: activeCount,
        ready_for_batch: readyCount,
        clusters: clusters.map((c) => ({
          cluster_id: c._id,
          size: c.current_size,
          status: c.status,
          ride_count: c.ride_ids.length,
          scheduled_at: c.scheduled_at,
          created_at: c.createdAt,
        })),
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get all batches for an office at a specific time
 */
export const getBatchesByOfficeAndTime = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { office_id, scheduled_at, status } = req.query;

    let query = {
      office_id: office_id,
      scheduled_at: new Date(scheduled_at),
    };

    if (status) {
      query.status = status;
    }

    const batches = await Batched.find(query)
      .populate("ride_ids", "_id employee_id pickup_location drop_location")
      .populate("driver_id", "_id name email vehicle")
      .sort({ createdAt: -1 });

    res.status(200).json(
      new ApiResponse(200, "Batches retrieved", {
        total: batches.length,
        batches: batches.map((b) => ({
          batch_id: b._id,
          size: b.batch_size,
          status: b.status,
          ride_ids: b.ride_ids.map((r) => r._id),
          driver_assigned: b.driver_id ? true : false,
          assigned_at: b.assigned_at,
          batched_at: b.batched_at,
          force_batched: b.metadata.force_batched,
        })),
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed cluster info
 */
export const getClusterDetails = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { cluster_id } = req.params;

    const cluster = await Clustering.findById(cluster_id)
      .populate("ride_ids", "_id employee_id pickup_location drop_location scheduled_at")
      .populate("office_id", "_id name");

    if (!cluster) {
      throw new ApiError(404, "Cluster not found");
    }

    res.status(200).json(
      new ApiResponse(200, "Cluster details retrieved", {
        cluster_id: cluster._id,
        office: cluster.office_id,
        scheduled_at: cluster.scheduled_at,
        size: cluster.current_size,
        status: cluster.status,
        rides: cluster.ride_ids,
        ready_for_batch_at: cluster.ready_for_batch_at,
        batch_id: cluster.batch_id,
        metadata: cluster.metadata,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed batch info
 */
export const getBatchDetails = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { batch_id } = req.params;

    const batch = await Batched.findById(batch_id)
      .populate("ride_ids", "_id employee_id pickup_location drop_location")
      .populate("driver_id", "_id name email contact vehicle")
      .populate("office_id", "_id name");

    if (!batch) {
      throw new ApiError(404, "Batch not found");
    }

    res.status(200).json(
      new ApiResponse(200, "Batch details retrieved", {
        batch_id: batch._id,
        office: batch.office_id,
        scheduled_at: batch.scheduled_at,
        size: batch.batch_size,
        status: batch.status,
        rides: batch.ride_ids,
        driver: batch.driver_id || null,
        assigned_at: batch.assigned_at,
        batched_at: batch.batched_at,
        metadata: batch.metadata,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get polling statistics for an office
 */
export const getPollingStats = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(new ApiResponse(400, "Validation errors", errors.array()));
    }

    const { office_id, date } = req.query;

    // Parse date to get start and end of day
    const dateObj = new Date(date);
    const dayStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const clusteringStats = await Clustering.aggregate([
      {
        $match: {
          office_id: new (require("mongoose")).Types.ObjectId(office_id),
          scheduled_at: { $gte: dayStart, $lt: dayEnd },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total_people: { $sum: "$current_size" },
        },
      },
    ]);

    const batchedStats = await Batched.aggregate([
      {
        $match: {
          office_id: new (require("mongoose")).Types.ObjectId(office_id),
          scheduled_at: { $gte: dayStart, $lt: dayEnd },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total_people: { $sum: "$batch_size" },
        },
      },
    ]);

    const rideStats = await RideRequest.aggregate([
      {
        $match: {
          office_id: new (require("mongoose")).Types.ObjectId(office_id),
          scheduled_at: { $gte: dayStart, $lt: dayEnd },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json(
      new ApiResponse(200, "Polling statistics retrieved", {
        date: date,
        office_id: office_id,
        clustering: clusteringStats,
        batched: batchedStats,
        rides: rideStats,
      })
    );
  } catch (error) {
    next(error);
  }
};
