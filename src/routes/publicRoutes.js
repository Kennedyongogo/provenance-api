const express = require("express");
const router = express.Router();
const scanController = require("../controllers/scanController");
const { routePresets } = require("../middleware");

router.get(
  "/:product_code",
  ...routePresets.product.publicVerify,
  scanController.publicVerify
);

module.exports = router;
