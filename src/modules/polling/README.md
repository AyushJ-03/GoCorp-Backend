# Ride Polling/Clustering System

A sophisticated employee ride-pooling system that intelligently clusters ride requests into batches of up to 4 passengers for optimal car utilization in your employee cab management application.

## System Overview

The system consists of three progressive stages:

1. **RideRequest** - Individual ride requests made by employees
2. **Clustering** - Intermediate stage where compatible rides are grouped together
3. **Batched** - Final grouped rides (max 4 per batch) ready for driver assignment

## Core Components

### Models

#### RideRequest
Located in: `src/modules/ride/ride.model.js`

Existing model that tracks individual ride requests with fields:
- `employee_id` - Employee making the request
- `office_id` - Office location
- `pickup_location` - Pickup coordinates (GeoJSON Point)
- `drop_location` - Drop coordinates (GeoJSON Point)
- `scheduled_at` - Scheduled time
- `invited_employee_ids` - Array of invited employees (max 3, so max 4 total with requester)
- `solo_preference` - Boolean flag for solo ride requests
- `status` - Ride status (PENDING, IN_CLUSTERING, CLUSTERED, BOOKED_SOLO, etc.)

#### Clustering
Located in: `src/modules/polling/clustering.model.js`

Intermediate stage model:
- `office_id` - Office reference
- `scheduled_at` - Scheduled time
- `ride_ids` - Array of ride requests in this cluster (max 4)
- `current_size` - Current number of people in cluster
- `pickup_polyline` - Route polyline for the cluster
- `pickup_centroid` - Center point of all pickups
- `drop_location` - Common drop location
- `status` - IN_CLUSTERING, READY_FOR_BATCH, or BATCHED
- `metadata` - Force batch info and merge history

#### Batched
Located in: `src/modules/polling/batched.model.js`

Final stage model ready for driver assignment:
- `office_id` - Office reference
- `scheduled_at` - Scheduled time
- `ride_ids` - Array of rides in batch (1-4)
- `batch_size` - Number of people
- `driver_id` - Assigned driver
- `status` - From CREATED to COMPLETED
- `metadata` - Tracks if force-batched and clustering origin

### Clustering Logic

#### Core Algorithm: `can_cluster()`

Located in: `src/modules/polling/polling.service.js`

A ride can cluster with another if **ANY** of these conditions are true:

**Condition 1:** Similar pickup location + similar drop location + within time window
- Pickup locations within 100m of each other
- Drop locations within 100m of each other
- Scheduled times within ±10 minutes

**Condition 2:** New pickup within route buffer + similar drop location + within time window
- Uses two-step optimization:
  - **Step 1 (Pre-filter):** Check bearing similarity (±45°) and bounding box overlap
  - **Step 2 (Full check):** Calculate actual distance from new pickup to existing polyline (within 500m buffer)
- Drop locations within 100m
- Scheduled times within ±10 minutes

#### Optimization: Prioritized Matching

For rides with groups of 2 people, the system prioritizes checking against:
1. Other size-2 clusters first (maximize chance of 4-person batch)
2. Then size-1 clusters

This maximizes batch fill rate.

## Case Handling

The system handles 6 distinct scenarios:

### Case 1: Solo with Solo Preference
```
- Size: 1 person
- Condition: solo_preference = true
- Action: Skip clustering → Direct to Batched
- Result: Solo ride, ready for immediate driver assignment
```

### Case 2: Single Person, No Preference (First Entry)
```
- Size: 1 person
- Condition: solo_preference = false, no existing clusters
- Action: Create new Clustering entry with polyline
- Result: Ride in Clustering stage, waiting for other rides to match
```

### Case 3: Another Single Person, No Preference
```
- Size: 1 person
- Condition: solo_preference = false, existing clusters exist
- Action: Check can_cluster() against all clusters
  - If match found: Merge into cluster
  - If no match: Create new Clustering entry
- Result: Either merged or in own cluster
```

### Case 4: Group of 2 (Requester + 1 Invited)
```
- Size: 2 people
- Condition: invited_employee_ids.length = 1
- Matching priority: Check size-2 clusters first, then size-1
- If merge and total_size = 4: Move to Batched immediately
- Otherwise: Stay in Clustering
```

### Case 5: Group of 3 (Requester + 2 Invited)
```
- Size: 3 people
- Condition: invited_employee_ids.length = 2
- Matching: Check ONLY size-1 clusters
- If merge with size-1: Total = 4 → Move to Batched immediately
- If no match: Create own Clustering entry
```

### Case 6: Group of 4 (Requester + 3 Invited)
```
- Size: 4 people
- Condition: invited_employee_ids.length = 3
- Action: Skip clustering → Direct to Batched
- Result: Full batch ready for driver assignment
```

## Scheduled Jobs

### Force-Batch Job
**Schedule:** Every 1 minute

Checks all clusters in `IN_CLUSTERING` or `READY_FOR_BATCH` status. Any cluster with a scheduled time within 10 minutes is force-moved to `Batched`.

**Purpose:** Ensures rides get batched with sufficient buffer before scheduled time for:
- Driver assignment
- Driver notification
- Driver acceptance/arrival

**Implementation:** `src/modules/polling/polling.jobs.js` → `initForceBatchJob()`

### Cleanup Job
**Schedule:** Every 5 minutes

Finds clusters that have been in `IN_CLUSTERING` for more than 30 minutes and force-batches them.

**Purpose:** Prevents orphaned clusters from blocking the system

**Implementation:** `src/modules/polling/polling.jobs.js` → `initCleanupJob()`

## API Endpoints

All polling endpoints are under `/api/polling`

### 1. Submit Ride for Polling
```
POST /api/polling/submit-ride
Content-Type: application/json

{
  "ride_id": "647d8a9f8c1b4e05a8b3c9d2"
}

Response:
{
  "statusCode": 200,
  "message": "Ride routed successfully via Case 4",
  "data": {
    "ride_id": "647d8a9f8c1b4e05a8b3c9d2",
    "case": 4,
    "cluster_id": "647d8a9f8c1b4e05a8b3c9d3",
    "action": "merged",
    "cluster_details": {
      "cluster_id": "647d8a9f8c1b4e05a8b3c9d3",
      "size": 2,
      "status": "IN_CLUSTERING"
    }
  }
}
```

### 2. Get Ride Clustering Status
```
GET /api/polling/ride-status/:ride_id

Response:
{
  "statusCode": 200,
  "message": "Ride clustering status retrieved",
  "data": {
    "ride_id": "647d8a9f8c1b4e05a8b3c9d2",
    "ride_status": "IN_CLUSTERING",
    "cluster_id": "647d8a9f8c1b4e05a8b3c9d3",
    "cluster_size": 2,
    "cluster_status": "IN_CLUSTERING",
    "cluster_rides": ["647d8a9f8c1b4e05a8b3c9d2", "647d8a9f8c1b4e05a8b3c9d4"]
  }
}
```

### 3. Get Clusters by Office and Time
```
GET /api/polling/clusters?office_id=647d8a9f8c1b4e05a8b3c9d5&scheduled_at=2024-01-15T09:00:00Z

Response:
{
  "statusCode": 200,
  "message": "Clusters retrieved",
  "data": {
    "total": 3,
    "active": 2,
    "ready_for_batch": 1,
    "clusters": [
      {
        "cluster_id": "647d8a9f8c1b4e05a8b3c9d3",
        "size": 2,
        "status": "IN_CLUSTERING",
        "ride_count": 2,
        "scheduled_at": "2024-01-15T09:00:00Z"
      },
      ...
    ]
  }
}
```

### 4. Get Batches by Office and Time
```
GET /api/polling/batches?office_id=647d8a9f8c1b4e05a8b3c9d5&scheduled_at=2024-01-15T09:00:00Z&status=CREATED

Response:
{
  "statusCode": 200,
  "message": "Batches retrieved",
  "data": {
    "total": 2,
    "batches": [
      {
        "batch_id": "647d8a9f8c1b4e05a8b3c9d6",
        "size": 4,
        "status": "CREATED",
        "ride_ids": ["647d8a9f...", "647d8a9f...", ...],
        "driver_assigned": false,
        "force_batched": false
      },
      ...
    ]
  }
}
```

### 5. Get Cluster Details
```
GET /api/polling/cluster/:cluster_id

Response:
{
  "statusCode": 200,
  "message": "Cluster details retrieved",
  "data": {
    "cluster_id": "647d8a9f8c1b4e05a8b3c9d3",
    "size": 3,
    "status": "READY_FOR_BATCH",
    "rides": [...],
    "metadata": {
      "merge_events": [
        {"merged_at": "2024-01-15T08:55:00Z", "new_size": 2},
        {"merged_at": "2024-01-15T08:57:00Z", "new_size": 3}
      ]
    }
  }
}
```

### 6. Get Batch Details
```
GET /api/polling/batch/:batch_id

Response:
{
  "statusCode": 200,
  "message": "Batch details retrieved",
  "data": {
    "batch_id": "647d8a9f8c1b4e05a8b3c9d6",
    "size": 4,
    "status": "CREATED",
    "rides": [...],
    "driver": null,
    "batched_at": "2024-01-15T09:05:00Z",
    "metadata": {
      "force_batched": false,
      "clustering_id": "647d8a9f8c1b4e05a8b3c9d3"
    }
  }
}
```

### 7. Get Polling Statistics
```
GET /api/polling/stats?office_id=647d8a9f8c1b4e05a8b3c9d5&date=2024-01-15

Response:
{
  "statusCode": 200,
  "message": "Polling statistics retrieved",
  "data": {
    "date": "2024-01-15",
    "clustering": [
      {"_id": "IN_CLUSTERING", "count": 2, "total_people": 3},
      {"_id": "READY_FOR_BATCH", "count": 1, "total_people": 4},
      {"_id": "BATCHED", "count": 5, "total_people": 18}
    ],
    "batched": [
      {"_id": "CREATED", "count": 5, "total_people": 18},
      {"_id": "COMPLETED", "count": 8, "total_people": 28}
    ]
  }
}
```

## Integration with Existing System

### User & Auth Integration
- Uses existing `authUser` middleware for protected endpoints
- Integrates with existing User model and authentication system
- All operations track `employee_id` and maintain audit trails

### Database Integration
- Uses same MongoDB connection
- Follows existing Mongoose schema patterns
- Maintains proper indexes for performance
- Uses existing geospatial query support

### Response Format
- Follows existing `ApiResponse` and `ApiError` utility classes
- Consistent error handling across all endpoints
- Proper HTTP status codes and error messages

## Usage Flow

### 1. Employee Requests a Ride
```javascript
// In existing ride booking flow, create RideRequest with status: "PENDING"
const ride = await RideRequest.create({
  employee_id: "...",
  office_id: "...",
  scheduled_at: "...",
  pickup_location: {...},
  drop_location: {...},
  solo_preference: false,
  invited_employee_ids: ["emp1", "emp2"], // Optional group
  status: "PENDING"
});
```

### 2. Submit to Polling System
```javascript
// After booking is confirmed, send to polling
const response = await fetch('/api/polling/submit-ride', {
  method: 'POST',
  body: JSON.stringify({ ride_id: ride._id })
});

// Response tells you:
// - Which case was handled (1-6)
// - Cluster or Batch ID (depending on case)
// - Current status
```

### 3. Monitor Status
```javascript
// Check status anytime
const status = await fetch(`/api/polling/ride-status/${ride._id}`);

// Get cluster info
const clusters = await fetch(
  `/api/polling/clusters?office_id=${officeId}&scheduled_at=${scheduledTime}`
);

// Get batch info
const batches = await fetch(
  `/api/polling/batches?office_id=${officeId}&scheduled_at=${scheduledTime}`
);
```

### 4. Scheduled Jobs Handle Time Management
```
Every 1 minute: Force-batch clusters within 10 minutes of scheduled time
Every 5 minutes: Clean up orphaned clusters older than 30 minutes
```

The system automatically moves rides to appropriate stage based on:
- Time/location compatibility
- Group size constraints
- Maximum batch size (4 people)
- Scheduled time windows

## Key Features

✅ **Intelligent Clustering** - Multi-condition matching with optimization
✅ **Smart Time Management** - Automatic force-batching before schedule time
✅ **Group Support** - Handles solo rides and groups up to 4
✅ **Route Optimization** - Two-step polyline checking for efficiency
✅ **Audit Trail** - Tracks merge events and clustering decisions
✅ **Scalable** - Proper indexes and efficient queries
✅ **Well Integrated** - Follows existing code patterns and conventions
✅ **Production Ready** - Error handling, validation, logging

## File Structure

```
src/modules/polling/
├── clustering.model.js        # Clustering intermediate stage model
├── batched.model.js           # Batched final stage model
├── polling.service.js         # Core clustering logic and case handlers
├── polling.controller.js       # API endpoint handlers
├── polling.routes.js          # Route definitions
├── polling.jobs.js            # Scheduled jobs (force-batch, cleanup)
└── README.md                  # This file
```

## Backend Only Rules

⚠️ **Backend Validation**: The system enforces that a ride request group size (requester + invited) never exceeds 4, regardless of frontend. Frontend validation is for UX only.

```javascript
// This is enforced in RideRequest model validation:
invited_employee_ids: {
  validate: {
    validator: function(v) {
      return v.length <= 3; // Max 3 invited + 1 requester = 4
    }
  }
}
```

## Performance Considerations

- Clustering queries use indexes on `office_id`, `scheduled_at`, and `status`
- Geospatial queries use `2dsphere` indexes on location coordinates
- Force-batch job runs minimally (1 min) but efficiently queries only active clusters
- Cleanup job runs every 5 minutes to prevent orphaned clusters
- All polyline operations use @turf/turf library (optimized geospatial calculations)

## Future Enhancements

- Real-time WebSocket updates for cluster changes
- Dynamic time window adjustment based on traffic
- ML-based route optimization
- Historical analytics on clustering efficiency
- A/B testing for clustering parameters
- Integration with OSRM for actual route calculations
