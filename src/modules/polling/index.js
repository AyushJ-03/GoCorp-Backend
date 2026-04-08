/**
 * Polling Module Index
 * Export all models, services, and utilities for easy importing
 * Usage: import { Clustering, Batched, routeRideRequest } from './polling/index.js'
 */

// Models
export { Clustering } from "./clustering.model.js";
export { Batched } from "./batched.model.js";

// Service Functions - Main Logic
export {
  can_cluster,
  findBestCluster,
  routeRideRequest,
  moveToBatched,
  mergeClusters,
} from "./polling.service.js";

// Service Functions - Case Handlers
export {
  handleCase1_SoloPreference,
  handleCase2_SinglePersonNoClustering,
  handleCase3_AnotherSinglePerson,
  handleCase4_GroupSize2,
  handleCase5_GroupSize3,
  handleCase6_GroupSize4,
} from "./polling.service.js";

// Service Functions - Utility/Helper
export {
  checkBearingAndBoundingBox,
  checkPolylineRouteBuffer,
  isWithinTimeWindow,
  isSimilarDropLocation,
  isSimilarPickupLocation,
} from "./polling.service.js";

// Scheduled Jobs
export { initForceBatchJob, initCleanupJob } from "./polling.jobs.js";

// Constants (useful for external configuration)
export const POLLING_CONSTANTS = {
  MAX_CLUSTER_SIZE: 4,
  ROUTE_BUFFER_METERS: 500,
  TIME_WINDOW_MINUTES: 10,
  PICKUP_SIMILARITY_THRESHOLD: 100, // meters
  DROP_SIMILARITY_THRESHOLD: 100, // meters
  BEARING_TOLERANCE_DEGREES: 45,
};
