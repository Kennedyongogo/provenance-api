const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { routePresets, authenticate, authorize } = require("../middleware");

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];

router.get("/", ...routePresets.user.list, userController.getAllUsers);
router.get("/:id", ...routePresets.user.getById, userController.getUserById);
router.put("/:id", ...routePresets.user.update, userController.updateUser);
router.delete("/:id", ...routePresets.user.delete, userController.deleteUser);

router.post(
  "/:id/regenerate-api-key",
  authenticate,
  authorize(ADMIN_ROLES),
  userController.regenerateApiKey
);
router.post(
  "/:id/roles",
  authenticate,
  userController.assignRole
);
router.post(
  "/invite",
  authenticate,
  authorize(ADMIN_ROLES),
  userController.inviteUser
);

module.exports = router;
