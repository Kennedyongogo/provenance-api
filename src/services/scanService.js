const {
  ProvenanceEvent,
  Product,
  User,
  Enterprise,
  Alert,
  sequelize,
} = require("../models");
const antiSpoofingService = require("./antiSpoofingService");
const blockchainService = require("./blockchainService");
const webhookService = require("./webhookService");
const { logCreate } = require("../utils/auditLogger");

const setPostgisPoint = async (eventId, longitude, latitude, transaction) => {
  try {
    await sequelize.query(
      `UPDATE provenance_events SET location_point = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) WHERE id = :id`,
      {
        replacements: { lng: longitude, lat: latitude, id: eventId },
        transaction,
      }
    );
  } catch (err) {
    // PostGIS extension may not be installed yet
    if (!err.message?.includes("location_point")) {
      console.warn("PostGIS update skipped:", err.message);
    }
  }
};

const createScan = async (req, body, options = {}) => {
  const transaction = options.transaction || (await sequelize.transaction());
  const ownTransaction = !options.transaction;

  try {
    const {
      product_id,
      action,
      latitude,
      longitude,
      location_accuracy_meters,
      altitude,
      cell_tower_fingerprint,
      wifi_fingerprint,
      device_id,
      photo_urls,
      metadata,
      scanned_at,
    } = body;

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      const err = new Error("Invalid coordinates");
      err.status = 400;
      throw err;
    }

    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      const err = new Error("Product not found");
      err.status = 404;
      throw err;
    }

    const lastEvent = await ProvenanceEvent.findOne({
      where: { product_id },
      order: [["createdAt", "DESC"]],
      transaction,
    });

    const { Enterprise } = require("../models");
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Enterprise, as: "enterprise" }],
      transaction,
    });

    const validation = await antiSpoofingService.runAllChecks({
      lastEvent,
      latitude,
      longitude,
      action,
      enterpriseId: user.enterprise_id,
      product_id,
      user_id: req.user.id,
      cell_tower_fingerprint,
      transaction,
    });

    const timestamp = scanned_at || new Date().toISOString();
    const previous_hash = lastEvent?.current_hash || null;
    const current_hash = blockchainService.calculateHash(
      blockchainService.buildHashInput({
        product_id,
        previous_hash,
        action,
        latitude,
        longitude,
        user_id: req.user.id,
        timestamp,
        metadata,
      })
    );

    const event = await ProvenanceEvent.create(
      {
        product_id,
        user_id: req.user.id,
        previous_hash,
        current_hash,
        action,
        latitude,
        longitude,
        location_accuracy_meters,
        altitude,
        cell_tower_fingerprint,
        wifi_fingerprint,
        device_id,
        photo_urls: photo_urls || [],
        metadata: metadata || {},
        is_verified: validation.is_verified,
        verification_notes: validation.verification_notes,
        ip_address: req.ip,
        createdAt: scanned_at ? new Date(scanned_at) : undefined,
      },
      { transaction }
    );

    await setPostgisPoint(event.id, longitude, latitude, transaction);

    if (!validation.is_verified) {
      await Alert.create(
        {
          enterprise_id: user.enterprise_id,
          product_id,
          event_id: event.id,
          alert_type: validation.flags.some((n) => n.includes("Impossible"))
            ? "SPOOFING_DETECTED"
            : "UNEXPECTED_LOCATION",
          severity: validation.trust_score < 30 ? "critical" : "warning",
          message: `Suspicious scan: ${validation.verification_notes}`,
          data: { action, location: { latitude, longitude } },
        },
        { transaction }
      );
    }

    if (user.enterprise_id) {
      const enterprise = await Enterprise.findByPk(user.enterprise_id, { transaction });
      if (enterprise) {
        await enterprise.increment("scans_used_this_month", { by: 1, transaction });
      }
    }

    if (ownTransaction) await transaction.commit();

    const chainCount = await ProvenanceEvent.count({ where: { product_id } });

    await logCreate(
      req.user.id,
      "provenance_event",
      event.id,
      { product_id, action },
      req,
      `Scan recorded: ${action}`
    );

    setImmediate(() => {
      webhookService.emitEnterpriseEvent(user.enterprise_id, "scan.created", {
        product_id,
        scan_id: event.id,
        action,
        location: { lat: latitude, lng: longitude },
        is_verified: validation.is_verified,
      });
    });

    return {
      event,
      validation,
      position_in_chain: chainCount,
      previous_hash,
      current_hash,
    };
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
};

module.exports = {
  createScan,
  setPostgisPoint,
};
