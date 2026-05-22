const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
  routePresets,
  authenticate,
  validate,
  authValidation,
} = require("../middleware");

router.post("/register", ...routePresets.user.register, authController.register);
router.post("/login", ...routePresets.user.login, authController.login);
router.post("/logout", authenticate, authController.logout);
router.post(
  "/refresh",
  ...authValidation.refresh,
  validate,
  authController.refresh
);
router.post(
  "/forgot-password",
  ...authValidation.forgotPassword,
  validate,
  authController.forgotPassword
);
router.post(
  "/reset-password",
  ...authValidation.resetPassword,
  validate,
  authController.resetPassword
);
router.get("/me", authenticate, authController.getMe);
router.put(
  "/me",
  authenticate,
  ...authValidation.updateMe,
  validate,
  authController.updateMe
);
router.put(
  "/change-password",
  authenticate,
  ...authValidation.changePassword,
  validate,
  authController.changePassword
);
router.post("/api-key/regenerate", authenticate, authController.regenerateApiKey);

module.exports = router;
