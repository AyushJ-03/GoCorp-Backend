import cron from "node-cron";
import { Clustering } from "./clustering.model.js";
import { moveToBatched } from "./polling.service.js";
import { RideRequest } from "../ride/ride.model.js";

export const initForceBatchJob = () => {
  /**
   * Force-batch scheduled job
   * Runs every minute
   * Moves any cluster whose scheduled time is 10 minutes away to Batched
   */
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const forceBatchThreshold = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

      // Find all clusters that are still in IN_CLUSTERING/READY_FOR_BATCH
      // and whose scheduled_at is <= forceBatchThreshold
      const clustersToForceBatch = await Clustering.find({
        status: { $in: ["IN_CLUSTERING", "READY_FOR_BATCH"] },
        scheduled_at: { $lte: forceBatchThreshold },
      });

      if (clustersToForceBatch.length > 0) {
        console.log(
          `[Force Batch Job] Found ${clustersToForceBatch.length} cluster(s) to force-batch at ${now.toISOString()}`
        );

        for (const cluster of clustersToForceBatch) {
          try {
            // Move cluster to Batched
            const batched = await moveToBatched(
              cluster,
              true,
              `Force-batched: Scheduled time ${cluster.scheduled_at.toISOString()} within 10-minute window`
            );

            console.log(
              `[Force Batch Job] Successfully force-batched cluster ${cluster._id} to batch ${batched._id}`
            );

            // Notify users/system about batching
            // This could send notifications, update real-time events, etc.
          } catch (error) {
            console.error(
              `[Force Batch Job] Error force-batching cluster ${cluster._id}:`,
              error.message
            );
          }
        }
      }
    } catch (error) {
      console.error("[Force Batch Job] Error:", error);
    }
  });

  console.log("[Force Batch Job] Initialized - runs every minute");
};

/**
 * Optional: Additional cleanup job to handle orphaned clusters/batches
 * Runs every 5 minutes
 */
export const initCleanupJob = () => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      // Find clusters that have been in IN_CLUSTERING for more than 30 minutes
      // These are likely orphaned and should be force-batched
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const orphanedClusters = await Clustering.find({
        status: "IN_CLUSTERING",
        createdAt: { $lte: thirtyMinutesAgo },
      });

      if (orphanedClusters.length > 0) {
        console.log(
          `[Cleanup Job] Found ${orphanedClusters.length} orphaned cluster(s) older than 30 minutes`
        );

        for (const cluster of orphanedClusters) {
          try {
            // Check if ride is still in IN_CLUSTERING status
            const rides = await RideRequest.find({
              _id: { $in: cluster.ride_ids },
              status: "IN_CLUSTERING",
            });

            if (rides.length > 0) {
              // Force batch this cluster
              const batched = await moveToBatched(
                cluster,
                true,
                "Force-batched: Cluster orphaned for >30 minutes"
              );

              console.log(
                `[Cleanup Job] Force-batched orphaned cluster ${cluster._id} to batch ${batched._id}`
              );
            }
          } catch (error) {
            console.error(
              `[Cleanup Job] Error processing orphaned cluster ${cluster._id}:`,
              error.message
            );
          }
        }
      }
    } catch (error) {
      console.error("[Cleanup Job] Error:", error);
    }
  });

  console.log("[Cleanup Job] Initialized - runs every 5 minutes");
};
