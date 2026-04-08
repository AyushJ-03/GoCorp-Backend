import { RideRequest } from "./ride.model.js";
import { Office } from "../office/office.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";
import {
  isWithinOfficeHours,
  isDuplicateBooking,
  isPastTime,
  isOneEndOffice,
  validateInvitedEmployees,
  getInvitedPeopleForRide,
  findRidesInvitingEmployee,
  getEmployeesInRideGroup
} from "./ride.service.js";
import { routeRideRequest } from "../polling/polling.service.js";
import { RideBatch } from "./batch.model.js";
import { validationResult } from "express-validator"

export const bookRide = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      employee_id,
      office_id,
      schedule_type,
      scheduled_at,
      pickup_address,
      pickup_location,
      drop_address,
      drop_location,
      solo_preference,
      destination_type,
      invited_employee_ids = []
    } = req.body;

    if (!employee_id || !office_id || !scheduled_at) {
      throw new ApiError(400, "Missing required fields");
    }

    // Validate invited employees
    const inviteValidation = validateInvitedEmployees(invited_employee_ids);
    if (!inviteValidation.valid) {
      throw new ApiError(400, inviteValidation.message);
    }

    // step 1 — fetch office
    const office = await Office.findById(office_id);
    if (!office) throw new ApiError(404, "Office not found");

    // step 1.5 — check if scheduled time is in the past
    if (isPastTime(scheduled_at)) {
      throw new ApiError(400, "Rides cannot be scheduled in the past");
    }

    // step 2 — check office hours
    if (!isWithinOfficeHours(scheduled_at, office)) {
      throw new ApiError(400, "Ride request is outside office hours");
    }

    // step 3 — check duplicate booking
    if (await isDuplicateBooking(employee_id, scheduled_at)) {
      throw new ApiError(400, "Duplicate ride request for the same time");
    }

    //step 4 — check one end is office
    if (
      !isOneEndOffice(pickup_location, drop_location, office.office_location)
    ) {
      throw new ApiError(
        400,
        "Either pickup or drop location must be the office",
      );
    }

    const ride = await RideRequest.create({
      employee_id,
      office_id,
      destination_type,
      schedule_type,
      scheduled_at,
      pickup_address,
      pickup_location: {
        type: 'Point',
        coordinates: Array.isArray(pickup_location) ? pickup_location : pickup_location.coordinates
      },
      drop_address,
      drop_location: {
        type: 'Point',
        coordinates: Array.isArray(drop_location) ? drop_location : drop_location.coordinates
      },
      solo_preference,
      invited_employee_ids,
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
    });

    // if (!solo_preference) {
    //   // Only run clustering when enough rides
    //   const pendingCount = await RideRequest.countDocuments({
    //     office_id,
    //     direction,
    //     status: "PENDING",
    //   });

    //   // if (pendingCount % 3 === 0) {
    //   //   const clusters = await clusterRides({
    //   //     office_id,
    //   //     direction,
    //   //     scheduled_at,
    //   //   });

    //   //   await assignClusters(clusters, {
    //   //     office_id,
    //   //     direction,
    //   //     scheduled_at,
    //   //   });
    //   // }
    // }

    if (ride) {
      console.log("\n--- NEW RIDE CREATED ---");
      console.log("Ride ID:", ride._id);
      console.log("Status:", ride.status);
      console.log("Scheduled At:", ride.scheduled_at);
      console.log("Pickup Location:", ride.pickup_location.coordinates);
      
      // Automatically submit to polling system
      console.log("\n--- AUTO-SUBMITTING TO POLLING ---");
      const pollingResult = await routeRideRequest(ride);
      console.log("Polling Result:", pollingResult);
      
      res
        .status(201)
        .json(new ApiResponse(201, "Ride booked and submitted to polling successfully", {
          ride,
          polling: pollingResult
        }));
    } else {
      throw new ApiError(500, "Failed to book ride");
    }
  } catch (e) {
    next(e);
  }
};

export const getClusters = async (req, res) => {
  try {
    const { office_id, direction, scheduled_at } = req.query;
    const office = await Office.findById(office_id);

    const batches = await RideBatch.find({
      office_id,
      direction,
      scheduled_at: new Date(scheduled_at),
    });

    const rides = await RideRequest.find({
      office_id,
      direction,
      scheduled_at: new Date(scheduled_at),
      status: "CLUSTERED",
    });

    res.json({
      batches,
      rides,
      office,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getInvitedPeople = async (req, res, next) => {
  try {
    const { employee_id } = req.params;

    if (!employee_id) {
      throw new ApiError(400, "Employee ID is required");
    }

    // Validate employee_id format
    if (!employee_id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new ApiError(400, "Invalid employee ID format");
    }

    const result = await getInvitedPeopleForRide(employee_id);

    res.status(200).json(
      new ApiResponse(200, "Invited people retrieved successfully", result)
    );
  } catch (error) {
    next(error || new ApiError(500, "Error retrieving invited people"));
  }
};

// For clustering service: Get rides where this employee was invited
export const getRidesWithEmployeeInvite = async (req, res, next) => {
  try {
    const { employee_id, scheduled_at } = req.query;

    if (!employee_id || !scheduled_at) {
      throw new ApiError(400, "Employee ID and scheduled time are required");
    }

    const rides = await findRidesInvitingEmployee(employee_id, scheduled_at);

    res.status(200).json(
      new ApiResponse(200, "Rides with invites retrieved", {
        count: rides.length,
        rides
      })
    );
  } catch (error) {
    next(error || new ApiError(500, "Error retrieving rides with invites"));
  }
};

// For clustering service: Get all employees in a ride (requester + invited)
export const getRideEmployeeGroup = async (req, res, next) => {
  try {
    const { ride_id } = req.params;

    if (!ride_id) {
      throw new ApiError(400, "Ride ID is required");
    }

    const employees = await getEmployeesInRideGroup(ride_id);

    res.status(200).json(
      new ApiResponse(200, "Ride employee group retrieved", {
        total: employees.length,
        employee_ids: employees
      })
    );
  } catch (error) {
    next(error || new ApiError(500, "Error retrieving ride employee group"));
  }
};

export const cancelRide = async (req, res, next) => {
  try {
    const { ride_id } = req.params;
    const { cancel_reason } = req.body;

    if (!ride_id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new ApiError(400, "Invalid ride ID format");
    }

    const ride = await RideRequest.findById(ride_id);
    if (!ride) throw new ApiError(404, "Ride not found");

    // Ensure the requesting user owns this ride
    if (ride.employee_id.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "You are not authorized to cancel this ride");
    }

    // Only allow cancellation of PENDING or IN_CLUSTERING rides
    if (!["PENDING", "IN_CLUSTERING"].includes(ride.status)) {
      throw new ApiError(400, `Cannot cancel a ride with status: ${ride.status}`);
    }

    ride.status = "CANCELLED";
    ride.cancelled_at = new Date();
    ride.cancel_reason = cancel_reason || "Cancelled by user";
    await ride.save();

    res.status(200).json(new ApiResponse(200, "Ride cancelled successfully", ride));
  } catch (error) {
    next(error || new ApiError(500, "Error cancelling ride"));
  }
};

export const getRideById = async (req, res, next) => {
  try {
    const { ride_id } = req.params;

    if (!ride_id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new ApiError(400, "Invalid ride ID format");
    }

    const ride = await RideRequest.findById(ride_id)
      .populate('employee_id', 'name email profile_image')
      .populate('office_id', 'name office_location shift_start shift_end')
      .populate('invited_employee_ids', 'name email profile_image');

    if (!ride) throw new ApiError(404, "Ride not found");

    res.status(200).json(new ApiResponse(200, "Ride retrieved successfully", ride));
  } catch (error) {
    next(error || new ApiError(500, "Error retrieving ride"));
  }
};

export const getPendingRides = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.query;

    // Validate location coordinates
    if (!latitude || !longitude) {
      throw new ApiError(400, "Driver location (latitude, longitude) is required");
    }

    const driverLat = parseFloat(latitude);
    const driverLng = parseFloat(longitude);

    // Validate parsed coordinates
    if (isNaN(driverLat) || isNaN(driverLng)) {
      throw new ApiError(400, "Invalid latitude or longitude values");
    }

    // Validate coordinate ranges
    if (driverLat < -90 || driverLat > 90 || driverLng < -180 || driverLng > 180) {
      throw new ApiError(400, "Invalid coordinate ranges");
    }

    const now = new Date();
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60000);
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60000); // 2 hours for more flexibility

    console.log(`\n🔍 === SEARCHING FOR RIDES ===`);
    console.log(`🔍 Driver Location: [${driverLat}, ${driverLng}]`);
    console.log(`🔍 Current Time: ${now.toISOString()}`);
    console.log(`🔍 Time Window: ${fifteenMinutesAgo.toISOString()} to ${twoHoursLater.toISOString()}`);

    // First, check total rides in database
    const totalRides = await RideRequest.countDocuments({});
    console.log(`📊 Total rides in database: ${totalRides}`);

    // Check pending rides
    const pendingRides = await RideRequest.countDocuments({ status: "PENDING" });
    console.log(`📊 PENDING rides in database: ${pendingRides}`);

    // Check all ride statuses  
    const allStatuses = await RideRequest.distinct("status");
    console.log(`📊 Available statuses in database:`, allStatuses);

    // Get all PENDING rides (regardless of time) for debugging
    const allPendingRidesDebug = await RideRequest.find({ status: "PENDING" }).lean();
    console.log(`📊 All PENDING rides (any time): ${allPendingRidesDebug.length}`);
    if (allPendingRidesDebug.length > 0) {
      allPendingRidesDebug.forEach(ride => {
        const timeDiff = ride.scheduled_at ? ride.scheduled_at.getTime() - now.getTime() : null;
        console.log(`  - Ride ${ride._id}: scheduled_at="${ride.scheduled_at}", timeDiff=${timeDiff}ms (${(timeDiff / 60000).toFixed(1)} min)`);
      });
    }

    // Get all pending rides matching time criteria
    const allPendingRides = await RideRequest.find({
      status: "PENDING",
      $or: [
        // Instant rides (scheduled_at is in the past)
        {
          scheduled_at: { $lt: now },
        },
        // Scheduled rides (show from 15 minutes before to 2 hours ahead)
        {
          scheduled_at: {
            $gte: fifteenMinutesAgo,
            $lte: twoHoursLater,
          },
        },
      ],
    })
      .populate("employee_id", "name email contact")
      .populate("office_id", "office_name office_location")
      .lean();

    console.log(`📍 Found ${allPendingRides.length} pending rides matching time criteria`);

    if (allPendingRides.length > 0) {
      allPendingRides.forEach(ride => {
        console.log(`  - Ride ${ride._id}: scheduled_at=${ride.scheduled_at.toISOString()}, pickup=[${ride.pickup_location.coordinates}]`);
      });
    }

    // Helper function to calculate distance between two coordinates (Haversine formula)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Earth's radius in kilometers
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = R * c;
      return distanceKm;
    };

    // Filter rides within 3 km
    const nearbyRides = allPendingRides.filter((ride) => {
      if (!ride.pickup_location || !ride.pickup_location.coordinates || ride.pickup_location.coordinates.length < 2) {
        console.warn(`⚠️ Ride ${ride._id} has invalid pickup_location:`, ride.pickup_location);
        return false;
      }

      // Coordinates in database should be [longitude, latitude]
      const [pickupLng, pickupLat] = ride.pickup_location.coordinates;

      const distanceKm = calculateDistance(driverLat, driverLng, pickupLat, pickupLng);

      console.log(`📌 Ride ${ride._id}: Distance = ${distanceKm.toFixed(2)} km, Pickup: [${pickupLat}, ${pickupLng}]`);

      // Return true if distance is less than 3 km
      return distanceKm <= 3;
    });

    console.log(`✅ Found ${nearbyRides.length} rides within 3 km`);

    if (nearbyRides.length === 0) {
      return res.status(200).json(new ApiResponse(200, "No pending rides available nearby", null));
    }

    // Return the first ride (sorted by scheduled_at)
    const closestRide = nearbyRides.sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : now.getTime();
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : now.getTime();
      return aTime - bTime;
    })[0];

    console.log(`🎯 Sending ride ${closestRide._id} to driver`);

    res.status(200).json(new ApiResponse(200, "Pending rides retrieved successfully", closestRide));
  } catch (e) {
    console.error("❌ Error in getPendingRides:", e);
    next(e);
  }
};