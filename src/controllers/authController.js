const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, Enterprise } = require("../models");
const config = require("../config/config");
const { logCreate, logLogin, logLogout, logUpdate } = require("../utils/auditLogger");
const emailService = require("../services/emailService");

const generateApiKey = () => crypto.randomUUID();

const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, type: "access" },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn || "7d" }
  );

const signRefreshToken = (user) =>
  jwt.sign(
    { id: user.id, type: "refresh" },
    config.jwtRefreshSecret || config.jwtSecret,
    { expiresIn: config.jwtRefreshExpiresIn || "30d" }
  );

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const userResponse = (user) => ({
  id: user.id,
  full_name: user.full_name,
  email: user.email,
  role: user.role,
  company_name: user.company_name,
  phone: user.phone,
  enterprise_id: user.enterprise_id,
  isActive: user.isActive,
  email_verified: user.email_verified,
  lastLogin: user.lastLogin,
});

const register = async (req, res) => {
  try {
    const { email, password, full_name, company_name, role, enterprise_id, phone } =
      req.body;

    if (await User.findOne({ where: { email } })) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    if (enterprise_id && !(await Enterprise.findByPk(enterprise_id))) {
      return res.status(404).json({ success: false, message: "Enterprise not found" });
    }

    const user = await User.create({
      email,
      password: await bcrypt.hash(password, 10),
      full_name,
      company_name,
      phone,
      role: role || "consumer",
      enterprise_id: enterprise_id || null,
      api_key: generateApiKey(),
      isActive: true,
    });

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await user.update({ refresh_token_hash: hashToken(refreshToken) });

    await logCreate(user.id, "user", user.id, { email, role: user.role }, req);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: userResponse(user),
        token,
        refresh_token: refreshToken,
        api_key: user.api_key,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error registering user",
      error: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      where: { email },
      include: [{ model: Enterprise, as: "enterprise" }],
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      await logLogin(null, req, false, "Invalid credentials");
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    await user.update({ lastLogin: new Date() });
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await user.update({ refresh_token_hash: hashToken(refreshToken) });
    await logLogin(user.id, req, true);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: userResponse(user),
        token,
        refresh_token: refreshToken,
        api_key: user.api_key,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error logging in",
      error: error.message,
    });
  }
};

const logout = async (req, res) => {
  try {
    await User.update(
      { refresh_token_hash: null },
      { where: { id: req.user.id } }
    );
    await logLogout(req.user.id, req);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

const refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: "refresh_token is required",
      });
    }

    const decoded = jwt.verify(
      refresh_token,
      config.jwtRefreshSecret || config.jwtSecret
    );
    if (decoded.type !== "refresh") {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }

    const user = await User.findByPk(decoded.id);
    if (!user || user.refresh_token_hash !== hashToken(refresh_token)) {
      return res.status(401).json({ success: false, message: "Refresh token revoked" });
    }

    const token = signAccessToken(user);
    const newRefresh = signRefreshToken(user);
    await user.update({ refresh_token_hash: hashToken(newRefresh) });

    res.status(200).json({
      success: true,
      data: { token, refresh_token: newRefresh },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
};

const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: userResponse(req.user),
  });
};

const updateMe = async (req, res) => {
  try {
    const { full_name, company_name, phone } = req.body;
    const old = {
      full_name: req.user.full_name,
      company_name: req.user.company_name,
      phone: req.user.phone,
    };
    await req.user.update({
      ...(full_name && { full_name }),
      ...(company_name !== undefined && { company_name }),
      ...(phone !== undefined && { phone }),
    });
    await logUpdate(req.user.id, "user", req.user.id, old, req.body, req);
    res.status(200).json({
      success: true,
      message: "Profile updated",
      data: userResponse(req.user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    await user.update({ password: await bcrypt.hash(newPassword, 10) });
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If that email exists, a reset link has been sent",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    await user.update({
      password_reset_token: hashToken(resetToken),
      password_reset_expires: new Date(Date.now() + 3600000),
    });
    await emailService.sendPasswordResetEmail(user, resetToken);

    res.status(200).json({
      success: true,
      message: "If that email exists, a reset link has been sent",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing password reset",
      error: error.message,
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      where: {
        password_reset_token: hashToken(token),
        password_reset_expires: { [require("sequelize").Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    await user.update({
      password: await bcrypt.hash(newPassword, 10),
      password_reset_token: null,
      password_reset_expires: null,
    });

    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error resetting password",
      error: error.message,
    });
  }
};

const regenerateApiKey = async (req, res) => {
  try {
    const user = req.params.id
      ? await User.findByPk(req.params.id)
      : req.user;
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const api_key = generateApiKey();
    await user.update({ api_key });
    res.status(200).json({
      success: true,
      message: "API key regenerated",
      data: { api_key },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error regenerating API key",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  regenerateApiKey,
};
