const { ApiLog, User, sequelize } = require("../models");
const { Op } = require("sequelize");

// Get API logs (admin only)
const getApiLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      user_id,
      method,
      endpoint,
      min_response_time_ms,
      status_code,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (user_id) whereClause.user_id = user_id;
    if (method) whereClause.method = method;
    if (endpoint) whereClause.endpoint = { [Op.like]: `%${endpoint}%` };
    if (status_code) whereClause.response_status = parseInt(status_code);
    if (min_response_time_ms) whereClause.response_time_ms = { [Op.gte]: parseInt(min_response_time_ms) };
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await ApiLog.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email", "company_name"] },
      ],
      limit: limitNum,
      offset: offset,
      order: [["createdAt", "DESC"]],
    });

    // Add summary stats
    const stats = await ApiLog.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "total_requests"],
        [sequelize.fn("AVG", sequelize.col("response_time_ms")), "avg_response_time"],
        [sequelize.fn("MAX", sequelize.col("response_time_ms")), "max_response_time"],
        [sequelize.fn("MIN", sequelize.col("response_time_ms")), "min_response_time"],
      ],
    });

    // Status code distribution
    const statusDistribution = await ApiLog.findAll({
      where: whereClause,
      attributes: [
        "response_status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["response_status"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      summary: {
        total_requests: parseInt(stats[0]?.dataValues.total_requests || 0),
        avg_response_time_ms: parseFloat(stats[0]?.dataValues.avg_response_time || 0).toFixed(2),
        max_response_time_ms: parseInt(stats[0]?.dataValues.max_response_time || 0),
        min_response_time_ms: parseInt(stats[0]?.dataValues.min_response_time || 0),
        status_distribution: statusDistribution,
      },
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching API logs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching API logs",
      error: error.message,
    });
  }
};

// Get API usage by user (for rate limiting dashboard)
const getUserApiUsage = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Daily usage
    const dailyUsage = await ApiLog.findAll({
      where: {
        user_id,
        createdAt: { [Op.gte]: startDate },
      },
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("COUNT", sequelize.col("id")), "request_count"],
        [sequelize.fn("AVG", sequelize.col("response_time_ms")), "avg_response_time"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
    });

    // Endpoint usage
    const endpointUsage = await ApiLog.findAll({
      where: {
        user_id,
        createdAt: { [Op.gte]: startDate },
      },
      attributes: [
        "endpoint",
        "method",
        [sequelize.fn("COUNT", sequelize.col("id")), "request_count"],
        [sequelize.fn("AVG", sequelize.col("response_time_ms")), "avg_response_time"],
      ],
      group: ["endpoint", "method"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
      limit: 20,
    });

    // Error rate
    const totalRequests = await ApiLog.count({
      where: {
        user_id,
        createdAt: { [Op.gte]: startDate },
      },
    });

    const errorRequests = await ApiLog.count({
      where: {
        user_id,
        createdAt: { [Op.gte]: startDate },
        response_status: { [Op.gte]: 400 },
      },
    });

    // Hourly distribution (for rate limiting optimization)
    const hourlyDistribution = await ApiLog.findAll({
      where: {
        user_id,
        createdAt: { [Op.gte]: startDate },
      },
      attributes: [
        [sequelize.fn("EXTRACT", sequelize.literal("HOUR FROM createdAt")), "hour"],
        [sequelize.fn("COUNT", sequelize.col("id")), "request_count"],
      ],
      group: [sequelize.fn("EXTRACT", sequelize.literal("HOUR FROM createdAt"))],
      order: [[sequelize.fn("EXTRACT", sequelize.literal("HOUR FROM createdAt")), "ASC"]],
    });

    const user = await User.findByPk(user_id, {
      attributes: ["id", "full_name", "email", "api_key", "rate_limit_per_minute"],
    });

    res.status(200).json({
      success: true,
      data: {
        user,
        summary: {
          total_requests: totalRequests,
          error_count: errorRequests,
          error_rate: totalRequests > 0 ? ((errorRequests / totalRequests) * 100).toFixed(2) : 0,
          period_days: parseInt(days),
        },
        daily_usage: dailyUsage,
        endpoint_usage: endpointUsage,
        hourly_distribution: hourlyDistribution,
      },
    });
  } catch (error) {
    console.error("Error fetching user API usage:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching API usage",
      error: error.message,
    });
  }
};

// Get API rate limit alerts
const getRateLimitAlerts = async (req, res) => {
  try {
    const { threshold_percentage = 80 } = req.query;

    // Find users who are close to their rate limit
    const users = await User.findAll({
      where: { isActive: true },
      attributes: ["id", "full_name", "email", "rate_limit_per_minute"],
    });

    const alerts = [];
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    for (const user of users) {
      const requestsLastMinute = await ApiLog.count({
        where: {
          user_id: user.id,
          createdAt: { [Op.gte]: oneMinuteAgo },
        },
      });

      const usagePercentage = (requestsLastMinute / user.rate_limit_per_minute) * 100;
      
      if (usagePercentage >= threshold_percentage) {
        alerts.push({
          user_id: user.id,
          user_name: user.full_name,
          user_email: user.email,
          requests_last_minute: requestsLastMinute,
          rate_limit: user.rate_limit_per_minute,
          usage_percentage: usagePercentage.toFixed(2),
          severity: usagePercentage >= 100 ? "critical" : usagePercentage >= 90 ? "high" : "medium",
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        alerts,
        alert_count: alerts.length,
        threshold_percentage: parseFloat(threshold_percentage),
        checked_at: now,
      },
    });
  } catch (error) {
    console.error("Error fetching rate limit alerts:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching rate limit alerts",
      error: error.message,
    });
  }
};

// Clean old API logs (admin only)
const cleanOldLogs = async (req, res) => {
  try {
    const { days_to_keep = 90 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days_to_keep));

    const deletedCount = await ApiLog.destroy({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
      },
    });

    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} log entries older than ${days_to_keep} days`,
      data: {
        deleted_count: deletedCount,
        days_kept: parseInt(days_to_keep),
        cutoff_date: cutoffDate,
      },
    });
  } catch (error) {
    console.error("Error cleaning old logs:", error);
    res.status(500).json({
      success: false,
      message: "Error cleaning old logs",
      error: error.message,
    });
  }
};

module.exports = {
  getApiLogs,
  getUserApiUsage,
  getRateLimitAlerts,
  cleanOldLogs,
};