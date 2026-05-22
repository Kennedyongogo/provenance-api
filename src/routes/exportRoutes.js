const express = require("express");
const router = express.Router();
const exportController = require("../controllers/exportController");
const { authenticate, authorize } = require("../middleware");

const ADMIN = ["super_admin", "enterprise_admin"];

router.get("/scans", authenticate, authorize(ADMIN), exportController.exportScans);
router.get(
  "/:export_id/status",
  authenticate,
  authorize(ADMIN),
  exportController.getExportStatus
);
router.get(
  "/:export_id/download",
  authenticate,
  authorize(ADMIN),
  exportController.downloadExport
);

module.exports = router;
