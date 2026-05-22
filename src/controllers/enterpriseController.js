const {
  Enterprise,
  User,
  Geofence,
  Alert,
  Product,
  ProvenanceEvent,
  sequelize,
} = require("../models");
const crypto = require("crypto");
const emailService = require("../services/emailService");
const { logCreate, logUpdate, logDelete } = require("../utils/auditLogger");
const { Op } = require("sequelize");

// Create enterprise
const createEnterprise = async (req, res) => {
  try {
    const {
      name,
      registration_number,
      tax_id,
      address,
      latitude,
      longitude,
      phone,
      email,
      website,
      industry,
      subscription_tier,
    } = req.body;

    const existingEnterprise = await Enterprise.findOne({ where: { email } });
    if (existingEnterprise) {
      return res.status(400).json({
        success: false,
        message: "Enterprise with this email already exists",
      });
    }

    const enterprise = await Enterprise.create({
      name,
      registration_number,
      tax_id,
      address,
      latitude,
      longitude,
      phone,
      email,
      website,
      industry,
      subscription_tier: subscription_tier || "free",
      scan_limit_monthly: subscription_tier === "enterprise" ? 100000 : subscription_tier === "professional" ? 10000 : 1000,
      is_verified: false,
    });

    await logCreate(
      req.user.id,
      "enterprise",
      enterprise.id,
      { name, email, industry },
      req,
      `Created enterprise: ${name}`
    );

    res.status(201).json({
      success: true,
      message: "Enterprise created successfully",
      data: enterprise,
    });
  } catch (error) {
    console.error("Error creating enterprise:", error);
    res.status(500).json({
      success: false,
      message: "Error creating enterprise",
      error: error.message,
    });
  }
};

// Get all enterprises
const getAllEnterprises = async (req, res) => {
  try {
    const { page = 1, limit = 20, industry, subscription_tier, search } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (industry) whereClause.industry = industry;
    if (subscription_tier) whereClause.subscription_tier = subscription_tier;
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { registration_number: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Enterprise.findAndCountAll({
      where: whereClause,
      include: [{ model: User, as: "users", attributes: ["id", "full_name", "email"], required: false }],
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
    console.error("Error fetching enterprises:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching enterprises",
      error: error.message,
    });
  }
};

// Get enterprise by ID
const getEnterpriseById = async (req, res) => {
  try {
    const { id } = req.params;

    const enterprise = await Enterprise.findByPk(id, {
      include: [
        { model: User, as: "users", attributes: { exclude: ["password"] } },
        { model: Geofence, as: "geofences" },
      ],
    });

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    res.status(200).json({
      success: true,
      data: enterprise,
    });
  } catch (error) {
    console.error("Error fetching enterprise:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching enterprise",
      error: error.message,
    });
  }
};

// Update enterprise
const updateEnterprise = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      address,
      latitude,
      longitude,
      phone,
      website,
      industry,
      subscription_tier,
      is_verified,
    } = req.body;

    const enterprise = await Enterprise.findByPk(id);
    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    const oldValues = {
      name: enterprise.name,
      subscription_tier: enterprise.subscription_tier,
      is_verified: enterprise.is_verified,
    };

    const updateData = {};
    if (name) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (latitude) updateData.latitude = latitude;
    if (longitude) updateData.longitude = longitude;
    if (phone) updateData.phone = phone;
    if (website) updateData.website = website;
    if (industry) updateData.industry = industry;
    if (subscription_tier) {
      updateData.subscription_tier = subscription_tier;
      // Update scan limits based on tier
      updateData.scan_limit_monthly = subscription_tier === "enterprise" ? 100000 : subscription_tier === "professional" ? 10000 : 1000;
    }
    if (is_verified !== undefined && req.user.role === "super_admin") {
      updateData.is_verified = is_verified;
      updateData.verified_by = req.user.id;
    }

    await enterprise.update(updateData);

    await logUpdate(
      req.user.id,
      "enterprise",
      id,
      oldValues,
      updateData,
      req,
      `Updated enterprise: ${enterprise.name}`
    );

    res.status(200).json({
      success: true,
      message: "Enterprise updated successfully",
      data: enterprise,
    });
  } catch (error) {
    console.error("Error updating enterprise:", error);
    res.status(500).json({
      success: false,
      message: "Error updating enterprise",
      error: error.message,
    });
  }
};

const getEnterpriseStats = async (req, res) => {
  try {
    const { id } = req.params;
    const enterprise = await Enterprise.findByPk(id);
    if (!enterprise) {
      return res.status(404).json({ success: false, message: "Enterprise not found" });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const enterpriseUserIds = (
      await User.findAll({
        where: { enterprise_id: id },
        attributes: ["id"],
      })
    ).map((u) => u.id);

    const productWhere = enterpriseUserIds.length
      ? { manufacturer_id: { [Op.in]: enterpriseUserIds } }
      : { manufacturer_id: null };

    const [
      totalUsers,
      activeUsers,
      totalProducts,
      activeProducts,
      totalGeofences,
      totalAlerts,
      criticalAlerts,
      totalEvents,
      scansThisMonth,
      scansLast24h,
      alertsLast24h,
      newProductsLast7d,
    ] = await Promise.all([
      User.count({ where: { enterprise_id: id } }),
      User.count({ where: { enterprise_id: id, isActive: true } }),
      Product.count({ where: productWhere }),
      Product.count({ where: { ...productWhere, is_active: true } }),
      Geofence.count({ where: { enterprise_id: id } }),
      Alert.count({ where: { enterprise_id: id } }),
      Alert.count({ where: { enterprise_id: id, severity: "critical", is_resolved: false } }),
      enterpriseUserIds.length
        ? ProvenanceEvent.count({ where: { user_id: { [Op.in]: enterpriseUserIds } } })
        : 0,
      enterprise.scans_used_this_month,
      enterpriseUserIds.length
        ? ProvenanceEvent.count({
            where: {
              user_id: { [Op.in]: enterpriseUserIds },
              createdAt: { [Op.gte]: startOfMonth },
            },
          })
        : 0,
      enterpriseUserIds.length
        ? ProvenanceEvent.count({
            where: {
              user_id: { [Op.in]: enterpriseUserIds },
              createdAt: { [Op.gte]: dayAgo },
            },
          })
        : 0,
      Alert.count({
        where: { enterprise_id: id, createdAt: { [Op.gte]: dayAgo } },
      }),
      Product.count({
        where: { ...productWhere, createdAt: { [Op.gte]: weekAgo } },
      }),
    ]);

    let topProducts = [];
    if (enterpriseUserIds.length) {
      try {
        topProducts = await sequelize.query(
          `SELECT p.product_code, p.name, COUNT(e.id)::int AS scans, MAX(e."createdAt") AS last_scan
           FROM provenance_events e
           JOIN products p ON p.id = e.product_id
           WHERE e.user_id IN (:userIds)
           GROUP BY p.id, p.product_code, p.name
           ORDER BY scans DESC
           LIMIT 5`,
          {
            replacements: { userIds: enterpriseUserIds },
            type: sequelize.QueryTypes.SELECT,
          }
        );
      } catch {
        topProducts = [];
      }
    }

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total_products: totalProducts,
          active_products: activeProducts,
          total_scans_this_month: scansThisMonth,
          scan_limit: enterprise.scan_limit_monthly,
          scan_usage_percentage: enterprise.scan_limit_monthly
            ? Number(((scansThisMonth / enterprise.scan_limit_monthly) * 100).toFixed(1))
            : 0,
          total_alerts: totalAlerts,
          critical_alerts: criticalAlerts,
          total_users: totalUsers,
          active_users: activeUsers,
          total_geofences: totalGeofences,
          total_provenance_events: totalEvents,
        },
        recent_activity: {
          scans_last_24h: scansLast24h,
          alerts_last_24h: alertsLast24h,
          new_products_last_7d: newProductsLast7d,
        },
        top_products: topProducts.map((row) => ({
          product_code: row.product_code,
          name: row.name,
          scans: row.scans,
          last_scan: row.last_scan,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching enterprise stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching enterprise stats",
      error: error.message,
    });
  }
};

const listEnterpriseUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { enterprise_id: req.params.id },
      attributes: { exclude: ["password", "refresh_token_hash", "password_reset_token"] },
      order: [["createdAt", "DESC"]],
    });
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching enterprise users",
      error: error.message,
    });
  }
};

const inviteEnterpriseUser = async (req, res) => {
  try {
    const { email, full_name, role } = req.body;
    const enterprise = await Enterprise.findByPk(req.params.id);
    if (!enterprise) {
      return res.status(404).json({ success: false, message: "Enterprise not found" });
    }

    let user = await User.findOne({ where: { email } });
    const inviteToken = crypto.randomBytes(32).toString("hex");

    if (user) {
      await user.update({
        enterprise_id: enterprise.id,
        invite_token: crypto.createHash("sha256").update(inviteToken).digest("hex"),
        invite_expires: new Date(Date.now() + 7 * 24 * 3600000),
        role: role || user.role,
      });
    } else {
      user = await User.create({
        email,
        full_name,
        password: await require("bcryptjs").hash(crypto.randomBytes(16).toString("hex"), 10),
        role: role || "warehouse_staff",
        enterprise_id: enterprise.id,
        invite_token: crypto.createHash("sha256").update(inviteToken).digest("hex"),
        invite_expires: new Date(Date.now() + 7 * 24 * 3600000),
        isActive: false,
        api_key: crypto.randomUUID(),
      });
    }

    await emailService.sendInviteEmail(user, inviteToken, enterprise.name);

    res.status(201).json({
      success: true,
      message: "Invitation sent",
      data: { user_id: user.id, email: user.email },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error inviting user",
      error: error.message,
    });
  }
};

const removeEnterpriseUser = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.userId, enterprise_id: req.params.id },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found in enterprise" });
    }
    await user.update({ enterprise_id: null, isActive: false });
    res.status(200).json({ success: true, message: "User removed from enterprise" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing user",
      error: error.message,
    });
  }
};

// Delete enterprise
const deleteEnterprise = async (req, res) => {
  try {
    const { id } = req.params;

    const enterprise = await Enterprise.findByPk(id);
    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    const enterpriseData = { name: enterprise.name, email: enterprise.email };
    await enterprise.destroy();

    await logDelete(
      req.user.id,
      "enterprise",
      id,
      enterpriseData,
      req,
      `Deleted enterprise: ${enterpriseData.name}`
    );

    res.status(200).json({
      success: true,
      message: "Enterprise deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting enterprise:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting enterprise",
      error: error.message,
    });
  }
};

module.exports = {
  createEnterprise,
  getAllEnterprises,
  getEnterpriseById,
  updateEnterprise,
  getEnterpriseStats,
  listEnterpriseUsers,
  inviteEnterpriseUser,
  removeEnterpriseUser,
  deleteEnterprise,
};