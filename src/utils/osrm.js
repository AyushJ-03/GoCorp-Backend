import axios from "axios";

export const getRoute = async (pickup, drop) => {
  try {
    const coords = `${pickup[0]},${pickup[1]};${drop[0]},${drop[1]}`;

    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const res = await axios.get(url);

    return res.data.routes[0].geometry.coordinates;
  } catch (err) {
    console.error("OSRM error:", err.message);
    return [];
  }
};