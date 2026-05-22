const { body, param, query, validationResult } = require("express-validator");

// Middleware to check validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

// User validation rules
const userValidation = {
  register: [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("full_name").notEmpty().withMessage("Full name is required"),
    body("role").optional().isIn(["enterprise_admin", "warehouse_staff", "consumer", "verifier"]),
  ],
  login: [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  updateUser: [
    param("id").isUUID().withMessage("Valid user ID is required"),
    body("full_name").optional().isString(),
    body("company_name").optional().isString(),
    body("role").optional().isIn(["enterprise_admin", "warehouse_staff", "consumer", "verifier"]),
  ],
  changePassword: [
    param("id").isUUID().withMessage("Valid user ID is required"),
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  ],
};

// Product validation rules
const productValidation = {
  create: [
    body("product_code").notEmpty().withMessage("Product code is required"),
    body("name").notEmpty().withMessage("Product name is required"),
    body("category").optional().isIn(["coffee", "diamonds", "pharmaceuticals", "seafood", "luxury_goods", "other"]),
    body("origin_latitude").isFloat({ min: -90, max: 90 }).withMessage("Valid latitude is required"),
    body("origin_longitude").isFloat({ min: -180, max: 180 }).withMessage("Valid longitude is required"),
  ],
  update: [
    param("id").isUUID().withMessage("Valid product ID is required"),
  ],
};

// Provenance Event validation rules (MOST IMPORTANT)
const provenanceEventValidation = {
  create: [
    body("product_id").isUUID().withMessage("Valid product ID is required"),
    body("action").isIn([
      "CREATE", "TRANSPORT", "INSPECT", "STORE", "SHIP", "RECEIVE", "TRANSFORM", "CONSUME", "VERIFY"
    ]).withMessage("Valid action is required"),
    body("latitude").isFloat({ min: -90, max: 90 }).withMessage("Valid latitude is required"),
    body("longitude").isFloat({ min: -180, max: 180 }).withMessage("Valid longitude is required"),
    body("location_accuracy_meters").optional().isFloat({ min: 0 }),
    body("cell_tower_fingerprint").optional().isArray(),
    body("wifi_fingerprint").optional().isArray(),
  ],
};

// Enterprise validation rules
const enterpriseValidation = {
  create: [
    body("name").notEmpty().withMessage("Enterprise name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("industry").optional().isIn(["agriculture", "mining", "pharma", "logistics", "retail", "manufacturing"]),
  ],
  update: [
    param("id").isUUID().withMessage("Valid enterprise ID is required"),
  ],
};

// Batch validation rules
const batchValidation = {
  create: [
    body("batch_number").notEmpty().withMessage("Batch number is required"),
    body("product_id").isUUID().withMessage("Valid product ID is required"),
    body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer"),
    body("unit").optional().isIn(["kg", "liters", "pieces", "tons", "grams"]),
  ],
  split: [
    param("id").isUUID().withMessage("Valid batch ID is required"),
    body("childBatches").isArray({ min: 2 }).withMessage("At least 2 child batches required"),
    body("childBatches.*.batch_number").notEmpty().withMessage("Child batch number required"),
    body("childBatches.*.quantity").isInt({ min: 1 }).withMessage("Child batch quantity must be positive"),
  ],
  merge: [
    body("batch_ids").isArray({ min: 2 }).withMessage("At least 2 batch IDs required"),
    body("batch_ids.*").isUUID().withMessage("Valid batch ID required"),
    body("new_batch_number").notEmpty().withMessage("New batch number required"),
  ],
};

// Geofence validation rules
const geofenceValidation = {
  create: [
    body("enterprise_id").isUUID().withMessage("Valid enterprise ID is required"),
    body("name").notEmpty().withMessage("Geofence name is required"),
    body("fence_type").isIn(["circle", "polygon", "route"]).withMessage("Valid fence type required"),
    body("allowed_actions").optional().isArray(),
  ],
};

// Alert validation rules
const alertValidation = {
  resolve: [
    param("id").isUUID().withMessage("Valid alert ID is required"),
  ],
  bulkResolve: [
    body("alert_ids").isArray({ min: 1 }).withMessage("At least one alert ID required"),
    body("alert_ids.*").isUUID().withMessage("Valid alert ID required"),
  ],
};

// Verification Request validation
const verificationValidation = {
  publicVerify: [
    param("product_code").notEmpty().withMessage("Product code is required"),
  ],
};

const authValidation = {
  refresh: [body("refresh_token").notEmpty().withMessage("refresh_token is required")],
  forgotPassword: [body("email").isEmail().withMessage("Valid email is required")],
  resetPassword: [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  changePassword: [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 6 }),
  ],
  updateMe: [
    body("full_name").optional().isString(),
    body("company_name").optional().isString(),
    body("phone").optional().isString(),
  ],
};

const scanValidation = {
  bulk: [
    body("scans").isArray({ min: 1 }).withMessage("scans array is required"),
    body("scans.*.product_id").isUUID(),
    body("scans.*.action").notEmpty(),
    body("scans.*.latitude").isFloat({ min: -90, max: 90 }),
    body("scans.*.longitude").isFloat({ min: -180, max: 180 }),
  ],
};

const webhookValidation = {
  create: [
    body("url").isURL().withMessage("Valid webhook URL required"),
    body("events").optional().isArray(),
    body("enterprise_id").optional().isUUID(),
  ],
};

// Pagination validation (common)
const paginationValidation = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  validate,
  userValidation,
  productValidation,
  provenanceEventValidation,
  enterpriseValidation,
  batchValidation,
  geofenceValidation,
  alertValidation,
  verificationValidation,
  authValidation,
  scanValidation,
  webhookValidation,
  paginationValidation,
};