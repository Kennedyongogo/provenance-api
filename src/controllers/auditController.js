const { AuditTrail, User } = require("../models");
const { Op } = require("sequelize");
const { getAuditTrail } = require("../utils/auditLogger");

// Get all audit logs
const getAllAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      user_id,
      action,
      resource_type,
      resource_id,
      status,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (user_id) whereClause.user_id = user_id;
    if (action) whereClause.action = action;
    if (resource_type) whereClause.resource_type = resource_type;
    if (resource_id) whereClause.resource_id = resource_id;
    if (status) whereClause.status = status;
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await AuditTrail.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email"] },
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
    console.error("Error fetching audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit logs",
      error: error.message,
    });
  }
};

// Get audit trail for specific resource
const getResourceAuditTrail = async (req, res) => {
  try {
    const { resource_type, resource_id } = req.params;
    
    const logs = await getAuditTrail(resource_type, resource_id, 100);

    res.status(200).json({
      success: true,
      data: logs,
      resource_type,
      resource_id,
    });
  } catch (error) {
    console.error("Error fetching resource audit trail:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit trail",
      error: error.message,
    });
  }
};

// Get audit summary stats
const getAuditSummary = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Actions by type
    const byAction = await AuditTrail.findAll({
      where: { createdAt: { [Op.gte]: startDate } },
      attributes: [
        "action",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["action"],
    });

    // Resources by type
    const byResource = await AuditTrail.findAll({
      where: { createdAt: { [Op.gte]: startDate } },
      attributes: [
        "resource_type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["resource_type"],
    });

    // Daily activity
    const dailyActivity = await AuditTrail.findAll({
      where: { createdAt: { [Op.gte]: startDate } },
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
    });

    // Top users by activity
    const topUsers = await AuditTrail.findAll({
      where: { 
        createdAt: { [Op.gte]: startDate },
        user_id: { [Op.not]: null },
      },
      attributes: [
        "user_id",
        [sequelize.fn("COUNT", sequelize.col("id")), "activity_count"],
      ],
      include: [
        { model: User, as: "user", attributes: ["full_name", "email"] },
      ],
      group: ["user_id", "user.id"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
      limit: 10,
    });

    res.status(200).json({
      success: true,
      data: {
        by_action: byAction,
        by_resource: byResource,
        daily_activity: dailyActivity,
        top_users: topUsers,
        period_days: parseInt(days),
      },
    });
  } catch (error) {
    console.error("Error fetching audit summary:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit summary",
      error: error.message,
    });
  }
};

module.exports = {
  getAllAuditLogs,
  getResourceAuditTrail,
  getAuditSummary,
};