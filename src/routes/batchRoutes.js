const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batchController");
const { routePresets, authenticate, authorize, loadBatch, checkBatchAccess } = require("../middleware");

const STAFF_ROLES = ["super_admin", "enterprise_admin", "warehouse_staff", "verifier"];

router.post("/", ...routePresets.batch.create, batchController.createBatch);
router.post("/merge", ...routePresets.batch.merge, batchController.mergeBatches);
router.get("/", ...routePresets.batch.list, batchController.getAllBatches);
router.get("/:id", ...routePresets.batch.getById, batchController.getBatchById);
router.put(
  "/:id",
  authenticate,
  authorize(STAFF_ROLES),
  loadBatch,
  checkBatchAccess,
  batchController.updateBatch
);
router.post("/:id/split", ...routePresets.batch.split, batchController.splitBatch);
router.delete("/:id", ...routePresets.batch.delete, batchController.deleteBatch);

module.exports = router;
