// utils/auditLogger.js - No direct model imports
// This file only prepares audit data, doesn't call models directly

/**
 * Prepare audit log data without importing models
 * The actual database insert happens through a hook or queue
 */

let auditQueue = [];

// Process audit queue asynchronously
const processAuditQueue = async () => {
  if (auditQueue.length === 0) return;
  
  const itemsToProcess = [...auditQueue];
  auditQueue = [];
  
  try {
    // Dynamic import to avoid circular dependency
    const { AuditTrail } = require("../models");
    
    for (const item of itemsToProcess) {
      try {
        await AuditTrail.create(item);
      } catch (error) {
        console.error("Failed to create audit log:", error);
      }
    }
  } catch (error) {
    console.error("Failed to process audit queue:", error);
    // Put items back in queue
    auditQueue = [...itemsToProcess, ...auditQueue];
  }
};

// Process queue every 5 seconds
setInterval(processAuditQueue, 5000);

const queueAudit = (auditData) => {
  auditQueue.push(auditData);
  if (auditQueue.length > 1000) {
    auditQueue.shift(); // Prevent memory overflow
  }
};

// Public functions that queue instead of direct insert
const logAudit = async (params) => {
  queueAudit({
    user_id: params.user_id || null,
    action: params.action,
    resource_type: params.resource_type,
    resource_id: params.resource_id,
    old_value: params.old_value || null,
    new_value: params.new_value || null,
    ip_address: params.ip_address || null,
    user_agent: params.user_agent || null,
    description: params.description || null,
    status: params.status || "success",
    error_message: params.error_message || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const logCreate = async (userId, resourceType, resourceId, newValue, req, description) => {
  logAudit({
    user_id: userId,
    action: "CREATE",
    resource_type: resourceType,
    resource_id: resourceId,
    new_value: newValue,
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: description || `${resourceType} created with ID: ${resourceId}`,
    status: "success",
  });
};

const logUpdate = async (userId, resourceType, resourceId, oldValue, newValue, req, description) => {
  logAudit({
    user_id: userId,
    action: "UPDATE",
    resource_type: resourceType,
    resource_id: resourceId,
    old_value: oldValue,
    new_value: newValue,
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: description || `${resourceType} updated: ${resourceId}`,
    status: "success",
  });
};

const logDelete = async (userId, resourceType, resourceId, oldValue, req, description) => {
  logAudit({
    user_id: userId,
    action: "DELETE",
    resource_type: resourceType,
    resource_id: resourceId,
    old_value: oldValue,
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: description || `${resourceType} deleted: ${resourceId}`,
    status: "success",
  });
};

const logLogin = async (userId, req, success, errorMessage = null) => {
  logAudit({
    user_id: userId,
    action: "LOGIN",
    resource_type: "auth",
    resource_id: userId,
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: success ? `User ${userId} logged in successfully` : `Failed login attempt for user ${userId || "unknown"}`,
    status: success ? "success" : "failed",
    error_message: errorMessage,
  });
};

const logLogout = async (userId, req) => {
  logAudit({
    user_id: userId,
    action: "LOGOUT",
    resource_type: "auth",
    resource_id: userId,
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: `User ${userId} logged out`,
    status: "success",
  });
};

const logStatusChange = async (userId, resourceType, resourceId, oldStatus, newStatus, req, description) => {
  logAudit({
    user_id: userId,
    action: "STATUS_CHANGE",
    resource_type: resourceType,
    resource_id: resourceId,
    old_value: { status: oldStatus },
    new_value: { status: newStatus },
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: description || `${resourceType} status changed from ${oldStatus} to ${newStatus}`,
    status: "success",
  });
};

const logVerification = async (productCode, verificationResult, confidenceScore, req, description) => {
  logAudit({
    user_id: null,
    action: "VERIFY",
    resource_type: "verification",
    resource_id: productCode,
    new_value: { result: verificationResult, confidence_score: confidenceScore },
    ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
    user_agent: req?.headers["user-agent"] || null,
    description: description || `Product ${productCode} verified: ${verificationResult} (${confidenceScore}%)`,
    status: verificationResult === "authentic" ? "success" : "warning",
  });
};

const logApiCall = async (userId, apiKey, endpoint, method, requestBody, responseStatus, responseTimeMs, req) => {
  // This is handled by ApiLog model, not AuditTrail
  // Just queue for ApiLog
  try {
    const { ApiLog } = require("../models");
    await ApiLog.create({
      user_id: userId,
      api_key: apiKey,
      endpoint,
      method,
      request_body: requestBody ? (typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody).substring(0, 1000)) : null,
      response_status: responseStatus,
      response_time_ms: responseTimeMs,
      ip_address: req?.headers["x-forwarded-for"]?.split(",")[0] || req?.ip || null,
      user_agent: req?.headers["user-agent"] || null,
    });
  } catch (error) {
    console.error("Failed to log API call:", error);
  }
};

const getAuditTrail = async (resourceType, resourceId, limit = 50) => {
  try {
    const { AuditTrail, User } = require("../models");
    
    const logs = await AuditTrail.findAll({
      where: { resource_type: resourceType, resource_id: resourceId },
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
    });
    
    return logs;
  } catch (error) {
    console.error("Failed to get audit trail:", error);
    return [];
  }
};

module.exports = {
  logAudit,
  logCreate,
  logUpdate,
  logDelete,
  logLogin,
  logLogout,
  logStatusChange,
  logVerification,
  logApiCall,
  getAuditTrail,
};