import axios from "axios";

export const getRoute = async (points) => {
  try {
    if (!points || points.length < 2) return [];

    const coords = points
      .map((p) => `${p[0]},${p[1]}`)
      .join(";");

    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const res = await axios.get(url);

    if (!res.data.routes || res.data.routes.length === 0) return [];

    return res.data.routes[0].geometry.coordinates;
  } catch (err) {
    console.error("OSRM error:", err.message);
    return [];
  }
};