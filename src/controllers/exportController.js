const { ProvenanceEvent, Product } = require("../models");
const { Op } = require("sequelize");

const exportJobs = new Map();

const exportScans = async (req, res) => {
  try {
    const { startDate, endDate, format = "json", product_id, enterprise_id } = req.query;
    const exportId = `exp_${Date.now()}`;

    exportJobs.set(exportId, { status: "processing", createdAt: new Date() });

    const whereClause = {};
    if (product_id) whereClause.product_id = product_id;
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const include = [
      { model: Product, as: "product", attributes: ["product_code", "name"] },
    ];

    setImmediate(async () => {
      try {
        const scans = await ProvenanceEvent.findAll({
          where: whereClause,
          include,
          order: [["createdAt", "ASC"]],
          limit: 50000,
        });

        let payload;
        if (format === "csv") {
          const header =
            "id,product_code,action,latitude,longitude,is_verified,createdAt\n";
          const rows = scans
            .map(
              (s) =>
                `${s.id},${s.product?.product_code || ""},${s.action},${s.latitude},${s.longitude},${s.is_verified},${s.createdAt}`
            )
            .join("\n");
          payload = { format: "csv", content: header + rows };
        } else {
          payload = { format: "json", content: scans };
        }

        exportJobs.set(exportId, {
          status: "ready",
          readyAt: new Date(),
          data: payload,
        });
      } catch (err) {
        exportJobs.set(exportId, { status: "failed", error: err.message });
      }
    });

    res.status(202).json({
      success: true,
      message: "Export started",
      data: {
        export_id: exportId,
        estimated_completion: new Date(Date.now() + 5000).toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Export failed",
      error: error.message,
    });
  }
};

const getExportStatus = async (req, res) => {
  const job = exportJobs.get(req.params.export_id);
  if (!job) {
    return res.status(404).json({ success: false, message: "Export not found" });
  }
  res.status(200).json({
    success: true,
    data: {
      export_id: req.params.export_id,
      status: job.status,
      error: job.error,
    },
  });
};

const downloadExport = async (req, res) => {
  const job = exportJobs.get(req.params.export_id);
  if (!job || job.status !== "ready") {
    return res.status(404).json({
      success: false,
      message: "Export not ready",
    });
  }

  if (job.data.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="scans-${req.params.export_id}.csv"`
    );
    return res.send(job.data.content);
  }

  res.status(200).json({ success: true, data: job.data.content });
};

module.exports = {
  exportScans,
  getExportStatus,
  downloadExport,
};
