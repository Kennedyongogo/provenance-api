const express = require("express");
const router = express.Router();
const geofenceController = require("../controllers/geofenceController");
const { routePresets, authenticate, authorize, loadGeofence, checkGeofenceAccess } = require("../middleware");

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];

router.post("/", ...routePresets.geofence.create, geofenceController.createGeofence);
router.get("/", ...routePresets.geofence.list, geofenceController.getAllGeofences);
router.get("/:id", ...routePresets.geofence.getById, geofenceController.getGeofenceById);
router.get(
  "/:id/check-point",
  authenticate,
  authorize(ADMIN_ROLES),
  loadGeofence,
  checkGeofenceAccess,
  geofenceController.checkPointInGeofence
);
router.post(
  "/:id/check",
  authenticate,
  authorize(ADMIN_ROLES),
  loadGeofence,
  checkGeofenceAccess,
  require("../controllers/scanController").checkGeofencePoint
);
router.put("/:id", ...routePresets.geofence.update, geofenceController.updateGeofence);
router.delete("/:id", ...routePresets.geofence.delete, geofenceController.deleteGeofence);

module.exports = router;
