const crypto = require("crypto");
const axios = require("axios");
const { Webhook } = require("../models");

const signPayload = (secret, payload) =>
  `sha256=${crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")}`;

const deliverWebhook = async (webhook, event, data) => {
  const body = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const signature = signPayload(webhook.secret, body);
  const deliveryId = crypto.randomUUID();

  try {
    await axios.post(webhook.url, body, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "X-Provenance-Signature": signature,
        "X-Provenance-Event": event,
        "X-Provenance-Delivery": deliveryId,
      },
    });
    await webhook.update({
      last_triggered_at: new Date(),
      failure_count: 0,
    });
    return { success: true, deliveryId };
  } catch (error) {
    await webhook.update({
      failure_count: (webhook.failure_count || 0) + 1,
    });
    return { success: false, error: error.message, deliveryId };
  }
};

const emitEnterpriseEvent = async (enterpriseId, event, data) => {
  if (!enterpriseId) return [];

  const webhooks = await Webhook.findAll({
    where: { enterprise_id: enterpriseId, is_active: true },
  });

  const matching = webhooks.filter((w) => w.events.includes(event));
  const results = [];

  for (const webhook of matching) {
    results.push(await deliverWebhook(webhook, event, data));
  }

  return results;
};

module.exports = {
  signPayload,
  deliverWebhook,
  emitEnterpriseEvent,
};
