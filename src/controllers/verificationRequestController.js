const { VerificationRequest, Enterprise, Product, sequelize } = require("../models");
const { Op } = require("sequelize");

// Get all verification requests (admin only)
const getAllVerifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      verification_result,
      startDate,
      endDate,
      product_code,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (verification_result) whereClause.verification_result = verification_result;
    if (product_code) whereClause.product_code = { [Op.like]: `%${product_code}%` };
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await VerificationRequest.findAndCountAll({
      where: whereClause,
      include: [
        { model: Enterprise, as: "enterprise", attributes: ["id", "name"] },
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
    console.error("Error fetching verifications:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verifications",
      error: error.message,
    });
  }
};

// Get verification statistics
const getVerificationStats = async (req, res) => {
  try {
    const { days = 30, enterprise_id } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const whereClause = {
      createdAt: { [Op.gte]: startDate },
    };
    
    if (enterprise_id) whereClause.enterprise_id = enterprise_id;

    // Total verifications by result
    const byResult = await VerificationRequest.findAll({
      where: whereClause,
      attributes: [
        "verification_result",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["verification_result"],
    });

    // Average confidence score by product
    const topProducts = await VerificationRequest.findAll({
      where: whereClause,
      attributes: [
        "product_code",
        [sequelize.fn("COUNT", sequelize.col("id")), "verification_count"],
        [sequelize.fn("AVG", sequelize.col("confidence_score")), "avg_confidence"],
      ],
      group: ["product_code"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
      limit: 10,
    });

    // Daily verification volume
    const dailyVolume = await VerificationRequest.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        [sequelize.fn("AVG", sequelize.col("confidence_score")), "avg_confidence"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
    });

    // Suspicious rate
    const totalCount = await VerificationRequest.count({ where: whereClause });
    const suspiciousCount = await VerificationRequest.count({
      where: {
        ...whereClause,
        verification_result: { [Op.in]: ["suspicious", "fake"] },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        by_result: byResult,
        top_products: topProducts,
        daily_volume: dailyVolume,
        summary: {
          total_verifications: totalCount,
          suspicious_count: suspiciousCount,
          suspicious_rate: totalCount > 0 ? ((suspiciousCount / totalCount) * 100).toFixed(2) : 0,
          period_days: parseInt(days),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching verification stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification statistics",
      error: error.message,
    });
  }
};

// Get verification by ID
const getVerificationById = async (req, res) => {
  try {
    const { id } = req.params;

    const verification = await VerificationRequest.findByPk(id, {
      include: [
        { model: Enterprise, as: "enterprise" },
      ],
    });

    if (!verification) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: verification,
    });
  } catch (error) {
    console.error("Error fetching verification:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification",
      error: error.message,
    });
  }
};

// Get verifications by product code
const getVerificationsByProduct = async (req, res) => {
  try {
    const { product_code } = req.params;
    const { limit = 50 } = req.query;

    const verifications = await VerificationRequest.findAll({
      where: { product_code },
      limit: parseInt(limit),
      order: [["createdAt", "DESC"]],
    });

    // Calculate aggregate stats for this product
    const stats = await VerificationRequest.findAll({
      where: { product_code },
      attributes: [
        "verification_result",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        [sequelize.fn("AVG", sequelize.col("confidence_score")), "avg_confidence"],
      ],
      group: ["verification_result"],
    });

    res.status(200).json({
      success: true,
      data: {
        product_code,
        total_verifications: verifications.length,
        recent_verifications: verifications.slice(0, 20),
        stats,
      },
    });
  } catch (error) {
    console.error("Error fetching product verifications:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product verifications",
      error: error.message,
    });
  }
};

// Export verification data as CSV
const exportVerificationsCSV = async (req, res) => {
  try {
    const { startDate, endDate, enterprise_id } = req.query;

    const whereClause = {};
    
    if (enterprise_id) whereClause.enterprise_id = enterprise_id;
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const verifications = await VerificationRequest.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: 10000, // Max 10k rows for export
    });

    // Create CSV content
    const headers = [
      "ID",
      "Product Code",
      "Verification Result",
      "Confidence Score",
      "Consumer IP",
      "Consumer Latitude",
      "Consumer Longitude",
      "Verification Date",
      "Enterprise ID",
    ];

    const rows = verifications.map(v => [
      v.id,
      v.product_code,
      v.verification_result,
      v.confidence_score,
      v.consumer_ip,
      v.consumer_location_lat || "",
      v.consumer_location_lng || "",
      v.createdAt.toISOString(),
      v.enterprise_id || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=verifications_${new Date().toISOString().split("T")[0]}.csv`);
    
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Error exporting verifications:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting verifications",
      error: error.message,
    });
  }
};

module.exports = {
  getAllVerifications,
  getVerificationStats,
  getVerificationById,
  getVerificationsByProduct,
  exportVerificationsCSV,
};