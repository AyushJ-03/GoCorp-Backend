import express from "express";
import { body, param, query } from "express-validator";
import { authUser } from "../../middleware/auth.middleware.js";
import {
  submitRideForPolling,
  getRideClusteringStatus,
  getClustersByOfficeAndTime,
  getBatchesByOfficeAndTime,
  getClusterDetails,
  getBatchDetails,
  getPollingStats,
} from "./polling.controller.js";

const router = express.Router();

/**
 * POST /api/polling/submit-ride
 * Submit a ride request to the polling/clustering system
 * Requires: ride_id of a PENDING ride
 */
router.post(
  "/submit-ride",
  [body("ride_id").notEmpty().withMessage("ride_id is required")],
  submitRideForPolling
);

/**
 * GET /api/polling/ride-status/:ride_id
 * Get clustering status for a specific ride
 */
router.get(
  "/ride-status/:ride_id",
  [param("ride_id").matches(/^[0-9a-fA-F]{24}$/).withMessage("Invalid ride ID format")],
  getRideClusteringStatus
);

/**
 * GET /api/polling/clusters
 * Get all clusters for an office at a specific scheduled time
 * Query params: office_id, scheduled_at
 */
router.get(
  "/clusters",
  [
    query("office_id")
      .notEmpty()
      .withMessage("office_id is required")
      .matches(/^[0-9a-fA-F]{24}$/)
      .withMessage("Invalid office ID format"),
    query("scheduled_at").notEmpty().withMessage("scheduled_at is required").isISO8601(),
  ],
  getClustersByOfficeAndTime
);

/**
 * GET /api/polling/batches
 * Get all batches for an office at a specific scheduled time
 * Query params: office_id, scheduled_at, status (optional)
 */
router.get(
  "/batches",
  [
    query("office_id")
      .notEmpty()
      .withMessage("office_id is required")
      .matches(/^[0-9a-fA-F]{24}$/)
      .withMessage("Invalid office ID format"),
    query("scheduled_at").notEmpty().withMessage("scheduled_at is required").isISO8601(),
    query("status").optional().isIn([
      "CREATED",
      "READY_FOR_ASSIGNMENT",
      "ASSIGNED_TO_DRIVER",
      "DRIVER_ACCEPTED",
      "IN_TRANSIT",
      "COMPLETED",
      "CANCELLED",
    ]),
  ],
  getBatchesByOfficeAndTime
);

/**
 * GET /api/polling/cluster/:cluster_id
 * Get detailed information about a specific cluster
 */
router.get(
  "/cluster/:cluster_id",
  [param("cluster_id").matches(/^[0-9a-fA-F]{24}$/).withMessage("Invalid cluster ID format")],
  getClusterDetails
);

/**
 * GET /api/polling/batch/:batch_id
 * Get detailed information about a specific batch
 */
router.get(
  "/batch/:batch_id",
  [param("batch_id").matches(/^[0-9a-fA-F]{24}$/).withMessage("Invalid batch ID format")],
  getBatchDetails
);

/**
 * GET /api/polling/stats
 * Get polling statistics for an office on a specific date
 * Query params: office_id, date (YYYY-MM-DD)
 */
router.get(
  "/stats",
  [
    query("office_id")
      .notEmpty()
      .withMessage("office_id is required")
      .matches(/^[0-9a-fA-F]{24}$/)
      .withMessage("Invalid office ID format"),
    query("date").notEmpty().withMessage("date is required").isISO8601(),
  ],
  getPollingStats
);

export default router;
