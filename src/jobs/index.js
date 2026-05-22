const cron = require("node-cron");
const { Enterprise, ApiLog, ProvenanceEvent } = require("../models");
const { Op } = require("sequelize");

const startJobs = () => {
  // Reset monthly scan counters on the 1st of each month at midnight
  cron.schedule("0 0 1 * *", async () => {
    try {
      await Enterprise.update({ scans_used_this_month: 0 }, { where: {} });
      console.log("✅ Monthly scan counters reset");
    } catch (error) {
      console.error("Monthly reset job failed:", error.message);
    }
  });

  // Clean API logs older than 90 days — weekly
  cron.schedule("0 3 * * 0", async () => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const deleted = await ApiLog.destroy({
        where: { createdAt: { [Op.lt]: cutoff } },
      });
      console.log(`✅ Cleaned ${deleted} old API log rows`);
    } catch (error) {
      console.error("API log cleanup job failed:", error.message);
    }
  });

  // Mark expired products inactive — daily
  cron.schedule("0 4 * * *", async () => {
    try {
      const { Product } = require("../models");
      const [count] = await Product.update(
        { is_active: false },
        {
          where: {
            expiry_date: { [Op.lt]: new Date() },
            is_active: true,
          },
        }
      );
      if (count > 0) console.log(`✅ Deactivated ${count} expired products`);
    } catch (error) {
      console.error("Expire products job failed:", error.message);
    }
  });

  console.log("✅ Background jobs scheduled");
};

module.exports = { startJobs };
