const crypto = require("crypto");
const { Webhook } = require("../models");
const { logCreate, logDelete } = require("../utils/auditLogger");

const createWebhook = async (req, res) => {
  try {
    const { url, events, enterprise_id } = req.body;
    const entId = enterprise_id || req.user.enterprise_id;

    if (!entId) {
      return res.status(400).json({
        success: false,
        message: "enterprise_id is required",
      });
    }

    const secret = crypto.randomBytes(24).toString("hex");
    const webhook = await Webhook.create({
      enterprise_id: entId,
      url,
      events: events || ["scan.created", "alert.raised"],
      secret,
      is_active: true,
    });

    await logCreate(req.user.id, "system", webhook.id, { url }, req);

    res.status(201).json({
      success: true,
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        secret,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating webhook",
      error: error.message,
    });
  }
};

const listWebhooks = async (req, res) => {
  try {
    const where = {};
    if (req.query.enterprise_id) where.enterprise_id = req.query.enterprise_id;
    else if (req.user.role !== "super_admin") {
      where.enterprise_id = req.user.enterprise_id;
    }

    const webhooks = await Webhook.findAll({
      where,
      attributes: { exclude: ["secret"] },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({ success: true, data: webhooks });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error listing webhooks",
      error: error.message,
    });
  }
};

const deleteWebhook = async (req, res) => {
  try {
    const webhook = await Webhook.findByPk(req.params.id);
    if (!webhook) {
      return res.status(404).json({ success: false, message: "Webhook not found" });
    }
    await logDelete(req.user.id, "system", webhook.id, { url: webhook.url }, req);
    await webhook.destroy();
    res.status(200).json({ success: true, message: "Webhook deleted" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting webhook",
      error: error.message,
    });
  }
};

module.exports = {
  createWebhook,
  listWebhooks,
  deleteWebhook,
};
