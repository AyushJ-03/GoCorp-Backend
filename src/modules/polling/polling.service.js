import { RideRequest } from "../ride/ride.model.js";
import { Clustering } from "./clustering.model.js";
import { Batched } from "./batched.model.js";
import { getDistance } from "../../utils/geo.js";
import ApiError from "../../utils/ApiError.js";
import { getEmployeesInRideGroup } from "../ride/ride.service.js";
import * as turf from "@turf/turf";
import { getRoute } from "../../utils/osrm.js";
import mongoose from "mongoose";

const ROUTE_BUFFER_METERS = 500;
const TIME_WINDOW_MINUTES = 10;
const MAX_CLUSTER_SIZE = 4;


/**
 * STEP 2 (FULL CHECK): Check if new pickup is within route buffer of existing polyline
 */
export const checkPolylineRouteBuffer = (polyline, newPickupCoords, bufferMeters) => {
  try {
    if (!polyline || !polyline.coordinates || polyline.coordinates.length === 0) {
      return false;
    }

    const point = turf.point(newPickupCoords);
    const lineString = turf.lineString(polyline.coordinates);

    // Find nearest point on the line to the new pickup
    const nearestPoint = turf.nearestPointOnLine(lineString, point);
    const distanceToLine = nearestPoint.properties.dist * 1000; // turf.js returns km, convert to meters

    return distanceToLine <= bufferMeters;
  } catch (error) {
    console.error("Error in checkPolylineRouteBuffer:", error);
    return false;
  }
};

/**
 * Check if two timestamps are within time window
 */
export const isWithinTimeWindow = (time1, time2, windowMinutes = TIME_WINDOW_MINUTES) => {
  const diff = Math.abs(new Date(time1).getTime() - new Date(time2).getTime());
  return diff <= windowMinutes * 60 * 1000;
};

/**
 * Check if two drop locations are similar (within 100 meters)
 */
export const isSimilarDropLocation = (drop1, drop2, threshold = 200) => {
  const distance = getDistance(drop1, drop2);
  return distance <= threshold;
};

/**
 * Check if two pickup locations are similar (within 100 meters)
 */
export const isSimilarPickupLocation = (pickup1, pickup2, threshold = 200) => {
  const distance = getDistance(pickup1, pickup2);
  return distance <= threshold;
};

/**
 * MAIN CLUSTERING LOGIC: can_cluster function
 * Condition 1: Similar pickup + similar drop + within time window
 * Condition 2: New pickup within route buffer of existing pickup polyline + similar drop + within time window
 */
export const can_cluster = async (newRide, existingCluster) => {
  try {
    const newPickup = newRide.pickup_location.coordinates;
    const newDrop = newRide.drop_location.coordinates;
    const newTime = newRide.scheduled_at;

    // Get the first ride of the cluster to check similarity
    const firstRideId = existingCluster.ride_ids[0];
    const firstRide = await RideRequest.findById(firstRideId);
    if (!firstRide) return false;

    const existingPickup = firstRide.pickup_location.coordinates;
    const existingDrop = firstRide.drop_location.coordinates;
    const existingTime = existingCluster.scheduled_at;

    // Check time window first (required for both conditions)
    if (!isWithinTimeWindow(newTime, existingTime)) {
      return false;
    }

    // Check drop location similarity (required for both conditions)
    if (!isSimilarDropLocation(newDrop, existingDrop)) {
      return false;
    }

    // CONDITION 1: Similar pickup location + similar drop + within time window
    if (isSimilarPickupLocation(newPickup, existingPickup)) {
      return true;
    }

    // CONDITION 2: New pickup within route buffer of existing polyline + similar drop + within time window
    if (existingCluster.pickup_polyline) {
      // Full check: Check actual polyline distance
      const inBuffer = checkPolylineRouteBuffer(
        existingCluster.pickup_polyline,
        newPickup,
        ROUTE_BUFFER_METERS
      );

      if (inBuffer) {
        console.log(`[Clustering] Match found: Ride ${newRide._id} is within ${ROUTE_BUFFER_METERS}m of cluster ${existingCluster._id} polyline.`);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error in can_cluster:", error);
    return false;
  }
};

/**
 * Find best matching cluster for a new ride
 * Optimization: For size-2 rides, check size-2 clusters first, then size-1
 */
export const findBestCluster = async (newRide, officeId, scheduledAt) => {
  try {
    // Calculate time window: ±10 minutes
    const scheduledTime = new Date(scheduledAt);
    const timeWindowMinutes = 10;
    const startTime = new Date(scheduledTime.getTime() - timeWindowMinutes * 60 * 1000);
    const endTime = new Date(scheduledTime.getTime() + timeWindowMinutes * 60 * 1000);

    // Find existing clusters for this office within time window
    const clusters = await Clustering.find({
      office_id: officeId,
      scheduled_at: { $gte: startTime, $lte: endTime },
      status: { $in: ["IN_CLUSTERING", "READY_FOR_BATCH"] },
    });

    if (clusters.length === 0) {
      return null;
    }

    const newRideSize = newRide.invited_employee_ids.length + 1;

    // Sort clusters: prioritize by size compatibility with optimization
    let sortedClusters = clusters;
    if (newRideSize === 2) {
      // Size-2 rides: prioritize size-2 clusters first, then size-1
      sortedClusters = [
        ...clusters.filter((c) => c.current_size === 2),
        ...clusters.filter((c) => c.current_size === 1),
        ...clusters.filter((c) => c.current_size !== 1 && c.current_size !== 2),
      ];
    } else if (newRideSize === 3) {
      // Size-3 rides: only consider size-1 clusters
      sortedClusters = clusters.filter((c) => c.current_size === 1);
    } else if (newRideSize > 3) {
      // Size-4+ rides: no clustering, will be batched directly
      return null;
    }

    // Check each cluster for compatibility
    for (const cluster of sortedClusters) {
      // Ensure total size doesn't exceed 4
      if (cluster.current_size + newRideSize > MAX_CLUSTER_SIZE) {
        continue;
      }

      // Check if can cluster
      const canCluster = await can_cluster(newRide, cluster);
      if (canCluster) {
        return cluster;
      }
    }

    return null;
  } catch (error) {
    console.error("Error in findBestCluster:", error);
    return null;
  }
};

/**
 * CASE 1: Single person, solo_preference = true
 * Skip clustering, send directly to Batched
 */
export const handleCase1_SoloPreference = async (ride) => {
  try {
    // Create a batched record directly
    const batched = await Batched.create({
      office_id: ride.office_id,
      scheduled_at: ride.scheduled_at,
      ride_ids: [ride._id],
      batch_size: 1,
      pickup_centroid: ride.pickup_location,
      drop_location: ride.drop_location,
      pickup_polyline: {
        type: "LineString",
        coordinates: await getRoute([ride.pickup_location.coordinates, ride.drop_location.coordinates]),
      },
      status: "CREATED",
      metadata: {
        force_batched: false,
        reason: "Solo preference",
      },
    });

    // Update ride status
    await RideRequest.findByIdAndUpdate(ride._id, {
      status: "BOOKED_SOLO",
      batch_id: batched._id,
    });

    return { case: 1, batched_id: batched._id, cluster_id: null };
  } catch (error) {
    console.error("Error in handleCase1:", error);
    throw error;
  }
};

/**
 * CASE 2: Single person, solo_preference = false
 * Move to Clustering, generate route polyline
 */
export const handleCase2_SinglePersonNoClustering = async (ride, officeId, scheduledAt) => {
  try {
    // Create a new cluster with just this ride
    const clustering = await Clustering.create({
      office_id: officeId,
      scheduled_at: scheduledAt,
      ride_ids: [ride._id],
      current_size: 1,
      pickup_centroid: ride.pickup_location,
      drop_location: ride.drop_location,
      pickup_polyline: {
        type: "LineString",
        coordinates: await getRoute([ride.pickup_location.coordinates, ride.drop_location.coordinates]),
      },
      status: "IN_CLUSTERING",
    });

    // Update ride status
    await RideRequest.findByIdAndUpdate(ride._id, {
      status: "IN_CLUSTERING",
    });

    return { case: 2, cluster_id: clustering._id, batched_id: null };
  } catch (error) {
    console.error("Error in handleCase2:", error);
    throw error;
  }
};

/**
 * CASE 3: Another single person, solo_preference = false
 * Run can_cluster against all existing Clustering entries
 * If compatible, merge. If not, create own route polyline and stay in Clustering
 */
export const handleCase3_AnotherSinglePerson = async (ride, officeId, scheduledAt) => {
  try {
    const bestCluster = await findBestCluster(ride, officeId, scheduledAt);

    if (bestCluster) {
      // Merge with best cluster
      const mergedCluster = await mergeClusters(ride, bestCluster);
      
      // Check if reached batch size
      if (mergedCluster.current_size === MAX_CLUSTER_SIZE) {
        const batched = await moveToBatched(mergedCluster, false, "Case 3: Solo + Size 3 = 4");
        return { case: 3, cluster_id: null, batched_id: batched._id, action: "merged_and_batched" };
      }
      
      return { case: 3, cluster_id: mergedCluster._id, action: "merged" };
    } else {
      // Create own cluster
      const newCluster = await handleCase2_SinglePersonNoClustering(ride, officeId, scheduledAt);
      return { case: 3, cluster_id: newCluster.cluster_id, action: "new_cluster" };
    }
  } catch (error) {
    console.error("Error in handleCase3:", error);
    throw error;
  }
};

/**
 * CASE 4: Person with 1 invited (group size = 2)
 * Only match against size-1 or size-2 clusters
 * If merged and total = 4, move to Batched
 */
export const handleCase4_GroupSize2 = async (ride, officeId, scheduledAt) => {
  try {
    const bestCluster = await findBestCluster(ride, officeId, scheduledAt);

    if (bestCluster) {
      // Merge
      const mergedCluster = await mergeClusters(ride, bestCluster);

      // Check if reached batch size
      if (mergedCluster.current_size >= MAX_CLUSTER_SIZE) {
        const batched = await moveToBatched(mergedCluster, false, "Reached max cluster size");
        return { case: 4, cluster_id: null, batched_id: batched._id, action: "merged_and_batched" };
      }

      return { case: 4, cluster_id: mergedCluster._id, batched_id: null, action: "merged" };
    } else {
      // Create own cluster
      const employees = await getEmployeesInRideGroup(ride._id);
      const newCluster = await Clustering.create({
        office_id: officeId,
        scheduled_at: scheduledAt,
        ride_ids: [ride._id],
        current_size: employees.length,
        pickup_centroid: ride.pickup_location,
        drop_location: ride.drop_location,
        pickup_polyline: {
          type: "LineString",
          coordinates: await getRoute([ride.pickup_location.coordinates, ride.drop_location.coordinates]),
        },
        status: "IN_CLUSTERING",
      });

      await RideRequest.findByIdAndUpdate(ride._id, {
        status: "IN_CLUSTERING",
      });

      return { case: 4, cluster_id: newCluster._id, batched_id: null, action: "new_cluster" };
    }
  } catch (error) {
    console.error("Error in handleCase4:", error);
    throw error;
  }
};

/**
 * CASE 5: Person with 2 invited (group size = 3)
 * Only match against size-1 clusters
 * If merged, total = 4, move to Batched. Otherwise create own cluster
 */
export const handleCase5_GroupSize3 = async (ride, officeId, scheduledAt) => {
  try {
    // Find only size-1 clusters
    const clusters = await Clustering.find({
      office_id: officeId,
      scheduled_at: scheduledAt,
      current_size: 1,
      status: { $in: ["IN_CLUSTERING", "READY_FOR_BATCH"] },
    });

    let bestMatch = null;
    for (const cluster of clusters) {
      const canCluster = await can_cluster(ride, cluster);
      if (canCluster) {
        bestMatch = cluster;
        break;
      }
    }

    if (bestMatch) {
      // Merge and move to Batched (because 3 + 1 = 4)
      const mergedCluster = await mergeClusters(ride, bestMatch);
      const batched = await moveToBatched(mergedCluster, false, "Case 5: Group size 3 + 1 = 4");
      return { case: 5, cluster_id: null, batched_id: batched._id, action: "merged_and_batched" };
    } else {
      // Create own cluster
      const employees = await getEmployeesInRideGroup(ride._id);
      const newCluster = await Clustering.create({
        office_id: officeId,
        scheduled_at: scheduledAt,
        ride_ids: [ride._id],
        current_size: employees.length,
        pickup_centroid: ride.pickup_location,
        drop_location: ride.drop_location,
        pickup_polyline: {
          type: "LineString",
          coordinates: await getRoute([ride.pickup_location.coordinates, ride.drop_location.coordinates]),
        },
        status: "IN_CLUSTERING",
      });

      await RideRequest.findByIdAndUpdate(ride._id, {
        status: "IN_CLUSTERING",
      });

      return { case: 5, cluster_id: newCluster._id, batched_id: null, action: "new_cluster" };
    }
  } catch (error) {
    console.error("Error in handleCase5:", error);
    throw error;
  }
};

/**
 * CASE 6: Person with 3 invited (group size = 4)
 * Skip clustering, send directly to Batched
 */
export const handleCase6_GroupSize4 = async (ride) => {
  try {
    const employees = await getEmployeesInRideGroup(ride._id);

    const batched = await Batched.create({
      office_id: ride.office_id,
      scheduled_at: ride.scheduled_at,
      ride_ids: [ride._id],
      batch_size: employees.length,
      pickup_centroid: ride.pickup_location,
      drop_location: ride.drop_location,
      pickup_polyline: {
        type: "LineString",
        coordinates: await getRoute([ride.pickup_location.coordinates, ride.drop_location.coordinates]),
      },
      status: "CREATED",
      metadata: {
        force_batched: false,
        reason: "Group size 4",
      },
    });

    await RideRequest.findByIdAndUpdate(ride._id, {
      status: "CLUSTERED", // Group is treated as a full carpool batch
      batch_id: batched._id,
    });

    return { case: 6, batched_id: batched._id, cluster_id: null };
  } catch (error) {
    console.error("Error in handleCase6:", error);
    throw error;
  }
};

/**
 * Merge a new ride into an existing cluster
 */
export const mergeClusters = async (newRide, existingCluster) => {
  try {
    const newEmployees = await getEmployeesInRideGroup(newRide._id);
    const existingEmployeeCount = existingCluster.current_size;
    const newTotalSize = existingEmployeeCount + newEmployees.length;

    if (newTotalSize > MAX_CLUSTER_SIZE) {
      throw new ApiError(400, "Cannot merge: would exceed max cluster size");
    }

    // Update ride status
    await RideRequest.findByIdAndUpdate(newRide._id, {
      status: "IN_CLUSTERING",
    });

    // RECALCULATE ROUTE: Add all pickups and common drop
    const allRideIds = [...existingCluster.ride_ids, newRide._id];
    const allRides = await RideRequest.find({ _id: { $in: allRideIds } });
    
    // Collect all pickup coordinates
    const waypoints = allRides.map(r => r.pickup_location.coordinates);
    // Add the common drop-off location
    waypoints.push(existingCluster.drop_location.coordinates);

    console.log(`[Clustering] Recalculating route for cluster ${existingCluster._id} with ${waypoints.length} points`);
    const newPolyline = await getRoute(waypoints);

    const updatedCluster = await Clustering.findByIdAndUpdate(
      existingCluster._id,
      {
        $push: { ride_ids: newRide._id },
        current_size: newTotalSize,
        pickup_polyline: {
          type: "LineString",
          coordinates: newPolyline
        },
        $push: {
          "metadata.merge_events": {
            merged_at: new Date(),
            new_size: newTotalSize,
          },
        },
      },
      { new: true }
    );

    return updatedCluster;
  } catch (error) {
    console.error("Error in mergeClusters:", error);
    throw error;
  }
};

/**
 * Move a cluster to Batched
 */
export const moveToBatched = async (cluster, forceBatched = false, reason = null) => {
  try {
    // Ensure all ride_ids are unique ObjectIds to avoid duplication or type issues
    const uniqueRideIds = [...new Set(cluster.ride_ids.map(id => id.toString()))].map(id => new mongoose.Types.ObjectId(id));

    const batched = await Batched.create({
      office_id: cluster.office_id,
      scheduled_at: cluster.scheduled_at,
      ride_ids: uniqueRideIds,
      batch_size: uniqueRideIds.length,
      pickup_polyline: cluster.pickup_polyline,
      pickup_centroid: cluster.pickup_centroid,
      drop_location: cluster.drop_location,
      status: "CREATED",
      metadata: {
        force_batched: forceBatched,
        force_batch_reason: reason,
        clustering_id: cluster._id,
      },
    });

    // Update cluster status to indicate it has been promoted to a batch
    await Clustering.findByIdAndUpdate(cluster._id, {
      status: "BATCHED",
      batch_id: batched._id,
    });

    // Update all rides in the batch to common 'CLUSTERED' status
    await RideRequest.updateMany(
      { _id: { $in: uniqueRideIds } },
      {
        status: "CLUSTERED",
        batch_id: batched._id,
      }
    );

    console.log(`[Batching] Successfully promoted cluster ${cluster._id} to batch ${batched._id} with ${uniqueRideIds.length} rides.`);

    return batched;
  } catch (error) {
    console.error("Error in moveToBatched:", error);
    throw error;
  }
};

/**
 * Route a new ride request through the polling system
 */
export const routeRideRequest = async (ride) => {
  try {
    const rideSize = ride.invited_employee_ids.length + 1;
    const officeId = ride.office_id;
    const scheduledAt = ride.scheduled_at;

    // Case 1: Solo preference + size 1 → Direct to Batched
    if (rideSize === 1 && ride.solo_preference) {
      return await handleCase1_SoloPreference(ride);
    }

    // Cases 2 & 3: Solo, no preference → Try to merge or create cluster
    if (rideSize === 1 && !ride.solo_preference) {
      return await handleCase3_AnotherSinglePerson(ride, officeId, scheduledAt);
    }

    // Case 4: Group size 2
    if (rideSize === 2) {
      return await handleCase4_GroupSize2(ride, officeId, scheduledAt);
    }

    // Case 5: Group size 3
    if (rideSize === 3) {
      return await handleCase5_GroupSize3(ride, officeId, scheduledAt);
    }

    // Case 6: Group size 4
    if (rideSize === 4) {
      return await handleCase6_GroupSize4(ride);
    }

    throw new ApiError(400, `Invalid ride size: ${rideSize}`);
  } catch (error) {
    console.error("Error in routeRideRequest:", error);
    throw error;
  }
};
