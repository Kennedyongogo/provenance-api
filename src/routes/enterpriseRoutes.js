const express = require("express");
const router = express.Router();
const enterpriseController = require("../controllers/enterpriseController");
const {
  routePresets,
  authenticate,
  authorize,
  loadEnterprise,
  checkEnterpriseAccess,
} = require("../middleware");

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];

router.post("/", ...routePresets.enterprise.create, enterpriseController.createEnterprise);
router.get("/", ...routePresets.enterprise.list, enterpriseController.getAllEnterprises);
router.get("/:id", ...routePresets.enterprise.getById, enterpriseController.getEnterpriseById);
router.put("/:id", ...routePresets.enterprise.update, enterpriseController.updateEnterprise);
router.delete("/:id", ...routePresets.enterprise.delete, enterpriseController.deleteEnterprise);

router.get(
  "/:id/stats",
  authenticate,
  authorize(ADMIN_ROLES),
  loadEnterprise,
  checkEnterpriseAccess,
  enterpriseController.getEnterpriseStats
);
router.get(
  "/:id/users",
  authenticate,
  authorize(ADMIN_ROLES),
  loadEnterprise,
  checkEnterpriseAccess,
  enterpriseController.listEnterpriseUsers
);
router.post(
  "/:id/users",
  authenticate,
  authorize(ADMIN_ROLES),
  loadEnterprise,
  checkEnterpriseAccess,
  enterpriseController.inviteEnterpriseUser
);
router.delete(
  "/:id/users/:userId",
  authenticate,
  authorize(ADMIN_ROLES),
  loadEnterprise,
  checkEnterpriseAccess,
  enterpriseController.removeEnterpriseUser
);

module.exports = router;
