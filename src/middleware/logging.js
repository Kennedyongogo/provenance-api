// middleware/logging.js
// No direct requires at top level

// Request logging middleware (logs all API calls)
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Store original send function
    const originalSend = res.send;
    
    // Override send to capture response body
    res.send = function(body) {
      res._body = body;
      return originalSend.call(this, body);
    };
    
    // Log after response is sent
    res.on("finish", () => {
      const responseTime = Date.now() - startTime;
      
      // Don't log health checks
      if (req.path === "/health") {
        return;
      }
      
      let userId = null;
      let apiKey = null;
      
      if (req.user) {
        userId = req.user.id;
        apiKey = req.user.api_key;
      } else if (req.headers["x-api-key"]) {
        apiKey = req.headers["x-api-key"];
      }
      
      // Parse request body (limit size, redact passwords)
      let requestBody = req.body;
      if (requestBody && requestBody.password) {
        requestBody = { ...requestBody, password: "[REDACTED]" };
      }
      
      // Async logging with setTimeout to avoid blocking
      setTimeout(() => {
        try {
          const { logApiCall } = require("../utils/auditLogger");
          logApiCall(
            userId,
            apiKey,
            req.path,
            req.method,
            requestBody,
            res.statusCode,
            responseTime,
            req
          );
        } catch (error) {
          // Silently fail
          console.error("API log failed:", error?.message);
        }
      }, 0);
    });
    
    next();
  };
  
  // Performance monitoring middleware
  const performanceMonitor = (req, res, next) => {
    const start = process.hrtime();
    
    res.on("finish", () => {
      const diff = process.hrtime(start);
      const responseTimeMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2);
      
      if (responseTimeMs > 1000) {
        console.warn(`Slow request: ${req.method} ${req.path} - ${responseTimeMs}ms`);
      }
      
      res.setHeader("X-Response-Time", `${responseTimeMs}ms`);
    });
    
    next();
  };
  
  // Security headers middleware
  const securityHeaders = (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=self, camera=(), microphone=()");
    next();
  };
  
  module.exports = {
    requestLogger,
    performanceMonitor,
    securityHeaders,
  };