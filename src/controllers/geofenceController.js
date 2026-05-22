const { Geofence, Enterprise, Alert, sequelize } = require("../models");
const { logCreate, logUpdate, logDelete } = require("../utils/auditLogger");
const { Op } = require("sequelize");

// Haversine distance calculation
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Create geofence
const createGeofence = async (req, res) => {
  try {
    const {
      enterprise_id,
      name,
      fence_type,
      center_latitude,
      center_longitude,
      radius_meters,
      polygon_coordinates,
      route_coordinates,
      allowed_actions,
    } = req.body;

    // Verify enterprise exists
    const enterprise = await Enterprise.findByPk(enterprise_id);
    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    // Validate based on fence type
    if (fence_type === "circle") {
      if (!center_latitude || !center_longitude || !radius_meters) {
        return res.status(400).json({
          success: false,
          message: "Circle geofence requires center_latitude, center_longitude, and radius_meters",
        });
      }
    } else if (fence_type === "polygon") {
      if (!polygon_coordinates || !Array.isArray(polygon_coordinates) || polygon_coordinates.length < 3) {
        return res.status(400).json({
          success: false,
          message: "Polygon geofence requires at least 3 coordinates",
        });
      }
    } else if (fence_type === "route") {
      if (!route_coordinates || !Array.isArray(route_coordinates) || route_coordinates.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Route geofence requires at least 2 coordinates",
        });
      }
    }

    const geofence = await Geofence.create({
      enterprise_id,
      name,
      fence_type,
      center_latitude: center_latitude || null,
      center_longitude: center_longitude || null,
      radius_meters: radius_meters || null,
      polygon_coordinates: polygon_coordinates || null,
      route_coordinates: route_coordinates || null,
      allowed_actions: allowed_actions || ["CREATE", "INSPECT", "STORE"],
      is_active: true,
    });

    await logCreate(
      req.user.id,
      "geofence",
      geofence.id,
      { name, fence_type, enterprise_id },
      req,
      `Created geofence: ${name} for enterprise ${enterprise.name}`
    );

    res.status(201).json({
      success: true,
      message: "Geofence created successfully",
      data: geofence,
    });
  } catch (error) {
    console.error("Error creating geofence:", error);
    res.status(500).json({
      success: false,
      message: "Error creating geofence",
      error: error.message,
    });
  }
};

// Get all geofences
const getAllGeofences = async (req, res) => {
  try {
    const { page = 1, limit = 20, enterprise_id, fence_type, is_active } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (enterprise_id) whereClause.enterprise_id = enterprise_id;
    if (fence_type) whereClause.fence_type = fence_type;
    if (is_active !== undefined) whereClause.is_active = is_active === "true";

    const { count, rows } = await Geofence.findAndCountAll({
      where: whereClause,
      include: [
        { model: Enterprise, as: "enterprise", attributes: ["id", "name", "industry"] },
      ],
      limit: limitNum,
      offset: offset,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching geofences:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching geofences",
      error: error.message,
    });
  }
};

// Get geofence by ID
const getGeofenceById = async (req, res) => {
  try {
    const { id } = req.params;

    const geofence = await Geofence.findByPk(id, {
      include: [
        { model: Enterprise, as: "enterprise", attributes: ["id", "name"] },
      ],
    });

    if (!geofence) {
      return res.status(404).json({
        success: false,
        message: "Geofence not found",
      });
    }

    res.status(200).json({
      success: true,
      data: geofence,
    });
  } catch (error) {
    console.error("Error fetching geofence:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching geofence",
      error: error.message,
    });
  }
};

// Check if a point is inside a geofence
const checkPointInGeofence = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "latitude and longitude are required",
      });
    }

    const geofence = await Geofence.findByPk(id);
    if (!geofence) {
      return res.status(404).json({
        success: false,
        message: "Geofence not found",
      });
    }

    let isInside = false;
    let distanceToCenter = null;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (geofence.fence_type === "circle") {
      distanceToCenter = calculateDistance(
        lat,
        lng,
        parseFloat(geofence.center_latitude),
        parseFloat(geofence.center_longitude)
      ) * 1000; // Convert to meters
      
      isInside = distanceToCenter <= geofence.radius_meters;
    } 
    else if (geofence.fence_type === "polygon") {
      // Ray casting algorithm for point in polygon
      const polygon = geofence.polygon_coordinates;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng, yi = polygon[i].lat;
        const xj = polygon[j].lng, yj = polygon[j].lat;
        const intersect = ((yi > lat) != (yj > lat)) &&
          (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      isInside = inside;
    }
    else if (geofence.fence_type === "route") {
      // For routes, check distance to any point on route within threshold
      const route = geofence.route_coordinates;
      let minDistance = Infinity;
      
      for (const point of route) {
        const dist = calculateDistance(lat, lng, point.lat, point.lng) * 1000;
        minDistance = Math.min(minDistance, dist);
      }
      
      isInside = minDistance <= 100; // 100 meters threshold for route
    }

    res.status(200).json({
      success: true,
      data: {
        geofence_id: geofence.id,
        geofence_name: geofence.name,
        point: { latitude: lat, longitude: lng },
        is_inside: isInside,
        distance_to_center_meters: distanceToCenter,
        allowed_actions: geofence.allowed_actions,
      },
    });
  } catch (error) {
    console.error("Error checking point:", error);
    res.status(500).json({
      success: false,
      message: "Error checking geofence",
      error: error.message,
    });
  }
};

// Update geofence
const updateGeofence = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      center_latitude,
      center_longitude,
      radius_meters,
      polygon_coordinates,
      route_coordinates,
      allowed_actions,
      is_active,
    } = req.body;

    const geofence = await Geofence.findByPk(id);
    if (!geofence) {
      return res.status(404).json({
        success: false,
        message: "Geofence not found",
      });
    }

    const oldValues = {
      name: geofence.name,
      is_active: geofence.is_active,
    };

    const updateData = {};
    if (name) updateData.name = name;
    if (center_latitude !== undefined) updateData.center_latitude = center_latitude;
    if (center_longitude !== undefined) updateData.center_longitude = center_longitude;
    if (radius_meters !== undefined) updateData.radius_meters = radius_meters;
    if (polygon_coordinates) updateData.polygon_coordinates = polygon_coordinates;
    if (route_coordinates) updateData.route_coordinates = route_coordinates;
    if (allowed_actions) updateData.allowed_actions = allowed_actions;
    if (is_active !== undefined) updateData.is_active = is_active;

    await geofence.update(updateData);

    await logUpdate(
      req.user.id,
      "geofence",
      id,
      oldValues,
      updateData,
      req,
      `Updated geofence: ${geofence.name}`
    );

    res.status(200).json({
      success: true,
      message: "Geofence updated successfully",
      data: geofence,
    });
  } catch (error) {
    console.error("Error updating geofence:", error);
    res.status(500).json({
      success: false,
      message: "Error updating geofence",
      error: error.message,
    });
  }
};

// Delete geofence
const deleteGeofence = async (req, res) => {
  try {
    const { id } = req.params;

    const geofence = await Geofence.findByPk(id);
    if (!geofence) {
      return res.status(404).json({
        success: false,
        message: "Geofence not found",
      });
    }

    const geofenceData = { name: geofence.name, type: geofence.fence_type };
    await geofence.destroy();

    await logDelete(
      req.user.id,
      "geofence",
      id,
      geofenceData,
      req,
      `Deleted geofence: ${geofenceData.name}`
    );

    res.status(200).json({
      success: true,
      message: "Geofence deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting geofence:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting geofence",
      error: error.message,
    });
  }
};

module.exports = {
  createGeofence,
  getAllGeofences,
  getGeofenceById,
  checkPointInGeofence,
  updateGeofence,
  deleteGeofence,
};