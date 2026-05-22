const express = require("express");
const router = express.Router();
const scanController = require("../controllers/scanController");
const {
  routePresets,
  paginationValidation,
  validate,
  authenticate,
  authorize,
  checkSubscriptionLimits,
  scanValidation,
} = require("../middleware");

router.post("/", ...routePresets.provenanceEvent.create, scanController.createScan);
router.post(
  "/bulk",
  authenticate,
  authorize(["super_admin", "enterprise_admin", "warehouse_staff", "verifier"]),
  checkSubscriptionLimits,
  ...scanValidation.bulk,
  validate,
  scanController.bulkCreateScans
);
router.get(
  "/",
  authenticate,
  authorize(["super_admin", "enterprise_admin"]),
  ...paginationValidation,
  validate,
  scanController.getAllScans
);
router.get(
  "/product/:product_id",
  ...routePresets.provenanceEvent.listByProduct,
  scanController.getEventsByProduct
);
router.get(
  "/verify-chain/:product_id",
  ...routePresets.provenanceEvent.verifyChain,
  scanController.verifyChainIntegrity
);
router.get("/:id", ...routePresets.provenanceEvent.getById, scanController.getScanById);

module.exports = router;
