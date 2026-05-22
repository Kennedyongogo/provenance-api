const { ProvenanceEvent } = require("../models");
const { Op } = require("sequelize");
const geofenceService = require("./geofenceService");

const MAX_SPEED_KMPH = 120;

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

const validateMovement = (lastEvent, latitude, longitude, currentTime = new Date()) => {
  if (!lastEvent) return { valid: true, reason: "First event", trustDelta: 0 };

  const distance = calculateDistance(
    parseFloat(lastEvent.latitude),
    parseFloat(lastEvent.longitude),
    latitude,
    longitude
  );
  const timeDiffHours =
    (new Date(currentTime) - new Date(lastEvent.createdAt)) / (1000 * 60 * 60);

  if (timeDiffHours > 0 && distance / timeDiffHours > MAX_SPEED_KMPH * 1.2) {
    return {
      valid: false,
      reason: `Impossible movement: ${distance.toFixed(1)}km in ${timeDiffHours.toFixed(2)} hours`,
      trustDelta: -100,
    };
  }

  return {
    valid: true,
    reason: `Movement validated (${distance.toFixed(1)}km)`,
    trustDelta: 0,
  };
};

// Rough MCC → country region check (extend with real DB later)
const MCC_REGION = {
  310: "US",
  311: "US",
  312: "US",
  313: "US",
  316: "US",
  208: "FR",
  234: "GB",
  404: "IN",
  732: "CO",
};

const inferRegionFromCoordinates = (lat, lng) => {
  if (lat >= 24 && lat <= 49 && lng >= -125 && lng <= -66) return "US";
  if (lat >= 41 && lat <= 51 && lng >= -5 && lng <= 10) return "GB";
  if (lat >= -4 && lat <= 13 && lng >= -79 && lng <= -66) return "CO";
  if (lat >= 41 && lat <= 51 && lng >= 1 && lng <= 10) return "FR";
  return "UNKNOWN";
};

const validateCellTowers = (latitude, longitude, cellTowers) => {
  if (!cellTowers || !Array.isArray(cellTowers) || cellTowers.length === 0) {
    return { valid: true, reason: "No cell tower data provided", trustDelta: -10 };
  }

  const gpsRegion = inferRegionFromCoordinates(latitude, longitude);
  const towerRegions = cellTowers
    .map((t) => MCC_REGION[t.mcc])
    .filter(Boolean);

  if (towerRegions.length === 0) {
    return { valid: true, reason: "Cell towers present (MCC unmapped)", trustDelta: 0 };
  }

  const mismatch = towerRegions.some((r) => r !== gpsRegion && gpsRegion !== "UNKNOWN");
  if (mismatch) {
    return {
      valid: false,
      reason: `GPS region (${gpsRegion}) does not match cell tower MCC regions (${towerRegions.join(", ")})`,
      trustDelta: -50,
    };
  }

  return { valid: true, reason: "Cell tower fingerprint matches GPS region", trustDelta: 0 };
};

const checkDuplicateScan = async (product_id, user_id, latitude, longitude, transaction) => {
  const duplicate = await ProvenanceEvent.findOne({
    where: {
      product_id,
      user_id,
      createdAt: { [Op.gte]: new Date(Date.now() - 60000) },
      latitude: { [Op.between]: [latitude - 0.0001, latitude + 0.0001] },
      longitude: { [Op.between]: [longitude - 0.0001, longitude + 0.0001] },
    },
    transaction,
  });

  if (duplicate) {
    return {
      valid: false,
      reason: "Duplicate scan detected within 1 minute",
      trustDelta: -100,
    };
  }

  return { valid: true, reason: "No duplicate scan", trustDelta: 0 };
};

const runAllChecks = async ({
  lastEvent,
  latitude,
  longitude,
  action,
  enterpriseId,
  product_id,
  user_id,
  cell_tower_fingerprint,
  transaction,
}) => {
  const notes = [];
  let trustScore = 100;

  const movement = validateMovement(lastEvent, latitude, longitude);
  if (!movement.valid) {
    notes.push(movement.reason);
    trustScore += movement.trustDelta;
  }

  const geofence = await geofenceService.checkPointForEnterprise(
    enterpriseId,
    latitude,
    longitude,
    action
  );
  if (!geofence.valid) {
    notes.push(geofence.reason);
    trustScore -= 30;
  } else if (geofence.reason) {
    notes.push(geofence.reason);
  }

  const duplicate = await checkDuplicateScan(
    product_id,
    user_id,
    latitude,
    longitude,
    transaction
  );
  if (!duplicate.valid) {
    notes.push(duplicate.reason);
    trustScore += duplicate.trustDelta;
  }

  const cellTower = validateCellTowers(latitude, longitude, cell_tower_fingerprint);
  if (!cellTower.valid) {
    notes.push(cellTower.reason);
    trustScore += cellTower.trustDelta;
  } else if (cellTower.trustDelta) {
    trustScore += cellTower.trustDelta;
  }

  trustScore = Math.max(0, Math.min(100, trustScore));

  return {
    is_verified: trustScore >= 70,
    trust_score: trustScore,
    verification_notes: notes.join("; ") || "All checks passed",
    flags: notes,
  };
};

module.exports = {
  calculateDistance,
  validateMovement,
  validateCellTowers,
  checkDuplicateScan,
  runAllChecks,
};
