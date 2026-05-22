const express = require("express");
const router = express.Router();
const alertController = require("../controllers/alertController");
const { routePresets, authenticate, authorize } = require("../middleware");

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];

router.get("/stats", authenticate, authorize(ADMIN_ROLES), alertController.getAlertStats);
router.get("/", ...routePresets.alert.list, alertController.getAllAlerts);
router.get("/:id", ...routePresets.alert.getById, alertController.getAlertById);
router.put("/:id/resolve", ...routePresets.alert.resolve, alertController.resolveAlert);
router.post("/bulk-resolve", ...routePresets.alert.bulkResolve, alertController.bulkResolveAlerts);

router.get(
  "/enterprise/:enterprise_id",
  ...routePresets.alert.byEnterprise,
  alertController.getAlertsByEnterprise
);

module.exports = router;
