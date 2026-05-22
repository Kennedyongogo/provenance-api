const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { routePresets } = require("../middleware");

router.get("/stats", ...routePresets.dashboard.stats, dashboardController.getDashboardStats);

module.exports = router;
