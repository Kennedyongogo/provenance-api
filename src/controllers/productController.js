const { Product, User, Batch, ProvenanceEvent, sequelize } = require("../models");
const { logCreate, logUpdate, logDelete } = require("../utils/auditLogger");
const { Op } = require("sequelize");
const qrCodeService = require("../services/qrCodeService");
const blockchainService = require("../services/blockchainService");

// Create product
const createProduct = async (req, res) => {
  try {
    const {
      product_code,
      name,
      description,
      category,
      batch_number,
      origin_latitude,
      origin_longitude,
      origin_address,
      production_date,
      expiry_date,
      metadata,
    } = req.body;

    // Check if product code exists
    const existingProduct = await Product.findOne({ where: { product_code } });
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Product with this code already exists",
      });
    }

    const product = await Product.create({
      product_code,
      name,
      description,
      category: category || "other",
      batch_number,
      manufacturer_id: req.user.id,
      origin_latitude,
      origin_longitude,
      origin_address,
      production_date,
      expiry_date,
      metadata: metadata || {},
      is_active: true,
    });

    const qrCodeUrl = await qrCodeService.generateQrDataUrl(product);
    await product.update({ qr_code_url: qrCodeUrl });

    const genesisHash = blockchainService.calculateHash({
      product_id: product.id,
      previous_hash: null,
      action: "CREATE",
      latitude: origin_latitude,
      longitude: origin_longitude,
      user_id: req.user.id,
      timestamp: new Date().toISOString(),
    });

    const genesisEvent = await ProvenanceEvent.create({
      product_id: product.id,
      user_id: req.user.id,
      previous_hash: null,
      current_hash: genesisHash,
      action: "CREATE",
      latitude: origin_latitude,
      longitude: origin_longitude,
      is_verified: true,
      verification_notes: "Genesis event - product creation",
    });

    await logCreate(
      req.user.id,
      "product",
      product.id,
      { product_code, name, category },
      req,
      `Created product: ${name} (${product_code})`
    );

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: {
        ...product.toJSON(),
        qr_code_url: qrCodeUrl,
        genesis_event: {
          hash: genesisEvent.current_hash,
          timestamp: genesisEvent.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      success: false,
      message: "Error creating product",
      error: error.message,
    });
  }
};

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, is_active, search, manufacturer_id } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (category) whereClause.category = category;
    if (is_active !== undefined) whereClause.is_active = is_active === "true";
    if (manufacturer_id) whereClause.manufacturer_id = manufacturer_id;
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { product_code: { [Op.like]: `%${search}%` } },
        { batch_number: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: "manufacturer", attributes: ["id", "full_name", "company_name"] },
        { model: Batch, as: "batches", limit: 5 },
      ],
      limit: limitNum,
      offset: offset,
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
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
};

// Get product by ID with full provenance chain
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id, {
      include: [
        { model: User, as: "manufacturer", attributes: ["id", "full_name", "company_name", "email"] },
        { 
          model: Batch, 
          as: "batches",
          include: [{ model: Batch, as: "childBatches" }]
        },
        {
          model: ProvenanceEvent,
          as: "events",
          limit: 100,
          order: [["createdAt", "ASC"]],
          include: [{ model: User, as: "scanner", attributes: ["id", "full_name"] }]
        }
      ],
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Calculate chain integrity
    const events = product.events;
    let chainValid = true;
    for (let i = 1; i < events.length; i++) {
      if (events[i].previous_hash !== events[i-1].current_hash) {
        chainValid = false;
        break;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...product.toJSON(),
        chain_integrity: {
          is_valid: chainValid,
          total_events: events.length,
          genesis_event: events[0]?.id || null,
        }
      },
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product",
      error: error.message,
    });
  }
};

// Get product trace as GeoJSON (for maps)
const getProductTraceGeoJSON = async (req, res) => {
  try {
    const { id } = req.params;

    const events = await ProvenanceEvent.findAll({
      where: { product_id: id },
      order: [["createdAt", "ASC"]],
      attributes: ["latitude", "longitude", "action", "createdAt", "current_hash", "is_verified"],
    });

    if (events.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No events found for this product",
      });
    }

    const geojson = {
      type: "FeatureCollection",
      features: events.map((event, index) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(event.longitude), parseFloat(event.latitude)],
        },
        properties: {
          index: index + 1,
          action: event.action,
          timestamp: event.createdAt,
          hash: event.current_hash.substring(0, 8),
          is_verified: event.is_verified,
        },
      })),
      line: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: events.map(e => [parseFloat(e.longitude), parseFloat(e.latitude)]),
        },
        properties: {
          type: "path",
          total_distance_km: calculateTotalDistance(events),
        },
      },
    };

    res.status(200).json({
      success: true,
      data: geojson,
    });
  } catch (error) {
    console.error("Error generating GeoJSON:", error);
    res.status(500).json({
      success: false,
      message: "Error generating product trace",
      error: error.message,
    });
  }
};

// Helper function to calculate total distance
const calculateTotalDistance = (events) => {
  let total = 0;
  for (let i = 1; i < events.length; i++) {
    const lat1 = parseFloat(events[i-1].latitude);
    const lon1 = parseFloat(events[i-1].longitude);
    const lat2 = parseFloat(events[i].latitude);
    const lon2 = parseFloat(events[i].longitude);
    
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    total += R * c;
  }
  return Math.round(total * 100) / 100;
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, expiry_date, metadata, is_active } = req.body;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const oldValues = {
      name: product.name,
      description: product.description,
      is_active: product.is_active,
    };

    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category) updateData.category = category;
    if (expiry_date) updateData.expiry_date = expiry_date;
    if (metadata) updateData.metadata = { ...product.metadata, ...metadata };
    if (is_active !== undefined) updateData.is_active = is_active;

    await product.update(updateData);

    await logUpdate(
      req.user.id,
      "product",
      id,
      oldValues,
      updateData,
      req,
      `Updated product: ${product.name}`
    );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "Error updating product",
      error: error.message,
    });
  }
};

const getProductQrCode = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const qr_code_url =
      product.qr_code_url || (await qrCodeService.generateQrDataUrl(product));
    if (!product.qr_code_url) await product.update({ qr_code_url });
    res.status(200).json({
      success: true,
      data: {
        product_id: product.id,
        product_code: product.product_code,
        qr_code_url,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating QR code",
      error: error.message,
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const eventCount = await ProvenanceEvent.count({ where: { product_id: id } });
    if (eventCount > 1) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete product with provenance history. Deactivate instead.",
        data: { event_count: eventCount },
      });
    }

    const productData = { name: product.name, product_code: product.product_code };
    await product.destroy();

    await logDelete(
      req.user.id,
      "product",
      id,
      productData,
      req,
      `Deleted product: ${productData.name}`
    );

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting product",
      error: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  getProductTraceGeoJSON,
  getProductQrCode,
  updateProduct,
  deleteProduct,
};