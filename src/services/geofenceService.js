const { Geofence } = require("../models");

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const pointInPolygon = (lat, lng, polygon) => {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat ?? polygon[i][1];
    const yi = polygon[i].lng ?? polygon[i][0];
    const xj = polygon[j].lat ?? polygon[j][1];
    const yj = polygon[j].lng ?? polygon[j][0];
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const isPointInsideGeofence = (fence, latitude, longitude) => {
  if (fence.fence_type === "circle") {
    const km = calculateDistance(
      latitude,
      longitude,
      parseFloat(fence.center_latitude),
      parseFloat(fence.center_longitude)
    );
    return km <= (fence.radius_meters || 0) / 1000;
  }

  if (fence.fence_type === "polygon" && fence.polygon_coordinates) {
    return pointInPolygon(latitude, longitude, fence.polygon_coordinates);
  }

  if (fence.fence_type === "route" && fence.route_coordinates?.length >= 2) {
    const route = fence.route_coordinates;
    for (let i = 0; i < route.length - 1; i++) {
      const d = calculateDistance(
        latitude,
        longitude,
        route[i].lat ?? route[i][1],
        route[i].lng ?? route[i][0]
      );
      if (d <= (fence.radius_meters || 200) / 1000) return true;
    }
    return false;
  }

  return false;
};

const checkPointForEnterprise = async (enterpriseId, latitude, longitude, action) => {
  if (!enterpriseId) {
    return { valid: true, reason: "No enterprise geofences" };
  }

  const geofences = await Geofence.findAll({
    where: { enterprise_id: enterpriseId, is_active: true },
  });

  if (geofences.length === 0) {
    return { valid: true, reason: "No geofence restrictions" };
  }

  let insideAny = false;
  for (const fence of geofences) {
    if (isPointInsideGeofence(fence, latitude, longitude)) {
      insideAny = true;
      const allowed = fence.allowed_actions || [];
      if (allowed.length > 0 && !allowed.includes(action)) {
        return {
          valid: false,
          reason: `Action ${action} not allowed in geofence ${fence.name}`,
        };
      }
      return { valid: true, reason: `Within geofence ${fence.name}` };
    }
  }

  if (!insideAny) {
    return { valid: true, reason: "Outside all geofences (allowed)" };
  }

  return { valid: true, reason: "Geofence check passed" };
};

const checkPointInGeofenceById = async (geofenceId, latitude, longitude) => {
  const fence = await Geofence.findByPk(geofenceId);
  if (!fence) return { inside: false, message: "Geofence not found" };
  const inside = isPointInsideGeofence(fence, latitude, longitude);
  return {
    inside,
    geofence_id: fence.id,
    geofence_name: fence.name,
    message: inside ? `Point is inside ${fence.name}` : `Point is outside ${fence.name}`,
  };
};

module.exports = {
  isPointInsideGeofence,
  checkPointForEnterprise,
  checkPointInGeofenceById,
  calculateDistance,
};
