# Polling System Integration Guide

This guide explains how to integrate the new ride polling/clustering system with your existing codebase.

## Quick Start

### 1. Automatic Integration (Already Done)

The following have been automatically integrated into your server:

- ✅ Polling routes registered at `/api/polling`
- ✅ Scheduled jobs initialized on server startup
- ✅ All models and dependencies imported

### 2. Using in Your Ride Booking Flow

Modify your ride booking workflow to submit confirmed rides to polling:

```javascript
// In your ride booking controller (e.g., ride.controller.js)
import { routeRideRequest } from '../polling/index.js';

export const bookRide = async (req, res, next) => {
  try {
    // ... existing validation code ...
    
    // Create the ride request (existing code)
    const ride = await RideRequest.create({
      employee_id,
      office_id,
      // ... other fields
      status: "PENDING", // Important: must be PENDING
    });

    // NEW: Submit to polling system after successful creation
    try {
      const pollingResult = await routeRideRequest(ride);
      
      console.log(`Ride ${ride._id} routed to polling:`);
      console.log(`- Case: ${pollingResult.case}`);
      console.log(`- Cluster: ${pollingResult.cluster_id}`);
      console.log(`- Batch: ${pollingResult.batch_id}`);
      
      // Return to frontend with polling info
      res.status(201).json(
        new ApiResponse(200, "Ride booked and submitted to polling", {
          ride_id: ride._id,
          polling_case: pollingResult.case,
          cluster_id: pollingResult.cluster_id,
          batch_id: pollingResult.batch_id,
        })
      );
    } catch (pollingError) {
      console.error("Error submitting to polling:", pollingError);
      // Don't fail the booking, just log the error
      res.status(201).json(
        new ApiResponse(201, "Ride booked but polling submission failed", {
          ride_id: ride._id,
          error: pollingError.message,
        })
      );
    }
  } catch (error) {
    next(error);
  }
};
```

### 3. Option: Deferred Submission

If you prefer to submit rides to polling separately (e.g., from a separate scheduler or batch process):

```javascript
// API endpoint in your existing ride routes
router.post('/submit-to-polling/:ride_id', authUser, async (req, res, next) => {
  try {
    const ride = await RideRequest.findById(req.params.ride_id);
    if (!ride) throw new ApiError(404, "Ride not found");
    if (ride.status !== "PENDING") throw new ApiError(400, "Ride must be in PENDING status");
    
    const result = await routeRideRequest(ride);
    res.status(200).json(new ApiResponse(200, "Ride submitted to polling", result));
  } catch (error) {
    next(error);
  }
});
```

## Accessing Polling Data

### From Ride Status Endpoint

Enhance your existing ride status endpoint to include polling info:

```javascript
// In ride.controller.js
export const getRideById = async (req, res, next) => {
  try {
    const ride = await RideRequest.findById(req.params.ride_id);
    
    // Existing ride info
    let response = { ride };
    
    // NEW: Add polling info if ride is in clustering/batched
    if (ride.status === 'IN_CLUSTERING') {
      const { Clustering } = await import('../polling/index.js');
      const cluster = await Clustering.findOne({ ride_ids: ride._id });
      response.clustering = {
        cluster_id: cluster._id,
        size: cluster.current_size,
        status: cluster.status,
      };
    }
    
    if (ride.batch_id) {
      const { Batched } = await import('../polling/index.js');
      const batch = await Batched.findById(ride.batch_id);
      response.batch = {
        batch_id: batch._id,
        size: batch.batch_size,
        status: batch.status,
        driver_id: batch.driver_id,
      };
    }
    
    res.json(new ApiResponse(200, "Ride retrieved", response));
  } catch (error) {
    next(error);
  }
};
```

### Dashboard Queries

Get polling statistics for your admin dashboard:

```javascript
// In your admin routes/controller
import axios from 'axios';

async function getPollingStats(officeId, date) {
  const response = await axios.get(
    `/api/polling/stats?office_id=${officeId}&date=${date}`
  );
  return response.data.data;
}

// Usage
const stats = await getPollingStats('office123', '2024-01-15');
console.log(stats.clustering); // Clustering stage stats
console.log(stats.batched);    // Batched stage stats
```

## Monitoring & Logging

### Enable Detailed Logging

The polling system logs all major operations. Monitor the logs:

```
[Force Batch Job] Found 2 cluster(s) to force-batch
[Force Batch Job] Successfully force-batched cluster abc123 to batch def456
[Cleanup Job] Found 1 orphaned cluster(s) older than 30 minutes
```

### Real-time Notifications (Future Enhancement)

When rides are batched or clustered, you may want to notify users:

```javascript
// In polling.service.js, after moveToBatched()
// Add this to emit real-time updates:

import { io } from 'socket.io'; // if using WebSockets

const moveToBatched = async (cluster, forceBatched = false, reason = null) => {
  // ... existing code ...
  
  // After successful batching
  cluster.ride_ids.forEach(rideId => {
    io.to(`ride-${rideId}`).emit('ride-batched', {
      batch_id: batched._id,
      batch_size: batched.batch_size,
    });
  });
};
```

## Database & Performance

### Indexes Created

Polling system automatically uses these indexes:

**Clustering indexes:**
```javascript
// office_id + scheduled_at + status (most common query)
db.clusterings.createIndex({ office_id: 1, scheduled_at: 1, status: 1 })

// Geospatial queries on pickup location
db.clusterings.createIndex({ pickup_location: "2dsphere" })
```

**Batched indexes:**
```javascript
// office_id + scheduled_at + status (most common query)
db.batcheds.createIndex({ office_id: 1, scheduled_at: 1, status: 1 })

// Driver assignment tracking
db.batcheds.createIndex({ driver_id: 1, status: 1 })
```

Monitor with:
```javascript
db.clusterings.getIndexes()
db.batcheds.getIndexes()
```

## Error Handling

The polling system uses your existing ApiError pattern:

```javascript
import ApiError from '../../../utils/ApiError.js';

// Invalid group size
throw new ApiError(400, "Cannot merge: would exceed max cluster size");

// Not found
throw new ApiError(404, "Ride not found");

// Business logic
throw new ApiError(400, "Ride must be in PENDING status");
```

## Testing the System

### Unit Test Example

```javascript
import { can_cluster, routeRideRequest } from '../polling/index.js';

describe('Polling System', () => {
  it('should cluster similar rides', async () => {
    const ride1 = {
      pickup_location: { coordinates: [79.1234, 28.5678] },
      drop_location: { coordinates: [79.5678, 28.9012] },
      scheduled_at: new Date('2024-01-15T09:00:00Z'),
    };
    
    const ride2 = {
      pickup_location: { coordinates: [79.1240, 28.5682] }, // 500m away
      drop_location: { coordinates: [79.5680, 28.9010] },
      scheduled_at: new Date('2024-01-15T09:05:00Z'),
    };
    
    // Should be within similarity threshold
    const result = await can_cluster(ride2, cluster1);
    expect(result).toBe(true);
  });

  it('should handle Case 6: Group of 4', async () => {
    const ride = {
      invited_employee_ids: ['emp1', 'emp2', 'emp3'],
      solo_preference: false,
    };
    
    const result = await routeRideRequest(ride);
    expect(result.case).toBe(6);
    expect(result.batched_id).toBeDefined();
  });
});
```

### Manual Testing via API

```bash
# 1. Check server health
curl http://localhost:5000/api/health

# 2. Submit a ride for polling (after creating a PENDING ride)
curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id": "647d8a9f8c1b4e05a8b3c9d2"}'

# 3. Check ride status
curl http://localhost:5000/api/polling/ride-status/647d8a9f8c1b4e05a8b3c9d2

# 4. Get clusters
curl "http://localhost:5000/api/polling/clusters?office_id=647d8a9f8c1b4e05a8b3c9d5&scheduled_at=2024-01-15T09:00:00Z"

# 5. Get batches
curl "http://localhost:5000/api/polling/batches?office_id=647d8a9f8c1b4e05a8b3c9d5&scheduled_at=2024-01-15T09:00:00Z"
```

## Migration from Existing System

If you have existing ride requests:

```javascript
// Batch process existing PENDING rides
const pendingRides = await RideRequest.find({ status: 'PENDING' });

for (const ride of pendingRides) {
  try {
    const result = await routeRideRequest(ride);
    console.log(`Migrated ride ${ride._id} -> Case ${result.case}`);
  } catch (error) {
    console.error(`Failed to migrate ride ${ride._id}:`, error);
  }
}
```

## Configuration/Tuning

If you need to adjust clustering parameters, modify constants in `polling.service.js`:

```javascript
// Current defaults (can be changed):
const ROUTE_BUFFER_METERS = 500;        // Distance buffer for polyline
const TIME_WINDOW_MINUTES = 10;         // Time window for clustering
const MAX_CLUSTER_SIZE = 4;             // Max people per batch
```

Or make them environment variables:

```javascript
const ROUTE_BUFFER_METERS = parseInt(process.env.POLLING_ROUTE_BUFFER) || 500;
const TIME_WINDOW_MINUTES = parseInt(process.env.POLLING_TIME_WINDOW) || 10;
```

## Backend Validation

The following validations are enforced on the backend:

1. **Max group size**: Never more than 3 invited employees (4 total with requester)
2. **Time window**: Rides must be scheduled within ±10 minutes to cluster
3. **Max batch size**: Never more than 4 people in a batched ride
4. **Route buffer**: New pickup must be within 500m of existing polyline
5. **Force batch**: Any cluster within 10 minutes of schedule time is auto-batched

These cannot be bypassed by frontend - all validated server-side.

## Troubleshooting

### Issue: Rides not clustering

Check:
1. `scheduled_at` is within ±10 minutes
2. Pickup locations are within 100m (or new pickup within 500m of polyline)
3. Drop locations are within 100m
4. Cluster hasn't reached max size (4)
5. Rides have compatible solo_preference settings

### Issue: Force-batch job not running

Check:
1. Server logs for job initialization: `[Force Batch Job] Initialized`
2. Database connection is established
3. Node-cron is installed: `npm list node-cron`

### Issue: Clusters not moving to Batched

Check:
1. `scheduled_at` is within 10 minutes window
2. Cluster status is `IN_CLUSTERING` or `READY_FOR_BATCH`
3. Check server logs for errors during batching

## Support & Debugging

For detailed debugging, enable verbose logging:

```javascript
// In polling.service.js
console.log('DEBUG: Checking cluster for ride', newRide._id);
console.log('DEBUG: can_cluster result:', result);
console.log('DEBUG: Found best cluster:', bestCluster?._id);
```

Monitor database directly:

```javascript
// Check clusters for an office
db.clusterings.find({ office_id: ObjectId('...') }).pretty()

// Check batches in last hour
db.batcheds.find({
  createdAt: { $gte: new Date(Date.now() - 60*60*1000) }
}).pretty()

// Check force-batched records
db.batcheds.find({ 'metadata.force_batched': true }).pretty()
```

## Next Steps

1. ✅ Deploy the code
2. ✅ Test API endpoints
3. ✅ Integrate with existing ride booking flow
4. ✅ Monitor logs and statistics
5. 🔄 Collect feedback and tune clustering parameters
6. 🔄 Add real-time notifications (WebSocket integration)
7. 🔄 Build admin dashboard for monitoring
8. 🔄 Integrate with OSRM for actual route calculations
