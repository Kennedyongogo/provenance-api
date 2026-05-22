const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { routePresets } = require("../middleware");

router.get("/", ...routePresets.audit.list, auditController.getAllAuditLogs);
router.get("/summary", ...routePresets.audit.summary, auditController.getAuditSummary);
router.get(
  "/resource/:resource_type/:resource_id",
  ...routePresets.audit.byResource,
  auditController.getResourceAuditTrail
);

module.exports = router;
