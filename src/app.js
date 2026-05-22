const express = require("express");
const path = require("path");
const cors = require("cors");

const { initializeModels, setupAssociations } = require("./models");
const {
  errorHandler,
  notFound,
  requestLogger,
  performanceMonitor,
  securityHeaders,
} = require("./middleware");
const apiRoutes = require("./routes");
const { startJobs } = require("./jobs");
const storageService = require("./services/storageService");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(securityHeaders);
app.use(performanceMonitor);
app.use(requestLogger);

storageService.ensureUploadDir();
app.use(
  "/uploads/product-photos",
  express.static(path.join(__dirname, "..", "uploads", "product-photos"))
);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Provenance API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    docs: "/api/v1",
  });
});

app.use("/api", apiRoutes);

app.use("/api", notFound);
app.use(errorHandler);

const initializeApp = async () => {
  try {
    console.log("🚀 Initializing Provenance API...");
    await initializeModels();
    setupAssociations();
    startJobs();
    console.log("✅ Provenance API initialized successfully");
    return true;
  } catch (error) {
    console.error("❌ Error initializing application:", error);
    throw error;
  }
};

const appInitialized = initializeApp();

module.exports = { app, appInitialized };
