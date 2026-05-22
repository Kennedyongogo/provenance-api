const express = require("express");
const router = express.Router();
const apiLogController = require("../controllers/apiLogController");
const { routePresets, authenticate, authorize } = require("../middleware");

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];

router.get("/", ...routePresets.apiLog.list, apiLogController.getApiLogs);
router.get("/rate-limit-alerts", ...routePresets.apiLog.rateLimitAlerts, apiLogController.getRateLimitAlerts);
router.delete("/clean", ...routePresets.apiLog.clean, apiLogController.cleanOldLogs);
router.get(
  "/users/:user_id/usage",
  authenticate,
  authorize(ADMIN_ROLES),
  apiLogController.getUserApiUsage
);
router.get(
  "/usage/:user_id",
  authenticate,
  authorize(ADMIN_ROLES),
  apiLogController.getUserApiUsage
);

module.exports = router;
