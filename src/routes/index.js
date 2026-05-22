const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const enterpriseRoutes = require("./enterpriseRoutes");
const productRoutes = require("./productRoutes");
const scanRoutes = require("./scanRoutes");
const batchRoutes = require("./batchRoutes");
const geofenceRoutes = require("./geofenceRoutes");
const alertRoutes = require("./alertRoutes");
const verificationRequestRoutes = require("./verificationRequestRoutes");
const apiLogRoutes = require("./apiLogRoutes");
const auditRoutes = require("./auditRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const publicRoutes = require("./publicRoutes");
const webhookRoutes = require("./webhookRoutes");
const uploadRoutes = require("./uploadRoutes");
const exportRoutes = require("./exportRoutes");

const mount = (path, routes) => {
  router.use(path, routes);
};

// Spec-aligned /v1 paths
mount("/v1/auth", authRoutes);
mount("/v1/users", userRoutes);
mount("/v1/enterprises", enterpriseRoutes);
mount("/v1/products", productRoutes);
mount("/v1/scans", scanRoutes);
mount("/v1/batches", batchRoutes);
mount("/v1/geofences", geofenceRoutes);
mount("/v1/alerts", alertRoutes);
mount("/v1/verifications", verificationRequestRoutes);
mount("/v1/api-logs", apiLogRoutes);
mount("/v1/audit-logs", auditRoutes);
mount("/v1/dashboard", dashboardRoutes);
mount("/v1/public/verify", publicRoutes);
mount("/v1/webhooks", webhookRoutes);
mount("/v1/uploads", uploadRoutes);
mount("/v1/exports", exportRoutes);

// Backward-compatible aliases (no /v1 prefix)
mount("/auth", authRoutes);
mount("/users", userRoutes);
mount("/enterprises", enterpriseRoutes);
mount("/products", productRoutes);
mount("/scans", scanRoutes);
mount("/events", scanRoutes);
mount("/batches", batchRoutes);
mount("/geofences", geofenceRoutes);
mount("/alerts", alertRoutes);
mount("/verifications", verificationRequestRoutes);
mount("/api-logs", apiLogRoutes);
mount("/audit", auditRoutes);
mount("/audit-logs", auditRoutes);
mount("/dashboard", dashboardRoutes);
mount("/verify", publicRoutes);
mount("/public/verify", publicRoutes);
mount("/webhooks", webhookRoutes);
mount("/uploads", uploadRoutes);
mount("/exports", exportRoutes);

module.exports = router;
