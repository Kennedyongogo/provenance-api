/**
 * Provenance API middleware barrel
 * Models (10): User, Enterprise, Product, Batch, ProvenanceEvent,
 *              Geofence, Alert, VerificationRequest, ApiLog, AuditTrail
 */

const auth = require("./auth");
const validation = require("./validation");
const logging = require("./logging");
const errorHandler = require("./errorHandler");
const { rateLimitMiddleware } = require("./rateLimit");

const {
  User,
  Enterprise,
  Product,
  Batch,
  ProvenanceEvent,
  Geofence,
  Alert,
  VerificationRequest,
  ApiLog,
  AuditTrail,
  Webhook,
} = require("../models");

const { asyncHandler } = errorHandler;
const {
  authenticate,
  authorize,
  checkEnterpriseAccess,
  authenticateApiKey,
  checkSubscriptionLimits,
  rateLimitByUser,
} = auth;
const {
  validate,
  userValidation,
  productValidation,
  provenanceEventValidation,
  enterpriseValidation,
  batchValidation,
  geofenceValidation,
  alertValidation,
  verificationValidation,
  paginationValidation,
  authValidation,
  scanValidation,
  webhookValidation,
} = validation;

// All Sequelize models available to routes
const models = {
  User,
  Enterprise,
  Product,
  Batch,
  ProvenanceEvent,
  Geofence,
  Alert,
  VerificationRequest,
  ApiLog,
  AuditTrail,
  Webhook,
};

const ADMIN_ROLES = ["super_admin", "enterprise_admin"];
const STAFF_ROLES = ["super_admin", "enterprise_admin", "warehouse_staff", "verifier"];

/**
 * Generic loader: fetches record by :id (or custom param) and attaches to req
 */
const loadById = (Model, options = {}) => {
  const {
    param = "id",
    attachAs = null,
    include = [],
    required = true,
    notFoundMessage = null,
  } = options;

  const attachKey =
    attachAs ||
    Model.name.charAt(0).toLowerCase() + Model.name.slice(1);

  return asyncHandler(async (req, res, next) => {
    const id = req.params[param] || req.body[param];
    if (!id) {
      if (required) {
        return res.status(400).json({
          success: false,
          message: `${param} is required`,
        });
      }
      return next();
    }

    const record = await Model.findByPk(id, { include });
    if (!record && required) {
      return res.status(404).json({
        success: false,
        message: notFoundMessage || `${Model.name} not found`,
      });
    }

    req[attachKey] = record;
    next();
  });
};

// --- Model loaders (maps to controllers) ---

const loadUser = loadById(User, {
  attachAs: "targetUser",
  include: [{ model: Enterprise, as: "enterprise" }],
});

const loadEnterprise = loadById(Enterprise, {
  attachAs: "enterprise",
});

const loadProduct = loadById(Product, {
  attachAs: "product",
  include: [{ model: User, as: "manufacturer", attributes: ["id", "full_name", "enterprise_id"] }],
});

const loadProductByProductId = loadById(Product, {
  param: "product_id",
  attachAs: "product",
  include: [{ model: User, as: "manufacturer", attributes: ["id", "full_name", "enterprise_id"] }],
});

const loadProductByCode = asyncHandler(async (req, res, next) => {
  const code = req.params.product_code || req.params.code;
  if (!code) {
    return res.status(400).json({
      success: false,
      message: "product_code is required",
    });
  }

  const product = await Product.findOne({
    where: { product_code: code },
    include: [{ model: User, as: "manufacturer", attributes: ["id", "enterprise_id"] }],
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  req.product = product;
  next();
});

const loadBatch = loadById(Batch, {
  attachAs: "batch",
  include: [{ model: Product, as: "product" }],
});

const loadProvenanceEvent = loadById(ProvenanceEvent, {
  attachAs: "provenanceEvent",
  include: [
    { model: Product, as: "product" },
    { model: User, as: "scanner", attributes: ["id", "full_name", "enterprise_id"] },
  ],
});

const loadGeofence = loadById(Geofence, {
  attachAs: "geofence",
  include: [{ model: Enterprise, as: "enterprise" }],
});

const loadAlert = loadById(Alert, {
  attachAs: "alert",
  include: [{ model: Enterprise, as: "enterprise" }],
});

const loadVerificationRequest = loadById(VerificationRequest, {
  attachAs: "verificationRequest",
  include: [{ model: Enterprise, as: "enterprise" }],
});

const loadApiLog = loadById(ApiLog, {
  attachAs: "apiLog",
  include: [{ model: User, as: "user", attributes: ["id", "full_name", "email"] }],
});

const loadAuditTrail = loadById(AuditTrail, {
  attachAs: "auditTrail",
  include: [{ model: User, as: "user", attributes: ["id", "full_name", "email"] }],
});

// --- Enterprise / resource access (used before mutating controllers) ---

const isSuperAdmin = (user) => user?.role === "super_admin";

const checkEnterpriseResource = (getEnterpriseId) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const resourceEnterpriseId = await getEnterpriseId(req);
    if (!resourceEnterpriseId) {
      return next();
    }

    if (
      req.user.role === "enterprise_admin" &&
      req.user.enterprise_id === resourceEnterpriseId
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Access denied. You can only access your own enterprise data.",
    });
  });

const checkProductAccess = checkEnterpriseResource(async (req) => {
  const product = req.product;
  if (!product) return null;
  if (product.manufacturer?.enterprise_id) {
    return product.manufacturer.enterprise_id;
  }
  const manufacturer = await User.findByPk(product.manufacturer_id, {
    attributes: ["enterprise_id"],
  });
  return manufacturer?.enterprise_id ?? null;
});

const checkBatchAccess = checkEnterpriseResource(async (req) => {
  const batch = req.batch;
  if (!batch) return null;
  const product =
    batch.product ||
    (await Product.findByPk(batch.product_id, {
      include: [{ model: User, as: "manufacturer", attributes: ["enterprise_id"] }],
    }));
  return product?.manufacturer?.enterprise_id ?? null;
});

const checkAlertAccess = checkEnterpriseResource(
  async (req) => req.alert?.enterprise_id ?? null
);

const checkGeofenceAccess = checkEnterpriseResource(
  async (req) => req.geofence?.enterprise_id ?? null
);

// Attach models on request (optional convenience for controllers)
const attachModels = (req, res, next) => {
  req.models = models;
  next();
};

/**
 * Route middleware presets keyed by controller domain.
 * Usage: router.get("/:id", ...routePresets.product.getById, productController.getProductById)
 */
const routePresets = {
  user: {
    register: [...userValidation.register, validate],
    login: [...userValidation.login, validate],
    list: [authenticate, authorize(ADMIN_ROLES), ...paginationValidation, validate],
    getById: [authenticate, authorize(ADMIN_ROLES), loadUser],
    update: [
      authenticate,
      authorize(ADMIN_ROLES),
      ...userValidation.updateUser,
      validate,
      loadUser,
    ],
    delete: [authenticate, authorize(["super_admin"]), loadUser],
  },

  enterprise: {
    create: [
      authenticate,
      authorize(["super_admin"]),
      ...enterpriseValidation.create,
      validate,
    ],
    list: [authenticate, authorize(ADMIN_ROLES), ...paginationValidation, validate],
    getById: [authenticate, authorize(ADMIN_ROLES), loadEnterprise],
    update: [
      authenticate,
      authorize(ADMIN_ROLES),
      ...enterpriseValidation.update,
      validate,
      loadEnterprise,
      checkEnterpriseAccess,
    ],
    delete: [
      authenticate,
      authorize(["super_admin"]),
      loadEnterprise,
    ],
  },

  product: {
    create: [
      authenticate,
      authorize(STAFF_ROLES),
      checkSubscriptionLimits,
      ...productValidation.create,
      validate,
    ],
    list: [authenticate, authorize(STAFF_ROLES), ...paginationValidation, validate],
    getById: [
      authenticate,
      authorize(STAFF_ROLES),
      loadProduct,
      checkProductAccess,
    ],
    update: [
      authenticate,
      authorize(STAFF_ROLES),
      ...productValidation.update,
      validate,
      loadProduct,
      checkProductAccess,
    ],
    delete: [
      authenticate,
      authorize(ADMIN_ROLES),
      loadProduct,
      checkProductAccess,
    ],
    publicVerify: [
      ...verificationValidation.publicVerify,
      validate,
      loadProductByCode,
    ],
  },

  batch: {
    create: [
      authenticate,
      authorize(STAFF_ROLES),
      checkSubscriptionLimits,
      ...batchValidation.create,
      validate,
    ],
    list: [authenticate, authorize(STAFF_ROLES), ...paginationValidation, validate],
    getById: [authenticate, authorize(STAFF_ROLES), loadBatch, checkBatchAccess],
    split: [
      authenticate,
      authorize(STAFF_ROLES),
      ...batchValidation.split,
      validate,
      loadBatch,
      checkBatchAccess,
    ],
    merge: [
      authenticate,
      authorize(STAFF_ROLES),
      ...batchValidation.merge,
      validate,
    ],
    delete: [
      authenticate,
      authorize(ADMIN_ROLES),
      loadBatch,
      checkBatchAccess,
    ],
  },

  provenanceEvent: {
    create: [
      authenticate,
      authorize(STAFF_ROLES),
      checkSubscriptionLimits,
      rateLimitByUser,
      ...provenanceEventValidation.create,
      validate,
    ],
    listByProduct: [
      authenticate,
      authorize(STAFF_ROLES),
      loadProductByProductId,
      checkProductAccess,
    ],
    getById: [authenticate, authorize(STAFF_ROLES), loadProvenanceEvent],
    verifyChain: [
      authenticate,
      authorize(STAFF_ROLES),
      loadProductByProductId,
      checkProductAccess,
    ],
  },

  geofence: {
    create: [
      authenticate,
      authorize(ADMIN_ROLES),
      ...geofenceValidation.create,
      validate,
    ],
    list: [authenticate, authorize(ADMIN_ROLES), ...paginationValidation, validate],
    getById: [
      authenticate,
      authorize(ADMIN_ROLES),
      loadGeofence,
      checkGeofenceAccess,
    ],
    update: [
      authenticate,
      authorize(ADMIN_ROLES),
      loadGeofence,
      checkGeofenceAccess,
    ],
    delete: [
      authenticate,
      authorize(ADMIN_ROLES),
      loadGeofence,
      checkGeofenceAccess,
    ],
  },

  alert: {
    list: [authenticate, authorize(ADMIN_ROLES), ...paginationValidation, validate],
    getById: [
      authenticate,
      authorize(ADMIN_ROLES),
      loadAlert,
      checkAlertAccess,
    ],
    resolve: [
      authenticate,
      authorize(ADMIN_ROLES),
      ...alertValidation.resolve,
      validate,
      loadAlert,
      checkAlertAccess,
    ],
    bulkResolve: [
      authenticate,
      authorize(ADMIN_ROLES),
      ...alertValidation.bulkResolve,
      validate,
    ],
    byEnterprise: [
      authenticate,
      authorize(ADMIN_ROLES),
      checkEnterpriseAccess,
    ],
  },

  verificationRequest: {
    list: [authenticate, authorize(ADMIN_ROLES), ...paginationValidation, validate],
    getById: [authenticate, authorize(ADMIN_ROLES), loadVerificationRequest],
    byProduct: [
      ...verificationValidation.publicVerify,
      validate,
      loadProductByCode,
    ],
    export: [authenticate, authorize(ADMIN_ROLES)],
  },

  apiLog: {
    list: [authenticate, authorize(["super_admin"]), ...paginationValidation, validate],
    userUsage: [authenticate, authorize(ADMIN_ROLES), loadUser],
    rateLimitAlerts: [authenticate, authorize(["super_admin"])],
    clean: [authenticate, authorize(["super_admin"])],
  },

  audit: {
    list: [authenticate, authorize(ADMIN_ROLES), ...paginationValidation, validate],
    byResource: [authenticate, authorize(ADMIN_ROLES)],
    summary: [authenticate, authorize(ADMIN_ROLES)],
    getById: [authenticate, authorize(ADMIN_ROLES), loadAuditTrail],
  },

  dashboard: {
    stats: [authenticate, authorize(ADMIN_ROLES)],
  },

  global: {
    apiKey: [authenticateApiKey, rateLimitByUser],
    authenticated: [authenticate, rateLimitByUser],
    staffScan: [
      authenticate,
      authorize(STAFF_ROLES),
      checkSubscriptionLimits,
      rateLimitByUser,
    ],
    logging: [
      logging.securityHeaders,
      logging.performanceMonitor,
      logging.requestLogger,
    ],
    errors: [errorHandler.notFound, errorHandler.errorHandler],
  },
};

routePresets.provenanceEvent.publicVerify = routePresets.product.publicVerify;

// Controller name map (for route wiring documentation)
const controllerMap = {
  user: "userController",
  enterprise: "enterpriseController",
  product: "productController",
  batch: "batchController",
  provenanceEvent: "provenanceEventController",
  geofence: "geofenceController",
  alert: "alertController",
  verificationRequest: "verificationRequestController",
  apiLog: "apiLogController",
  audit: "auditController",
  dashboard: "dashboardController",
};

module.exports = {
  // Auth
  authenticate,
  authorize,
  checkEnterpriseAccess,
  authenticateApiKey,
  checkSubscriptionLimits,
  rateLimitByUser,

  // Validation
  validate,
  userValidation,
  productValidation,
  provenanceEventValidation,
  enterpriseValidation,
  batchValidation,
  geofenceValidation,
  alertValidation,
  verificationValidation,
  paginationValidation,

  // Logging, rate limit & errors
  ...logging,
  ...errorHandler,
  rateLimitMiddleware,
  authValidation,
  scanValidation,
  webhookValidation,

  // Models
  models,
  attachModels,

  // Loaders
  loadById,
  loadUser,
  loadEnterprise,
  loadProduct,
  loadProductByProductId,
  loadProductByCode,
  loadBatch,
  loadProvenanceEvent,
  loadGeofence,
  loadAlert,
  loadVerificationRequest,
  loadApiLog,
  loadAuditTrail,

  // Access control
  checkEnterpriseResource,
  checkProductAccess,
  checkBatchAccess,
  checkAlertAccess,
  checkGeofenceAccess,

  // Route presets + controller map
  routePresets,
  controllerMap,
};
