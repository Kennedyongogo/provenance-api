const express = require("express");
const router = express.Router();
const verificationRequestController = require("../controllers/verificationRequestController");
const { routePresets, authenticate, authorize } = require("../middleware");

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];

router.get("/", ...routePresets.verificationRequest.list, verificationRequestController.getAllVerifications);
router.get("/stats", authenticate, authorize(ADMIN_ROLES), verificationRequestController.getVerificationStats);
router.get("/export", ...routePresets.verificationRequest.export, verificationRequestController.exportVerificationsCSV);
router.get("/:id", ...routePresets.verificationRequest.getById, verificationRequestController.getVerificationById);
router.get(
  "/product/:product_code",
  ...routePresets.verificationRequest.byProduct,
  verificationRequestController.getVerificationsByProduct
);

module.exports = router;
