const {
    User,
    Enterprise,
    Product,
    ProvenanceEvent,
    Alert,
    VerificationRequest,
    Batch,
    Geofence,
    sequelize,
  } = require("../models");
  const { Op } = require("sequelize");
  
  // Main dashboard stats
  const getDashboardStats = async (req, res) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);
  
      // Core counts
      const [
        totalUsers,
        totalEnterprises,
        totalProducts,
        totalEvents,
        totalAlerts,
        unresolvedAlerts,
        totalVerifications,
        totalBatches,
        totalGeofences,
      ] = await Promise.all([
        User.count(),
        Enterprise.count(),
        Product.count(),
        ProvenanceEvent.count(),
        Alert.count(),
        Alert.count({ where: { is_resolved: false } }),
        VerificationRequest.count(),
        Batch.count(),
        Geofence.count(),
      ]);
  
      // Monthly activity
      const eventsThisMonth = await ProvenanceEvent.count({
        where: { createdAt: { [Op.gte]: startOfMonth } },
      });
  
      const verificationsThisMonth = await VerificationRequest.count({
        where: { createdAt: { [Op.gte]: startOfMonth } },
      });
  
      const alertsThisMonth = await Alert.count({
        where: { createdAt: { [Op.gte]: startOfMonth } },
      });
  
      // Trust score average
      const trustScoreAvg = await VerificationRequest.findOne({
        attributes: [[sequelize.fn("AVG", sequelize.col("confidence_score")), "avg_trust"]],
      });
  
      // Top products by verification
      const topProducts = await VerificationRequest.findAll({
        attributes: [
          "product_code",
          [sequelize.fn("COUNT", sequelize.col("id")), "verification_count"],
        ],
        group: ["product_code"],
        order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
        limit: 5,
      });
  
      // Alerts by severity
      const alertsBySeverity = await Alert.findAll({
        attributes: [
          "severity",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group: ["severity"],
      });
  
      // Recent activity
      const recentEvents = await ProvenanceEvent.findAll({
        limit: 10,
        order: [["createdAt", "DESC"]],
        include: [
          { model: Product, as: "product", attributes: ["name", "product_code"] },
          { model: User, as: "scanner", attributes: ["full_name"] },
        ],
      });
  
      const recentAlerts = await Alert.findAll({
        limit: 10,
        where: { is_resolved: false },
        order: [["severity", "DESC"], ["createdAt", "DESC"]],
        include: [
          { model: Product, as: "product", attributes: ["name", "product_code"] },
        ],
      });
  
      res.status(200).json({
        success: true,
        data: {
          summary: {
            total_users: totalUsers,
            total_enterprises: totalEnterprises,
            total_products: totalProducts,
            total_provenance_events: totalEvents,
            total_alerts: totalAlerts,
            unresolved_alerts: unresolvedAlerts,
            total_verifications: totalVerifications,
            total_batches: totalBatches,
            total_geofences: totalGeofences,
          },
          monthly: {
            events: eventsThisMonth,
            verifications: verificationsThisMonth,
            alerts: alertsThisMonth,
          },
          trust_metrics: {
            average_confidence_score: parseFloat(trustScoreAvg?.dataValues.avg_trust || 0).toFixed(2),
          },
          top_products: topProducts,
          alerts_by_severity: alertsBySeverity,
          recent_activity: {
            events: recentEvents,
            alerts: recentAlerts,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard stats",
        error: error.message,
      });
    }
  };
  
  module.exports = {
    getDashboardStats,
  };