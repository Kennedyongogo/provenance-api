const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const provenanceEventController = require("../controllers/provenanceEventController");
const { routePresets } = require("../middleware");

router.post("/", ...routePresets.product.create, productController.createProduct);
router.get("/", ...routePresets.product.list, productController.getAllProducts);
router.get("/:id", ...routePresets.product.getById, productController.getProductById);
router.get(
  "/:id/qr-code",
  ...routePresets.product.getById,
  productController.getProductQrCode
);
router.get(
  "/:id/trace",
  ...routePresets.product.getById,
  productController.getProductTraceGeoJSON
);
router.put("/:id", ...routePresets.product.update, productController.updateProduct);
router.delete("/:id", ...routePresets.product.delete, productController.deleteProduct);

router.get(
  "/:product_id/events",
  ...routePresets.provenanceEvent.listByProduct,
  provenanceEventController.getEventsByProduct
);
router.get(
  "/:product_id/verify-chain",
  ...routePresets.provenanceEvent.verifyChain,
  provenanceEventController.verifyChainIntegrity
);

module.exports = router;
