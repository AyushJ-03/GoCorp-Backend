# 📍 Polling System - File Navigation Map

## 📂 Main Implementation Folder
**Location:** `src/modules/polling/`

Contains all polling system code and documentation.

---

## 📚 Documentation (Read These!)

### START HERE
**→ [README.md](src/modules/polling/README.md)** - Main System Documentation
- System architecture and overview
- 3-stage process explanation
- All 6 cases detailed
- Core algorithms explained
- Complete API documentation with examples
- Integration overview
- Best practices
- **Read this to understand how the system works**

### FOR INTEGRATION
**→ [INTEGRATION.md](src/modules/polling/INTEGRATION.md)** - How to Use This System
- Quick start guide
- Add to your ride booking flow
- Query polling data
- Database optimization
- Error handling patterns
- Testing examples (unit + API)
- Migration guide
- Troubleshooting
- **Read this to integrate with your existing code**

### FOR REFERENCE
**→ [QUICK_REFERENCE.md](src/modules/polling/QUICK_REFERENCE.md)** - Quick Lookup
- TL;DR overview
- System architecture diagram
- All 6 cases summary table
- API endpoints cheat sheet
- Common Q&A
- Debug commands
- **Read this for quick answers**

### FOR TECHNICAL DETAILS
**→ [IMPLEMENTATION_SUMMARY.md](src/modules/polling/IMPLEMENTATION_SUMMARY.md)** - What Was Built
- Complete checklist of deliverables
- Database schema details
- Model field documentation
- Implementation notes
- Performance considerations
- Security notes
- Testing checklist
- **Read this for detailed technical info**

---

## 💾 Database Models

### [clustering.model.js](src/modules/polling/clustering.model.js)
Mongoose schema for intermediate clustering stage
- **Collection name:** `clusterings`
- **Purpose:** Groups rides being assembled together
- **Max size:** 4 rides/people
- **Key fields:** ride_ids, current_size, pickup_polyline, drop_location
- **Status:** IN_CLUSTERING → READY_FOR_BATCH → BATCHED
- **Indexes:** office_id+scheduled_at+status, 2dsphere on pickup_location

### [batched.model.js](src/modules/polling/batched.model.js)
Mongoose schema for final batch stage
- **Collection name:** `batcheds`
- **Purpose:** Final grouped rides ready for driver assignment
- **Size:** 1-4 rides/people
- **Key fields:** ride_ids, batch_size, driver_id, status
- **Status:** CREATED → ASSIGNED → COMPLETED
- **Indexes:** office_id+scheduled_at+status, driver_id+status

---

## ⚙️ Core Logic

### [polling.service.js](src/modules/polling/polling.service.js) - THE BRAIN
Most important file! Contains all core clustering logic.

**Main Functions:**
- `can_cluster()` - Check if two rides can cluster together (2-step algorithm)
- `findBestCluster()` - Find best matching cluster for a ride
- `routeRideRequest()` - Route a ride through the 6-case system

**Case Handlers:**
- `handleCase1_SoloPreference()` - Solo + solo_preference=true → Batch
- `handleCase2_SinglePersonNoClustering()` - Solo first entry → Clustering
- `handleCase3_AnotherSinglePerson()` - Solo matching existing clusters
- `handleCase4_GroupSize2()` - Group of 2 → Match or cluster
- `handleCase5_GroupSize3()` - Group of 3 → Match size-1 only
- `handleCase6_GroupSize4()` - Group of 4 → Batch

**Helper Functions:**
- `can_cluster()` - Main clustering logic with 2-step polyline check
- `checkBearingAndBoundingBox()` - Pre-filter optimization
- `checkPolylineRouteBuffer()` - Full polyline distance check
- `mergeClusters()` - Merge ride into cluster
- `moveToBatched()` - Move cluster to batched stage
- `isWithinTimeWindow()` - Check time compatibility
- `isSimilarDropLocation()` - Check drop location similarity
- `isSimilarPickupLocation()` - Check pickup location similarity

---

## 🎮 API Implementation

### [polling.controller.js](src/modules/polling/polling.controller.js)
HTTP request handlers for all API endpoints

**Handlers:**
- `submitRideForPolling()` - POST submit-ride
- `getRideClusteringStatus()` - GET ride-status/:ride_id
- `getClustersByOfficeAndTime()` - GET clusters
- `getBatchesByOfficeAndTime()` - GET batches
- `getClusterDetails()` - GET cluster/:cluster_id
- `getBatchDetails()` - GET batch/:batch_id
- `getPollingStats()` - GET stats

### [polling.routes.js](src/modules/polling/polling.routes.js)
Route definitions and validation

**Routes:**
- POST /submit-ride
- GET /ride-status/:ride_id
- GET /clusters
- GET /batches
- GET /cluster/:cluster_id
- GET /batch/:batch_id
- GET /stats

All routes include express-validator validation for inputs.

---

## 🕐 Scheduled Jobs

### [polling.jobs.js](src/modules/polling/polling.jobs.js)
Automatically running background jobs

**Jobs:**
- `initForceBatchJob()` - Every 1 minute
  - Moves clusters within 10min of schedule time to Batched
  - Ensures timing buffer for driver notification

- `initCleanupJob()` - Every 5 minutes
  - Removes orphaned clusters >30 min old
  - Prevents system blocking

**How to initialize:**
```javascript
import { initForceBatchJob, initCleanupJob } from './polling/polling.jobs.js';
initForceBatchJob();
initCleanupJob();
```

---

## 📦 Utilities

### [index.js](src/modules/polling/index.js)
Centralized export index for easy importing

**What it exports:**
- Models: `Clustering`, `Batched`
- Main functions: `can_cluster`, `findBestCluster`, `routeRideRequest`, `moveToBatched`, `mergeClusters`
- Case handlers: All 6 case functions
- Helper functions: Validation and check functions
- Scheduled jobs: `initForceBatchJob`, `initCleanupJob`
- Constants: `POLLING_CONSTANTS`

**Usage:**
```javascript
import { 
  Clustering, 
  routeRideRequest, 
  can_cluster 
} from './modules/polling/index.js';
```

---

## 🔗 Integration Point

### [server.js](server.js) - MODIFIED
Main application entry point (in project root)

**Changes made:**
1. Added import: `import pollingRoutes from "./src/modules/polling/polling.routes.js"`
2. Added import: `import { initForceBatchJob, initCleanupJob } from "./src/modules/polling/polling.jobs.js"`
3. Added route: `app.use("/api/polling", pollingRoutes)`
4. Added job init in DB().then():
   ```javascript
   initForceBatchJob();
   initCleanupJob();
   ```

**Why:** Registers polling API and starts scheduled jobs on server startup.

---

## 📄 Summary Document

### [POLLING_SYSTEM_COMPLETE.md](POLLING_SYSTEM_COMPLETE.md)
(In project root)

Executive summary of entire implementation:
- What was built
- File structure
- How to use
- Key features
- Performance notes
- Next steps

---

## 🗺️ Quick Navigation by Task

### "I want to understand how clustering works"
1. Read: [README.md](src/modules/polling/README.md) - System Overview section
2. Read: [polling.service.js](src/modules/polling/polling.service.js) - see can_cluster()
3. Read: [QUICK_REFERENCE.md](src/modules/polling/QUICK_REFERENCE.md) - The 6 Cases

### "I want to integrate this into my app"
1. Read: [INTEGRATION.md](src/modules/polling/INTEGRATION.md) - Quick Start
2. Read: [INTEGRATION.md](src/modules/polling/INTEGRATION.md) - Using in Ride Booking Flow
3. Copy code example from INTEGRATION.md into your ride controller

### "I want to test the API"
1. Read: [QUICK_REFERENCE.md](src/modules/polling/QUICK_REFERENCE.md)
2. Use the endpoint examples in QUICK_REFERENCE.md
3. Read: [INTEGRATION.md](src/modules/polling/INTEGRATION.md) - Testing section

### "I want to understand the database schema"
1. Read: [clustering.model.js](src/modules/polling/clustering.model.js)
2. Read: [batched.model.js](src/modules/polling/batched.model.js)
3. Read: [IMPLEMENTATION_SUMMARY.md](src/modules/polling/IMPLEMENTATION_SUMMARY.md) - Database Schema Details

### "I want to monitor what's happening"
1. Read: [QUICK_REFERENCE.md](src/modules/polling/QUICK_REFERENCE.md) - Monitoring section
2. Use: `/api/polling/stats` endpoint
3. Check server logs for job messages

### "Something isn't working"
1. Read: [INTEGRATION.md](src/modules/polling/INTEGRATION.md) - Troubleshooting
2. Check server logs
3. Query database directly per INTEGRATION.md instructions

---

## 📊 File Sizes & Complexity

| File | Lines | Complexity | Purpose |
|------|-------|-----------|---------|
| polling.service.js | ~500 | High | Core algorithm (most important) |
| clustering.model.js | ~80 | Low | Database schema |
| batched.model.js | ~70 | Low | Database schema |
| polling.controller.js | ~200 | Medium | API handlers |
| polling.routes.js | ~80 | Low | Route definitions |
| polling.jobs.js | ~90 | Medium | Scheduled jobs |
| README.md | ~800 | Low | Documentation |
| INTEGRATION.md | ~600 | Low | Documentation |

---

## 🚀 To Get Started

1. **Understand the system:** Read README.md
2. **Test it:** Use API endpoints (see QUICK_REFERENCE.md)
3. **Integrate it:** Follow INTEGRATION.md
4. **Monitor it:** Use /api/polling/stats endpoint
5. **Deploy it:** No changes needed, just start server

---

## 📞 File Dependencies

```
polling.service.js
├── clustering.model.js (import)
├── batched.model.js (import)
├── ride.model.js (import)
├── ride.service.js (import for getEmployeesInRideGroup)
├── geo.js (import for getDistance)
├── @turf/turf (import for polyline ops)
└── ApiError.js (import)

polling.controller.js
├── polling.service.js (import)
├── clustering.model.js (import)
├── batched.model.js (import)
├── ApiResponse.js (import)
└── ApiError.js (import)

polling.routes.js
├── polling.controller.js (import)
└── auth middleware (import)

polling.jobs.js
├── clustering.model.js (import)
├── batched.model.js (import)
├── ride.model.js (import)
├── polling.service.js (import)
└── node-cron (import)

server.js
├── polling.routes.js (import)
└── polling.jobs.js (import)
```

---

## ✅ Deployment Checklist

- [ ] Verify all files exist in `src/modules/polling/`
- [ ] Verify server.js has polling imports and routes
- [ ] Start server and check logs for job initialization
- [ ] Test health endpoint: `GET /api/health`
- [ ] Create a test ride and submit it: `POST /api/polling/submit-ride`
- [ ] Check ride status: `GET /api/polling/ride-status/:ride_id`
- [ ] Verify database collections created: `mongosh`
- [ ] Monitor logs for scheduled job execution

---

**Ready to begin?** → Start with [README.md](src/modules/polling/README.md)
