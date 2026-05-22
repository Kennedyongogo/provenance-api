const express = require("express");
const router = express.Router();
const uploadController = require("../controllers/uploadController");
const { authenticate, authorize } = require("../middleware");
const { uploadProductPhoto, handleUploadError } = require("../middleware/upload");

const STAFF = ["super_admin", "enterprise_admin", "warehouse_staff", "verifier"];

router.post(
  "/product-photo",
  authenticate,
  authorize(STAFF),
  uploadProductPhoto,
  handleUploadError,
  uploadController.uploadProductPhoto
);

module.exports = router;
