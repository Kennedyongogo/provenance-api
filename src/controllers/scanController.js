const {
  ProvenanceEvent,
  Product,
  User,
  Alert,
  VerificationRequest,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const scanService = require("../services/scanService");
const blockchainService = require("../services/blockchainService");
const geofenceService = require("../services/geofenceService");
const { logCreate, logVerification } = require("../utils/auditLogger");

const formatScanResponse = (result) => ({
  event_id: result.event.id,
  block_hash: result.current_hash,
  previous_hash: result.previous_hash,
  position_in_chain: result.position_in_chain,
  is_verified: result.event.is_verified,
  trust_score: result.validation.trust_score,
  verification_notes: result.event.verification_notes,
});

const createScan = async (req, res) => {
  try {
    const result = await scanService.createScan(req, req.body);
    res.status(201).json({
      success: true,
      message: result.validation.is_verified
        ? "Provenance event recorded"
        : "Event recorded with warnings",
      data: formatScanResponse(result),
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || "Error recording scan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const bulkCreateScans = async (req, res) => {
  try {
    const { scans } = req.body;
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({
        success: false,
        message: "scans array is required",
      });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < scans.length; i++) {
      try {
        const result = await scanService.createScan(req, scans[i]);
        results.push({ index: i, success: true, data: formatScanResponse(result) });
      } catch (err) {
        errors.push({ index: i, success: false, message: err.message });
      }
    }

    res.status(200).json({
      success: errors.length === 0,
      message: `Processed ${results.length} scans, ${errors.length} failed`,
      data: { results, errors },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Bulk scan sync failed",
      error: error.message,
    });
  }
};

const getAllScans = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      product_id,
      user_id,
      action,
      is_verified,
      enterprise_id,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const offset = (pageNum - 1) * limitNum;
    const whereClause = {};

    if (product_id) whereClause.product_id = product_id;
    if (user_id) whereClause.user_id = user_id;
    if (action) whereClause.action = action;
    if (is_verified !== undefined) whereClause.is_verified = is_verified === "true";

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const include = [
      { model: Product, as: "product", attributes: ["id", "product_code", "name"] },
      { model: User, as: "scanner", attributes: ["id", "full_name", "enterprise_id"] },
    ];

    if (enterprise_id) {
      include[1].where = { enterprise_id };
    }

    const { count, rows } = await ProvenanceEvent.findAndCountAll({
      where: whereClause,
      include,
      limit: limitNum,
      offset,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching scans",
      error: error.message,
    });
  }
};

const getEventsByProduct = async (req, res) => {
  try {
    const product_id = req.params.product_id || req.params.id;
    const { limit = 100, offset = 0 } = req.query;

    const events = await ProvenanceEvent.findAndCountAll({
      where: { product_id },
      include: [
        { model: User, as: "scanner", attributes: ["id", "full_name", "company_name"] },
        { model: Product, as: "product", attributes: ["id", "product_code", "name"] },
      ],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [["createdAt", "ASC"]],
    });

    res.status(200).json({
      success: true,
      data: events.rows,
      pagination: {
        total: events.count,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching product scans",
      error: error.message,
    });
  }
};

const getScanById = async (req, res) => {
  try {
    const event = await ProvenanceEvent.findByPk(req.params.id, {
      include: [
        { model: Product, as: "product" },
        { model: User, as: "scanner", attributes: ["id", "full_name", "email"] },
        { model: Alert, as: "alerts" },
      ],
    });

    if (!event) {
      return res.status(404).json({ success: false, message: "Scan not found" });
    }

    res.status(200).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching scan",
      error: error.message,
    });
  }
};

const verifyChainIntegrity = async (req, res) => {
  try {
    const product_id = req.params.product_id || req.params.id;
    const events = await ProvenanceEvent.findAll({
      where: { product_id },
      order: [["createdAt", "ASC"]],
    });

    const chain = blockchainService.verifyChain(events);

    res.status(200).json({
      success: true,
      data: {
        product_id,
        chain_valid: chain.chain_valid,
        total_events: chain.total_events,
        broken_at_index: chain.broken_at_index,
        genesis_hash: events[0]?.current_hash || null,
        latest_hash: events[events.length - 1]?.current_hash || null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error verifying chain",
      error: error.message,
    });
  }
};

const publicVerify = async (req, res) => {
  try {
    const { product_code } = req.params;
    const { consumer_lat, consumer_lng, tier = "free" } = req.query;

    const product = await Product.findOne({
      where: { product_code },
      include: [
        { model: User, as: "manufacturer", attributes: ["company_name", "full_name"] },
        {
          model: ProvenanceEvent,
          as: "events",
          order: [["createdAt", "ASC"]],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const events = product.events || [];
    const chain = blockchainService.verifyChain(events);
    const trustScore = blockchainService.computeTrustScore(events);
    const isExpired =
      product.expiry_date && new Date(product.expiry_date) < new Date();

    let result = "authentic";
    if (isExpired) result = "expired";
    else if (trustScore < 30) result = "fake";
    else if (trustScore < 70) result = "suspicious";

    await VerificationRequest.create({
      product_code,
      consumer_ip: req.ip,
      consumer_location_lat: consumer_lat || null,
      consumer_location_lng: consumer_lng || null,
      verification_result: result,
      confidence_score: trustScore,
    });

    await logVerification(product_code, result, trustScore, req);

    const base = {
      product: {
        name: product.name,
        product_code: product.product_code,
        manufacturer:
          product.manufacturer?.company_name ||
          product.manufacturer?.full_name ||
          "Unknown",
        production_date: product.production_date,
        expiry_date: product.expiry_date,
        is_expired: isExpired,
      },
      verification: {
        result,
        confidence_score: trustScore,
        message: `This product has ${events.length} scans recorded in its journey.`,
      },
      journey_summary: {
        origin: events[0]
          ? `${events[0].latitude}, ${events[0].longitude}`
          : "Unknown",
        total_distance_km: null,
        scan_count: events.length,
        first_seen: events[0]?.createdAt || null,
        last_seen: events[events.length - 1]?.createdAt || null,
      },
      chain_integrity: {
        is_valid: chain.chain_valid,
        total_blocks: chain.total_events,
      },
    };

    if (tier === "premium") {
      const traceEvents = await ProvenanceEvent.findAll({
        where: { product_id: product.id },
        order: [["createdAt", "ASC"]],
      });
      base.full_trace = {
        events: traceEvents.map((e) => ({
          action: e.action,
          location: { lat: parseFloat(e.latitude), lng: parseFloat(e.longitude) },
          timestamp: e.createdAt,
          photo: e.photo_urls?.[0] || null,
          temperature: e.metadata?.temperature_celsius ?? null,
          verified: e.is_verified,
        })),
      };
      base.certificate_url = `${process.env.API_BASE_URL || ""}/api/v1/public/verify/${product_code}/certificate`;
    }

    res.status(200).json({ success: true, data: base });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error verifying product",
      error: error.message,
    });
  }
};

const checkGeofencePoint = async (req, res) => {
  try {
    const { latitude, longitude } = req.body.latitude
      ? req.body
      : { latitude: req.query.latitude, longitude: req.query.longitude };

    const result = await geofenceService.checkPointInGeofenceById(
      req.params.id,
      parseFloat(latitude),
      parseFloat(longitude)
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Geofence check failed",
      error: error.message,
    });
  }
};

module.exports = {
  createScan,
  bulkCreateScans,
  getAllScans,
  getEventsByProduct,
  getScanById,
  verifyChainIntegrity,
  publicVerify,
  checkGeofencePoint,
  // Aliases for legacy controller name
  createProvenanceEvent: createScan,
  getEventById: getScanById,
};
