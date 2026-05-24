const { sequelize } = require("../config/database");

const User = require("./User")(sequelize);
const Enterprise = require("./Enterprise")(sequelize);
const Product = require("./Product")(sequelize);
const Batch = require("./Batch")(sequelize);
const ProvenanceEvent = require("./ProvenanceEvent")(sequelize);
const Geofence = require("./Geofence")(sequelize);
const Alert = require("./Alert")(sequelize);
const VerificationRequest = require("./VerificationRequest")(sequelize);
const ApiLog = require("./ApiLog")(sequelize);
const AuditTrail = require("./AuditTrail")(sequelize);
const Webhook = require("./Webhook")(sequelize);

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

const enablePostgis = async () => {
  try {
    await sequelize.query("CREATE EXTENSION IF NOT EXISTS postgis");
    await sequelize.query(`
      ALTER TABLE provenance_events
      ADD COLUMN IF NOT EXISTS location_point geography(Point, 4326)
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_provenance_events_location_point
      ON provenance_events USING GIST (location_point)
    `);
    console.log("✅ PostGIS ready for provenance_events");
  } catch (error) {
    console.warn("⚠️ PostGIS setup skipped:", error.message);
  }
};

const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");
    // enterprises must sync before users (users.enterprise_id FK)
    await Enterprise.sync({ force: false, alter: false });
    await User.sync({ force: false, alter: true });
    await Product.sync({ force: false, alter: false });
    await Batch.sync({ force: false, alter: false });
    await ProvenanceEvent.sync({ force: false, alter: false });
    await Geofence.sync({ force: false, alter: false });
    await Alert.sync({ force: false, alter: false });
    await VerificationRequest.sync({ force: false, alter: false });
    await ApiLog.sync({ force: false, alter: false });
    await AuditTrail.sync({ force: false, alter: false });
    await Webhook.sync({ force: false, alter: false });
    await enablePostgis();
    console.log("✅ All models synced successfully");
  } catch (error) {
    console.error("❌ Error syncing models:", error);
    throw error;
  }
};

const setupAssociations = () => {
  try {
    models.User.belongsTo(models.Enterprise, {
      foreignKey: "enterprise_id",
      as: "enterprise",
    });
    models.Enterprise.hasMany(models.User, {
      foreignKey: "enterprise_id",
      as: "users",
    });

    models.Enterprise.hasMany(models.Geofence, {
      foreignKey: "enterprise_id",
      as: "geofences",
    });
    models.Geofence.belongsTo(models.Enterprise, {
      foreignKey: "enterprise_id",
      as: "enterprise",
    });

    models.Enterprise.hasMany(models.Alert, {
      foreignKey: "enterprise_id",
      as: "alerts",
    });
    models.Alert.belongsTo(models.Enterprise, {
      foreignKey: "enterprise_id",
      as: "enterprise",
    });

    models.Enterprise.hasMany(models.Webhook, {
      foreignKey: "enterprise_id",
      as: "webhooks",
    });
    models.Webhook.belongsTo(models.Enterprise, {
      foreignKey: "enterprise_id",
      as: "enterprise",
    });

    models.User.hasMany(models.Product, {
      foreignKey: "manufacturer_id",
      as: "manufacturedProducts",
    });
    models.Product.belongsTo(models.User, {
      foreignKey: "manufacturer_id",
      as: "manufacturer",
    });

    models.Product.hasMany(models.Batch, {
      foreignKey: "product_id",
      as: "batches",
    });
    models.Batch.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });

    models.Batch.belongsTo(models.Batch, {
      foreignKey: "parent_batch_id",
      as: "parentBatch",
    });
    models.Batch.hasMany(models.Batch, {
      foreignKey: "parent_batch_id",
      as: "childBatches",
    });

    models.Product.hasMany(models.ProvenanceEvent, {
      foreignKey: "product_id",
      as: "events",
    });
    models.ProvenanceEvent.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });

    models.User.hasMany(models.ProvenanceEvent, {
      foreignKey: "user_id",
      as: "scans",
    });
    models.ProvenanceEvent.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "scanner",
    });

    models.ProvenanceEvent.hasMany(models.Alert, {
      foreignKey: "event_id",
      as: "alerts",
    });
    models.Alert.belongsTo(models.ProvenanceEvent, {
      foreignKey: "event_id",
      as: "event",
    });

    models.Product.hasMany(models.Alert, {
      foreignKey: "product_id",
      as: "alerts",
    });
    models.Alert.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });

    models.User.hasMany(models.Alert, {
      foreignKey: "resolved_by",
      as: "resolvedAlerts",
    });
    models.Alert.belongsTo(models.User, {
      foreignKey: "resolved_by",
      as: "resolver",
    });

    models.User.hasMany(models.ApiLog, {
      foreignKey: "user_id",
      as: "apiLogs",
    });
    models.ApiLog.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });

    models.Enterprise.hasMany(models.VerificationRequest, {
      foreignKey: "enterprise_id",
      as: "verificationRequests",
    });
    models.VerificationRequest.belongsTo(models.Enterprise, {
      foreignKey: "enterprise_id",
      as: "enterprise",
    });

    models.User.hasMany(models.AuditTrail, {
      foreignKey: "user_id",
      as: "auditTrails",
    });
    models.AuditTrail.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });

    console.log("✅ All associations set up successfully");
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
