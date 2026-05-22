// middleware/errorHandler.js
// No direct require of auditLogger - we'll use a safe approach

// Simple console error logger for middleware
const logError = (err, req) => {
    console.error("Error:", {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      user: req.user?.id,
      status: err.status || 500,
    });
  };
  
  // Global error handler middleware
  const errorHandler = (err, req, res, next) => {
    logError(err, req);
  
    // For serious errors, try to log to audit asynchronously (don't await, don't block)
    if (err.status >= 500) {
      // Use setTimeout to break the circular dependency
      setTimeout(() => {
        try {
          const { logAudit } = require("../utils/auditLogger");
          logAudit({
            user_id: req.user?.id || null,
            action: "ERROR",
            resource_type: "system",
            ip_address: req.ip,
            user_agent: req.headers["user-agent"],
            description: `System error: ${err.message}`,
            status: "failed",
            error_message: err.message,
          });
        } catch (logError) {
          // Silently fail - don't crash the response
          console.error("Audit log failed:", logError.message);
        }
      }, 0);
    }
  
    // Sequelize validation error
    if (err.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: err.errors.map(e => ({
          field: e.path,
          message: e.message,
        })),
      });
    }
  
    // Sequelize unique constraint error
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Duplicate entry",
        errors: err.errors.map(e => ({
          field: e.path,
          message: `${e.path} already exists`,
        })),
      });
    }
  
    // Sequelize foreign key error
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Related record not found",
        error: err.message,
      });
    }
  
    // JWT errors
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }
  
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }
  
    // Default error response
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || "Internal server error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  };
  
  // 404 handler for undefined routes
  const notFound = (req, res) => {
    res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.url}`,
    });
  };
  
  // Async wrapper to avoid try-catch repetition
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  
  module.exports = {
    errorHandler,
    notFound,
    asyncHandler,
  };