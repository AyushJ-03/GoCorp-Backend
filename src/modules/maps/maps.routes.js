import { Router } from "express";
import axios from "axios";
import { authUser } from "../../middleware/auth.middleware.js";

const router = Router();

// Simple in-memory cache for geocoding
const reverseCache = new Map();
const searchCache = new Map();
const pendingInbound = new Map(); // Request Coalescing: Track active Nominatim calls
const CACHE_LIMIT = 500;

const cleanupCache = (cacheMap) => {
  if (cacheMap.size > CACHE_LIMIT) {
    const firstKey = cacheMap.keys().next().value;
    cacheMap.delete(firstKey);
  }
};

// Proxy for Reverse Geocoding
router.get("/reverse", authUser, async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
  }

  // Round for cache stability (approx 1m precision)
  const cacheKey = `${parseFloat(lat).toFixed(5)},${parseFloat(lon).toFixed(5)}`;
  
  // 1. Check Cache
  if (reverseCache.has(cacheKey)) {
    return res.json({ success: true, data: reverseCache.get(cacheKey), cached: true });
  }

  // 2. Request Coalescing: Check if a request for these coords is already in-flight
  if (pendingInbound.has(cacheKey)) {
    try {
      const data = await pendingInbound.get(cacheKey);
      return res.json({ success: true, data, cached: true, coalesced: true });
    } catch (err) {
      // If the original request failed, we'll try again below
    }
  }

  // 3. Perform External Request
  const fetchPromise = (async () => {
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
      params: {
        format: 'json',
        lat,
        lon,
        zoom: 18,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'Ride-Dispatch-App/1.0',
        'Accept-Language': 'en'
      }
    });
    return response.data;
  })();

  // Register in pending map
  pendingInbound.set(cacheKey, fetchPromise);

  try {
    const data = await fetchPromise;
    reverseCache.set(cacheKey, data);
    cleanupCache(reverseCache);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Geocoding failed:", error.message);
    res.status(error.response?.status || 500).json({ 
      success: false, 
      message: "Geocoding failed",
      error: error.message 
    });
  } finally {
    // Always remove from pending once finished
    pendingInbound.delete(cacheKey);
  }
});

// Proxy for Search Geocoding
router.get("/search", authUser, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 3) {
    return res.status(400).json({ success: false, message: "Valid search query is required" });
  }

  if (searchCache.has(q.toLowerCase())) {
    return res.json({ success: true, data: searchCache.get(q.toLowerCase()), cached: true });
  }

  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
      params: {
        format: 'json',
        q,
        limit: 5,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'Ride-Dispatch-App/1.0',
        'Accept-Language': 'en'
      }
    });

    searchCache.set(q.toLowerCase(), response.data);
    cleanupCache(searchCache);

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("Search failed:", error.message);
    res.status(error.response?.status || 500).json({ 
      success: false, 
      message: "Search failed",
      error: error.message 
    });
  }
});

export default router;
