const { ApiLog } = require("../models");
const { Op } = require("sequelize");

const TIER_LIMITS = {
  free: { perMinute: 10, perHour: 100 },
  basic: { perMinute: 60, perHour: 1000 },
  professional: { perMinute: 300, perHour: 5000 },
  enterprise: { perMinute: 1000, perHour: 20000 },
};

const getLimits = (req) => {
  const tier = req.user?.enterprise?.subscription_tier || "free";
  const tierLimits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return {
    perMinute: req.user?.rate_limit_per_minute || tierLimits.perMinute,
    perHour: tierLimits.perHour,
  };
};

const setRateLimitHeaders = (res, { limit, remaining, resetAt }) => {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.floor(resetAt.getTime() / 1000)));
};

const rateLimitMiddleware = async (req, res, next) => {
  try {
    if (!req.user) return next();

    const { perMinute } = getLimits(req);
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const resetAt = new Date(Date.now() + 60000);

    const count = await ApiLog.count({
      where: {
        user_id: req.user.id,
        createdAt: { [Op.gte]: oneMinuteAgo },
      },
    });

    setRateLimitHeaders(res, {
      limit: perMinute,
      remaining: perMinute - count,
      resetAt,
    });

    if (count >= perMinute) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({
        success: false,
        message: "Rate limit exceeded",
        retry_after_seconds: 60,
      });
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = { rateLimitMiddleware, TIER_LIMITS, setRateLimitHeaders };
