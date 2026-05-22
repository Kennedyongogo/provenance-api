const crypto = require("crypto");

const buildHashInput = ({
  product_id,
  previous_hash,
  action,
  latitude,
  longitude,
  user_id,
  timestamp,
  metadata,
}) =>
  JSON.stringify({
    product_id,
    previous_hash: previous_hash || null,
    action,
    latitude,
    longitude,
    user_id,
    timestamp: timestamp || new Date().toISOString(),
    metadata: metadata || {},
  });

const calculateHash = (input) =>
  crypto.createHash("sha256").update(typeof input === "string" ? input : buildHashInput(input)).digest("hex");

const verifyChain = (events) => {
  if (!events || events.length === 0) {
    return { chain_valid: true, broken_at_index: null, total_events: 0 };
  }

  for (let i = 1; i < events.length; i++) {
    if (events[i].previous_hash !== events[i - 1].current_hash) {
      return { chain_valid: false, broken_at_index: i, total_events: events.length };
    }
  }

  return { chain_valid: true, broken_at_index: null, total_events: events.length };
};

const computeTrustScore = (events) => {
  if (!events || events.length === 0) return 0;
  let score = 100;
  const unverified = events.filter((e) => !e.is_verified).length;
  score -= unverified * 10;
  const chain = verifyChain(events);
  if (!chain.chain_valid) score -= 50;
  return Math.max(0, Math.min(100, score));
};

module.exports = {
  buildHashInput,
  calculateHash,
  verifyChain,
  computeTrustScore,
};
