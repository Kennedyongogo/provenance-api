const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const config = require("../config/config");
const { User, Enterprise } = require("../models");

// Authenticate JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. No token provided.",
      });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Check if user exists and is active
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password", "refresh_token_hash", "password_reset_token"] },
      include: [{ model: Enterprise, as: "enterprise" }],
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact support.",
      });
    }
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }
    
    console.error("Auth error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication error",
      error: error.message,
    });
  }
};

// Authorize based on roles
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
      });
    }
    
    next();
  };
};

// Check if user belongs to enterprise (for enterprise-scoped resources)
const checkEnterpriseAccess = (req, res, next) => {
  const enterprise_id =
    req.params.enterprise_id ||
    req.params.id ||
    req.enterprise?.id;
  
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }
  
  // Super admin can access everything
  if (req.user.role === "super_admin") {
    return next();
  }
  
  // Enterprise admin can only access their own enterprise
  if (req.user.role === "enterprise_admin") {
    if (req.user.enterprise_id !== enterprise_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own enterprise data.",
      });
    }
    return next();
  }
  
  // Regular users cannot access enterprise-level resources
  return res.status(403).json({
    success: false,
    message: "Access denied. Enterprise admin access required.",
  });
};

// Optional: Check API key for programmatic access
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: "API key required",
      });
    }
    
    const user = await User.findOne({
      where: { api_key: apiKey, isActive: true },
      include: [{ model: Enterprise, as: "enterprise" }],
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid API key",
      });
    }
    
    // Check rate limit
    const { ApiLog } = require("../models");
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const requestsLastMinute = await ApiLog.count({
      where: {
        user_id: user.id,
        createdAt: { [Op.gte]: oneMinuteAgo },
      },
    });
    
    if (requestsLastMinute >= user.rate_limit_per_minute) {
      return res.status(429).json({
        success: false,
        message: `Rate limit exceeded. Maximum ${user.rate_limit_per_minute} requests per minute.`,
      });
    }
    
    req.user = user;
    req.isApiCall = true;
    next();
  } catch (error) {
    console.error("API key auth error:", error);
    res.status(500).json({
      success: false,
      message: "API key authentication error",
      error: error.message,
    });
  }
};

// Check subscription tier and scan limits
const checkSubscriptionLimits = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }
    
    if (req.user.role === "super_admin") {
      return next();
    }
    
    const enterprise = await Enterprise.findByPk(req.user.enterprise_id);
    
    if (!enterprise) {
      return next();
    }
    
    // Check if enterprise has exceeded monthly scan limit
    if (enterprise.scans_used_this_month >= enterprise.scan_limit_monthly) {
      return res.status(403).json({
        success: false,
        message: "Monthly scan limit exceeded. Please upgrade your subscription.",
        data: {
          used: enterprise.scans_used_this_month,
          limit: enterprise.scan_limit_monthly,
          subscription_tier: enterprise.subscription_tier,
        },
      });
    }
    
    // For free tier, check if trial period is valid
    if (enterprise.subscription_tier === "free") {
      const daysSinceCreation = Math.floor((Date.now() - new Date(enterprise.createdAt)) / (1000 * 60 * 60 * 24));
      if (daysSinceCreation > 30) {
        return res.status(403).json({
          success: false,
          message: "Free trial expired. Please upgrade to continue.",
        });
      }
    }
    
    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    next(); // Don't block on error
  }
};

// Rate limiting middleware (more granular than express-rate-limit)
const rateLimitByUser = async (req, res, next) => {
  try {
    const { ApiLog } = require("../models");
    const { Op } = require("sequelize");
    
    const userId = req.user?.id;
    const apiKey = req.headers["x-api-key"];
    const rateLimit = req.user?.rate_limit_per_minute || 60;
    
    const oneMinuteAgo = new Date(Date.now() - 60000);
    
    const whereClause = { createdAt: { [Op.gte]: oneMinuteAgo } };
    if (userId) whereClause.user_id = userId;
    if (apiKey) whereClause.api_key = apiKey;
    
    const requestsLastMinute = await ApiLog.count({ where: whereClause });
    
    if (requestsLastMinute >= rateLimit) {
      return res.status(429).json({
        success: false,
        message: `Rate limit exceeded. Please wait before making more requests.`,
        retry_after_seconds: 60,
      });
    }
    
    next();
  } catch (error) {
    console.error("Rate limit error:", error);
    next(); // Don't block on error
  }
};

module.exports = {
  authenticate,
  authorize,
  checkEnterpriseAccess,
  authenticateApiKey,
  checkSubscriptionLimits,
  rateLimitByUser,
};