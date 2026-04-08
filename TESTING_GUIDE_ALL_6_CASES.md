# 🧪 Complete Testing Guide - All 6 Cases

## ⚠️ Prerequisites

Before testing, you need:
1. ✅ Server running: `npm run dev`
2. ✅ MongoDB connected
3. ✅ At least one office in database
4. ✅ At least one user (employee) in database
5. ✅ Valid coordinates for pickup/drop

**Get office_id and employee_id from database:**
```bash
# In MongoDB terminal
db.offices.findOne().then(o => console.log(o._id))
db.users.find({ role: "EMPLOYEE" }).limit(1).then(u => console.log(u[0]._id))
```

---

## 📋 Test Data Setup

Create consistent test data. Replace EMPLOYEE placeholders:
```javascript
// Use these exact values for all tests
OFFICE_ID = "69c29c588921c5ed33b39a8e"
PICKUP = [77.3255, 28.5706]        // Noida office location
DROP = [77.4000, 28.5000]          // Same drop location for ALL tests

// Replace with your actual employee IDs
EMPLOYEE_1 = "YOUR_EMPLOYEE_1_ID"
EMPLOYEE_2 = "YOUR_EMPLOYEE_2_ID"
EMPLOYEE_3 = "YOUR_EMPLOYEE_3_ID"
EMPLOYEE_4 = "YOUR_EMPLOYEE_4_ID"

// Use current time + 30 minutes for testing
SCHEDULED_TIME = new Date(Date.now() + 30*60*1000).toISOString()
```

---

## 🧪 TEST CASE 1: Solo + Solo Preference

**Scenario:** Employee wants to ride alone (solo_preference = true)
**Expected:** Goes directly to Batched (no clustering)

### Step 1: Create Ride via Existing API
```bash
curl -X POST http://localhost:5000/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "employee_id": "EMPLOYEE_1",
    "office_id": "69c29c588921c5ed33b39a8e",
    "scheduled_at": "2026-04-07T15:30:00Z",
    "pickup_address": "Noida Branch",
    "pickup_location": [77.3255, 28.5706],
    "drop_address": "Drop Location",
    "drop_location": [77.4000, 28.5000],
    "destination_type": "HOME",
    "solo_preference": true,
    "invited_employee_ids": []
  }'
```

**Response:** Copy the `_id` from response

### Step 2: Submit to Polling
```bash
RIDE_ID="<ride_id_from_step_1>"

curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE_ID'"}'
```

### Step 3: Verify Case 1
```bash
✅ Response should show:
{
  "case": 1,
  "batched_id": "some_id",
  "cluster_id": null
}
```

### Step 4: Check Database
```bash
# In MongoDB
db.batcheds.findOne({ _id: ObjectId("batched_id_from_response") })

# Should show:
# - batch_size: 1
# - batch_ids: [your_ride_id]
# - status: "CREATED"
```

---

## 🧪 TEST CASE 2: Solo + No Preference (First Entry)

**Scenario:** First employee requests ride, no preference (willing to share)
**Expected:** Creates Clustering entry with polyline, waits for others

### Step 1: Create Ride
```bash
curl -X POST http://localhost:5000/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "employee_id": "EMPLOYEE_1",
    "office_id": "69c29c588921c5ed33b39a8e",
    "scheduled_at": "2026-04-07T16:00:00Z",
    "pickup_address": "Noida Branch",
    "pickup_location": [77.3255, 28.5706],
    "drop_address": "Drop Location",
    "drop_location": [77.4000, 28.5000],
    "destination_type": "HOME",
    "solo_preference": false,
    "invited_employee_ids": []
  }'
```

### Step 2: Submit to Polling
```bash
RIDE_ID_CASE2="<ride_id>"

curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE_ID_CASE2'"}'
```

### Step 3: Verify Case 2
```bash
✅ Response should show:
{
  "case": 2,
  "cluster_id": "some_id",
  "action": "new_cluster"
}
```

### Step 4: Check Cluster in Database
```bash
# In MongoDB
db.clusterings.findOne({ ride_ids: ObjectId("RIDE_ID_CASE2") })

# Should show:
# - size: 1
# - current_size: 1
# - status: "IN_CLUSTERING"
# - pickup_polyline: { type: "LineString", coordinates: [...] }
```

---

## 🧪 TEST CASE 3: Solo + No Preference (Matching)

**Scenario:** Second solo employee, system tries to cluster with first
**Expected:** Either merges into existing cluster OR creates new cluster

### Step 1: Create Second Solo Ride (Same Time)
```bash
# Use same scheduled_at as Case 2 to be within ±10 min window
curl -X POST http://localhost:5000/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "employee_id": "EMPLOYEE_2",
    "office_id": "69c29c588921c5ed33b39a8e",
    "scheduled_at": "2026-04-07T16:00:00Z",
    "pickup_address": "Noida Branch",
    "pickup_location": [77.3255, 28.5706],
    "drop_address": "Drop Location",
    "drop_location": [77.4000, 28.5000],
    "destination_type": "HOME",
    "solo_preference": false,
    "invited_employee_ids": []
  }'
```

### Step 2: Submit to Polling
```bash
RIDE_ID_CASE3="<ride_id>"

curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE_ID_CASE3'"}'
```

### Step 3: Verify Case 3
```bash
✅ Response should show:
{
  "case": 3,
  "cluster_id": "some_id (could be existing or new)",
  "action": "merged" OR "new_cluster"
}
```

**If merged:** Check existing cluster was updated
```bash
db.clusterings.findOne({ _id: ObjectId("cluster_id_from_response") })
# Should have 2 rides now: ride_ids: [RIDE_ID_CASE2, RIDE_ID_CASE3]
```

**If new cluster:** Check new cluster created
```bash
db.clusterings.find({ status: "IN_CLUSTERING" }).pretty()
# Should see 2 clusters, both size 1
```

---

## 🧪 TEST CASE 4: Group of 2 (Requester + 1 Invited)

**Scenario:** Employee requests ride and invites 1 other (group of 2)
**Expected:** Tries to match size-2 or size-1 clusters, merges or creates new

### Step 1: Create Ride with 1 Invited
```bash
curl -X POST http://localhost:5000/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "employee_id": "EMPLOYEE_3",
    "office_id": "69c29c588921c5ed33b39a8e",
    "scheduled_at": "2026-04-07T16:00:00Z",
    "pickup_address": "Noida Branch",
    "pickup_location": [77.3255, 28.5706],
    "drop_address": "Drop Location",
    "drop_location": [77.4000, 28.5000],
    "destination_type": "HOME",
    "solo_preference": false,
    "invited_employee_ids": ["EMPLOYEE_4"]
  }'
```

### Step 2: Submit to Polling
```bash
RIDE_ID_CASE4="<ride_id>"

curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE_ID_CASE4'"}'
```

### Step 3: Verify Case 4
```bash
✅ Response should show:
{
  "case": 4,
  "cluster_id": "some_id" OR null,
  "batched_id": null OR "some_id",
  "action": "merged" OR "new_cluster"
}
```

**If merged and reached 4:**
```bash
# batched_id should be populated
db.batcheds.findOne({ _id: ObjectId("batched_id") })
# Should show batch_size: 4
```

**If not merged yet:**
```bash
db.clusterings.findOne({ _id: ObjectId("cluster_id") })
# Should show current_size: 2
```

---

## 🧪 TEST CASE 5: Group of 3 (Requester + 2 Invited)

**Scenario:** Employee requests ride and invites 2 others (group of 3)
**Expected:** Only matches against size-1 clusters (to reach exactly 4)

### Step 1: Create Ride with 2 Invited
```bash
curl -X POST http://localhost:5000/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "employee_id": "EMPLOYEE_5",
    "office_id": "69c29c588921c5ed33b39a8e",
    "scheduled_at": "2026-04-07T16:00:00Z",
    "pickup_address": "Noida Branch",
    "pickup_location": [77.3255, 28.5706],
    "drop_address": "Drop Location",
    "drop_location": [77.4000, 28.5000],
    "destination_type": "HOME",
    "solo_preference": false,
    "invited_employee_ids": ["EMPLOYEE_6", "EMPLOYEE_7"]
  }'
```

### Step 2: Submit to Polling
```bash
RIDE_ID_CASE5="<ride_id>"

curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE_ID_CASE5'"}'
```

### Step 3: Verify Case 5
```bash
✅ Response should show:
{
  "case": 5,
  "cluster_id": "some_id" OR null,
  "batched_id": null OR "some_id",
  "action": "merged" OR "new_cluster"
}
```

**If merged (found size-1 cluster):**
```bash
# Should be batched since 3+1=4
db.batcheds.findOne({ _id: ObjectId("batched_id") })
# Should show batch_size: 4
```

**If no match (no size-1 clusters available):**
```bash
db.clusterings.findOne({ _id: ObjectId("cluster_id") })
# Should show current_size: 3
```

---

## 🧪 TEST CASE 6: Group of 4 (Requester + 3 Invited)

**Scenario:** Employee requests ride with 3 others (full group of 4)
**Expected:** Goes directly to Batched (no clustering)

### Step 1: Create Ride with 3 Invited
```bash
curl -X POST http://localhost:5000/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "employee_id": "EMPLOYEE_8",
    "office_id": "69c29c588921c5ed33b39a8e",
    "scheduled_at": "2026-04-07T16:00:00Z",
    "pickup_address": "Noida Branch",
    "pickup_location": [77.3255, 28.5706],
    "drop_address": "Drop Location",
    "drop_location": [77.4000, 28.5000],
    "destination_type": "HOME",
    "solo_preference": false,
    "invited_employee_ids": ["EMPLOYEE_9", "EMPLOYEE_10", "EMPLOYEE_11"]
  }'
```

### Step 2: Submit to Polling
```bash
RIDE_ID_CASE6="<ride_id>"

curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE_ID_CASE6'"}'
```

### Step 3: Verify Case 6
```bash
✅ Response should show:
{
  "case": 6,
  "batched_id": "some_id",
  "cluster_id": null
}
```

### Step 4: Check Database
```bash
db.batcheds.findOne({ _id: ObjectId("batched_id") })
# Should show:
# - batch_size: 4
# - ride_ids: [your_ride_id]
# - status: "CREATED"
```

---

## 🔍 ADVANCED TESTING

### Test Clustering Algorithm (Case 3 Variation)

**Test 1: Locations Too Far Apart**
```bash
# Create ride 1 at location A
PICKUP_A = [79.8855, 28.6139]

# Create ride 2 at location B (20km away - should NOT cluster)
PICKUP_B = [80.2000, 28.4000]

# Both within ±10 minutes, similar drop, but pickup too far
# Expected: case 3 with action: "new_cluster"
```

**Test 2: Time Window Too Large**
```bash
# Create ride 1 scheduled at 16:00
SCHEDULED_1 = "2026-04-07T16:00:00Z"

# Create ride 2 scheduled at 16:30 (30 min apart, outside ±10 min window)
SCHEDULED_2 = "2026-04-07T16:30:00Z"

# Expected: case 3 with action: "new_cluster"
```

**Test 3: Drop Locations Different**
```bash
# Create ride 1 dropping at location D1
DROP_1 = [79.9500, 28.5500]

# Create ride 2 dropping at location D2 (10km away - different)
DROP_2 = [80.1500, 28.4500]

# Same pickup, within time window, but drop too different
# Expected: case 3 with action: "new_cluster"
```

---

## 📊 QUERY RESULTS AFTER TESTING

### View All Clusters for a Time
```bash
curl "http://localhost:5000/api/polling/clusters?office_id=OFFICE_ID&scheduled_at=2026-04-07T16:00:00Z"

# Response shows all clusters at that time with sizes
```

### View All Batches for a Time
```bash
curl "http://localhost:5000/api/polling/batches?office_id=OFFICE_ID&scheduled_at=2026-04-07T16:00:00Z"

# Response shows all batches ready for drivers
```

### Get Statistics
```bash
curl "http://localhost:5000/api/polling/stats?office_id=OFFICE_ID&date=2026-04-07"

# Shows breakdown of clustering vs batched
```

### Check Individual Ride Status
```bash
curl "http://localhost:5000/api/polling/ride-status/RIDE_ID"

# Shows current status: IN_CLUSTERING, CLUSTERED, or BOOKED_SOLO
```

---

## 🧬 FORCE-BATCH JOB TEST

### Test: Auto-Batch Within 10 Minutes of Schedule Time

**Setup:**
```bash
# Create a ride scheduled 5 minutes from now
NOW = Date.now()
SCHEDULED_IN_5_MIN = new Date(NOW + 5*60*1000).toISOString()

# Submit it
curl -X POST http://localhost:5000/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"RIDE_ID"}'
```

**Observe:**
```bash
# Watch server logs:
# Within 1 minute, you should see:
# [Force Batch Job] Found 1 cluster(s) to force-batch
# [Force Batch Job] Successfully force-batched cluster xxx to batch yyy

# Verify in database:
db.batcheds.find({ metadata: { force_batched: true } })
# Should include your cluster
```

---

## ✅ TEST CHECKLIST

Run through this checklist:

### Cases Tested
- [ ] Case 1: Solo + solo_preference ✅
- [ ] Case 2: Solo, first entry ✅
- [ ] Case 3: Solo, matching ✅
- [ ] Case 4: Group of 2 ✅
- [ ] Case 5: Group of 3 ✅
- [ ] Case 6: Group of 4 ✅

### Functionality Tested
- [ ] Clustering merges rides correctly
- [ ] Size validation enforced (max 4)
- [ ] Time window respected (±10 min)
- [ ] Location similarity checked (100m)
- [ ] API endpoints return correct responses
- [ ] Database updates correctly
- [ ] Force-batch job runs (check logs)
- [ ] Cleanup job runs (check logs)

### Edge Cases Tested
- [ ] Locations too far apart
- [ ] Time window exceeded
- [ ] Drop locations different
- [ ] Max cluster size reached
- [ ] Multiple clusters exist
- [ ] Same employee in multiple rides

---

## 🐛 DEBUGGING TIPS

### If Case isn't matching correctly:
```bash
# Check can_cluster logic
# 1. Verify time window: |time1 - time2| <= 600000ms (10 min)
# 2. Verify pickup distance: <= 100m
# 3. Verify drop distance: <= 100m
# 4. Check polyline buffer if applicable
```

### If Ride Status doesn't Update:
```bash
# Check database directly
db.rideRequests.findOne({ _id: ObjectId("RIDE_ID") })

# Should show updated status in response
# If still PENDING, submission didn't work
```

### If Force-Batch Job isn't Running:
```bash
# Check server logs for:
# [Force Batch Job] Initialized - runs every minute

# If not present, jobs weren't initialized
# Check server.js has job init code
```

### Enable Debug Logging:
```javascript
// Add to polling.service.js temporarily:
console.log('DEBUG: Checking cluster for ride', newRide._id);
console.log('DEBUG: can_cluster result:', result);
```

---

## 📝 AUTOMATED TEST SCRIPT

Save this as `test-polling.sh`:

```bash
#!/bin/bash

# Test all 6 cases automatically
BASE_URL="http://localhost:5000"
OFFICE_ID="YOUR_OFFICE_ID"
EMP1="YOUR_EMP_1_ID"
EMP2="YOUR_EMP_2_ID"
EMP3="YOUR_EMP_3_ID"
EMP4="YOUR_EMP_4_ID"

echo "🧪 Testing Case 1: Solo + solo_preference"
RIDE1=$(curl -s -X POST $BASE_URL/api/ride/book-ride \
  -H "Content-Type: application/json" \
  -d '{...}' | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)

curl -s -X POST $BASE_URL/api/polling/submit-ride \
  -H "Content-Type: application/json" \
  -d '{"ride_id":"'$RIDE1'"}' | jq .

echo "✅ Case 1 complete"
# ... repeat for other cases
```

---

## 🎯 SUCCESS CRITERIA

Test is successful when:

✅ Each case returns the correct case number (1-6)
✅ Rides move to correct stage (Clustering or Batched)
✅ Cluster merging works when compatible
✅ Size never exceeds 4
✅ Force-batch job triggers in logs
✅ Database collections updated correctly
✅ API endpoints respond with proper data
✅ Statistics endpoint shows clustering progress

---

**Ready to test?** Start with **Case 1** (simplest), then progress through **Cases 2-6**. Good luck! 🚀
