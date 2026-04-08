/**
 * Calculate distance between two points using Haversine formula
 * @param {[number, number]} point1 [lng, lat]
 * @param {[number, number]} point2 [lng, lat]
 * @returns {number} distance in meters
 */
export function getDistance([lng1, lat1], [lng2, lat2]) {
  const R = 6371e3;

  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaphi = (lat2 - lat1) * Math.PI / 180;
  const deltalamda = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(deltaphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltalamda / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}