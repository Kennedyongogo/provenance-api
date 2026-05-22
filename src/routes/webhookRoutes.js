const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhookController");
const {
  authenticate,
  authorize,
  validate,
  webhookValidation,
} = require("../middleware");

const ADMIN = ["super_admin", "enterprise_admin"];

router.post(
  "/",
  authenticate,
  authorize(ADMIN),
  ...webhookValidation.create,
  validate,
  webhookController.createWebhook
);
router.get("/", authenticate, authorize(ADMIN), webhookController.listWebhooks);
router.delete("/:id", authenticate, authorize(ADMIN), webhookController.deleteWebhook);

module.exports = router;
