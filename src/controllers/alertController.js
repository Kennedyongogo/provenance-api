const { Alert, Enterprise, Product, ProvenanceEvent, User, sequelize } = require("../models");
const { logUpdate } = require("../utils/auditLogger");
const { Op } = require("sequelize");

// Get all alerts
const getAllAlerts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      enterprise_id,
      severity,
      alert_type,
      is_resolved,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (enterprise_id) whereClause.enterprise_id = enterprise_id;
    if (severity) whereClause.severity = severity;
    if (alert_type) whereClause.alert_type = alert_type;
    if (is_resolved !== undefined) whereClause.is_resolved = is_resolved === "true";
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await Alert.findAndCountAll({
      where: whereClause,
      include: [
        { model: Enterprise, as: "enterprise", attributes: ["id", "name"] },
        { model: Product, as: "product", attributes: ["id", "name", "product_code"] },
        { model: ProvenanceEvent, as: "event", attributes: ["id", "action", "latitude", "longitude", "createdAt"] },
        { model: User, as: "resolver", attributes: ["id", "full_name", "email"] },
      ],
      limit: limitNum,
      offset: offset,
      order: [["severity", "DESC"], ["createdAt", "DESC"]],
    });

    // Add summary statistics
    const summary = await Alert.findAll({
      where: whereClause,
      attributes: [
        "severity",
        [sequelize.fn("COUNT", sequelize.col("severity")), "count"],
      ],
      group: ["severity"],
    });

    const bySeverity = {};
    summary.forEach(s => { bySeverity[s.severity] = parseInt(s.dataValues.count); });

    res.status(200).json({
      success: true,
      data: rows,
      summary: {
        by_severity: bySeverity,
        total: count,
        unresolved: await Alert.count({ 
          where: { ...whereClause, is_resolved: false } 
        }),
      },
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alerts",
      error: error.message,
    });
  }
};

// Get alert by ID
const getAlertById = async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await Alert.findByPk(id, {
      include: [
        { model: Enterprise, as: "enterprise" },
        { model: Product, as: "product" },
        { model: ProvenanceEvent, as: "event" },
        { model: User, as: "resolver" },
      ],
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    res.status(200).json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error("Error fetching alert:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alert",
      error: error.message,
    });
  }
};

// Resolve an alert
const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_notes } = req.body;

    const alert = await Alert.findByPk(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    if (alert.is_resolved) {
      return res.status(400).json({
        success: false,
        message: "Alert already resolved",
      });
    }

    const oldValues = { is_resolved: alert.is_resolved };
    const updateData = {
      is_resolved: true,
      resolved_at: new Date(),
      resolved_by: req.user.id,
    };

    // Add resolution notes to data field
    if (resolution_notes) {
      const currentData = alert.data || {};
      updateData.data = { ...currentData, resolution_notes, resolved_by_name: req.user.full_name };
    }

    await alert.update(updateData);

    await logUpdate(
      req.user.id,
      "alert",
      id,
      oldValues,
      updateData,
      req,
      `Resolved alert: ${alert.alert_type}`
    );

    res.status(200).json({
      success: true,
      message: "Alert resolved successfully",
      data: alert,
    });
  } catch (error) {
    console.error("Error resolving alert:", error);
    res.status(500).json({
      success: false,
      message: "Error resolving alert",
      error: error.message,
    });
  }
};

// Get alerts by enterprise
const getAlertsByEnterprise = async (req, res) => {
  try {
    const { enterprise_id } = req.params;
    const { limit = 50, severity, unresolved_only } = req.query;

    const whereClause = { enterprise_id };

    if (severity) whereClause.severity = severity;
    if (unresolved_only === "true") whereClause.is_resolved = false;

    const alerts = await Alert.findAll({
      where: whereClause,
      include: [
        { model: Product, as: "product", attributes: ["id", "name", "product_code"] },
        { model: ProvenanceEvent, as: "event", attributes: ["id", "action", "createdAt"] },
      ],
      limit: parseInt(limit),
      order: [["severity", "DESC"], ["createdAt", "DESC"]],
    });

    // Get counts for dashboard
    const counts = await Alert.findAll({
      where: { enterprise_id },
      attributes: [
        "severity",
        "is_resolved",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["severity", "is_resolved"],
    });

    const stats = {
      critical: { unresolved: 0, resolved: 0, total: 0 },
      warning: { unresolved: 0, resolved: 0, total: 0 },
      info: { unresolved: 0, resolved: 0, total: 0 },
    };

    counts.forEach(c => {
      const severity = c.severity;
      const isResolved = c.is_resolved;
      const count = parseInt(c.dataValues.count);
      
      if (stats[severity]) {
        stats[severity].total += count;
        if (isResolved) {
          stats[severity].resolved += count;
        } else {
          stats[severity].unresolved += count;
        }
      }
    });

    res.status(200).json({
      success: true,
      data: alerts,
      stats,
    });
  } catch (error) {
    console.error("Error fetching enterprise alerts:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching enterprise alerts",
      error: error.message,
    });
  }
};

// Get alert statistics (for dashboard)
const getAlertStats = async (req, res) => {
  try {
    const { days = 30, enterprise_id } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const whereClause = {
      createdAt: { [Op.gte]: startDate },
    };
    
    if (enterprise_id) whereClause.enterprise_id = enterprise_id;

    // Get alerts by day
    const dailyAlerts = await Alert.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        "severity",
      ],
      group: [sequelize.fn("DATE", sequelize.col("createdAt")), "severity"],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
    });

    // Get alerts by type
    const byType = await Alert.findAll({
      where: whereClause,
      attributes: [
        "alert_type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["alert_type"],
    });

    // Average resolution time
    const resolutionTime = await Alert.findAll({
      where: {
        ...whereClause,
        is_resolved: true,
        resolved_at: { [Op.not]: null },
      },
      attributes: [
        [sequelize.fn("AVG", sequelize.literal("EXTRACT(EPOCH FROM (resolved_at - createdAt)) / 3600")), "avg_hours"],
      ],
    });

    res.status(200).json({
      success: true,
      data: {
        daily: dailyAlerts,
        by_type: byType,
        avg_resolution_time_hours: parseFloat(resolutionTime[0]?.dataValues.avg_hours || 0).toFixed(2),
        period_days: parseInt(days),
      },
    });
  } catch (error) {
    console.error("Error fetching alert stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching alert statistics",
      error: error.message,
    });
  }
};

// Bulk resolve alerts
const bulkResolveAlerts = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { alert_ids, resolution_notes } = req.body;

    if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "alert_ids array is required",
      });
    }

    const [updatedCount] = await Alert.update(
      {
        is_resolved: true,
        resolved_at: new Date(),
        resolved_by: req.user.id,
        data: sequelize.literal(`jsonb_set(COALESCE(data, '{}'), '{resolution_notes}', '"${resolution_notes || "Bulk resolved"}"')`),
      },
      {
        where: {
          id: alert_ids,
          is_resolved: false,
        },
        transaction,
      }
    );

    await transaction.commit();

    await logUpdate(
      req.user.id,
      "alert",
      null,
      { action: "bulk_resolve" },
      { resolved_count: updatedCount },
      req,
      `Bulk resolved ${updatedCount} alerts`
    );

    res.status(200).json({
      success: true,
      message: `${updatedCount} alerts resolved successfully`,
      data: { resolved_count: updatedCount },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk resolving alerts:", error);
    res.status(500).json({
      success: false,
      message: "Error bulk resolving alerts",
      error: error.message,
    });
  }
};

module.exports = {
  getAllAlerts,
  getAlertById,
  resolveAlert,
  getAlertsByEnterprise,
  getAlertStats,
  bulkResolveAlerts,
};