const {
    User,
    Enterprise,
    ApiLog,
    AuditTrail,
    sequelize
  } = require("../models");
  const bcrypt = require("bcryptjs");
  const jwt = require("jsonwebtoken");
  const config = require("../config/config");
  const { Op } = require("sequelize");
  const { logCreate, logUpdate, logDelete, logLogin } = require("../utils/auditLogger");
  const crypto = require("crypto");
  
  // Generate API key
  const generateApiKey = () => {
    return crypto.randomUUID();
  };
  
  // Register new user
  const register = async (req, res) => {
    try {
      const { email, password, full_name, company_name, role, enterprise_id } = req.body;
  
      // Check if user exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        });
      }
  
      // Verify enterprise exists if provided
      if (enterprise_id) {
        const enterprise = await Enterprise.findByPk(enterprise_id);
        if (!enterprise) {
          return res.status(404).json({
            success: false,
            message: "Enterprise not found",
          });
        }
      }
  
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      const api_key = generateApiKey();
  
      // Create user
      const user = await User.create({
        email,
        password: hashedPassword,
        full_name,
        company_name,
        role: role || "consumer",
        enterprise_id: enterprise_id || null,
        api_key,
        email_verified: false,
        isActive: true,
      });
  
      // Log audit
      await logCreate(
        req.user?.id || user.id,
        "user",
        user.id,
        { email, full_name, role: user.role },
        req,
        `Registered new user: ${full_name}`
      );
  
      // Generate JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, type: "user" },
        config.jwtSecret,
        { expiresIn: "7d" }
      );
  
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          api_key: user.api_key,
          token,
        },
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({
        success: false,
        message: "Error registering user",
        error: error.message,
      });
    }
  };
  
  // Login user
  const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      const user = await User.findOne({ where: { email } });
      if (!user) {
        await logLogin(null, req, false, "Invalid email");
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }
  
      if (!user.isActive) {
        await logLogin(user.id, req, false, "Account inactive");
        return res.status(403).json({
          success: false,
          message: "Account is inactive. Please contact support.",
        });
      }
  
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        await logLogin(user.id, req, false, "Invalid password");
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }
  
      // Update last login
      await user.update({ lastLogin: new Date() });
  
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, type: "user" },
        config.jwtSecret,
        { expiresIn: "7d" }
      );
  
      await logLogin(user.id, req, true);
  
      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            company_name: user.company_name,
            isActive: user.isActive,
            email_verified: user.email_verified,
            lastLogin: user.lastLogin,
          },
          token,
          api_key: user.api_key,
        },
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({
        success: false,
        message: "Error logging in",
        error: error.message,
      });
    }
  };
  
  // Get all users (admin only)
  const getAllUsers = async (req, res) => {
    try {
      const { page = 1, limit = 20, role, isActive, search, enterprise_id } = req.query;
  
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
  
      const whereClause = {};
  
      if (role) whereClause.role = role;
      if (isActive !== undefined) whereClause.isActive = isActive === "true";
      if (enterprise_id) whereClause.enterprise_id = enterprise_id;
      if (search) {
        whereClause[Op.or] = [
          { full_name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { company_name: { [Op.like]: `%${search}%` } },
        ];
      }
  
      const { count, rows } = await User.findAndCountAll({
        where: whereClause,
        attributes: { exclude: ["password"] },
        include: [{ model: Enterprise, as: "enterprise", attributes: ["id", "name"] }],
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
      console.error("Error fetching users:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching users",
        error: error.message,
      });
    }
  };
  
  // Get user by ID
  const getUserById = async (req, res) => {
    try {
      const { id } = req.params;
  
      const user = await User.findByPk(id, {
        attributes: { exclude: ["password"] },
        include: [{ model: Enterprise, as: "enterprise", attributes: ["id", "name", "subscription_tier"] }],
      });
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
  
      // Check permission (users can only see themselves, admins see all)
      if (req.user.role !== "enterprise_admin" && req.user.role !== "super_admin" && req.user.id !== id) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
  
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching user",
        error: error.message,
      });
    }
  };
  
  // Update user
  const updateUser = async (req, res) => {
    try {
      const { id } = req.params;
      const { full_name, company_name, phone, role, isActive } = req.body;
  
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
  
      const oldValues = {
        full_name: user.full_name,
        company_name: user.company_name,
        role: user.role,
        isActive: user.isActive,
      };
  
      const updateData = {};
      if (full_name) updateData.full_name = full_name;
      if (company_name !== undefined) updateData.company_name = company_name;
      if (role && req.user.role === "super_admin") updateData.role = role;
      if (isActive !== undefined && req.user.role === "super_admin") updateData.isActive = isActive;
  
      await user.update(updateData);
  
      await logUpdate(
        req.user.id,
        "user",
        id,
        oldValues,
        updateData,
        req,
        `Updated user: ${user.full_name}`
      );
  
      res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({
        success: false,
        message: "Error updating user",
        error: error.message,
      });
    }
  };
  
  // Regenerate API key
  const regenerateApiKey = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id);
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
  
      const newApiKey = generateApiKey();
      await user.update({ api_key: newApiKey });
  
      await logAudit({
        user_id: req.user.id,
        action: "api_key_regenerated",
        resource_type: "user",
        resource_id: id,
        description: `API key regenerated for ${user.email}`,
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        status: "success",
      });
  
      res.status(200).json({
        success: true,
        message: "API key regenerated successfully",
        data: { api_key: newApiKey },
      });
    } catch (error) {
      console.error("Error regenerating API key:", error);
      res.status(500).json({
        success: false,
        message: "Error regenerating API key",
        error: error.message,
      });
    }
  };
  
  // Delete user
  const deleteUser = async (req, res) => {
    try {
      const { id } = req.params;
  
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
  
      const userData = { email: user.email, full_name: user.full_name };
      await user.destroy();
  
      await logDelete(
        req.user.id,
        "user",
        id,
        userData,
        req,
        `Deleted user: ${userData.full_name}`
      );
  
      res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting user",
        error: error.message,
      });
    }
  };
  
  const assignRole = async (req, res) => {
    try {
      const { role } = req.body;
      const allowed = [
        "super_admin",
        "enterprise_admin",
        "warehouse_staff",
        "consumer",
        "verifier",
      ];
      if (!allowed.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      if (req.user.role !== "super_admin") {
        return res.status(403).json({ success: false, message: "Only super_admin can assign roles" });
      }
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      await user.update({ role });
      res.status(200).json({
        success: true,
        message: "Role updated",
        data: { id: user.id, role: user.role },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error assigning role",
        error: error.message,
      });
    }
  };

  const inviteUser = async (req, res) => {
    try {
      const { email, full_name, role, enterprise_id } = req.body;
      req.params = { id: enterprise_id || req.user.enterprise_id };
      req.body = { email, full_name, role };
      const enterpriseController = require("./enterpriseController");
      return enterpriseController.inviteEnterpriseUser(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error sending invite",
        error: error.message,
      });
    }
  };

  module.exports = {
    register,
    login,
    getAllUsers,
    getUserById,
    updateUser,
    regenerateApiKey,
    deleteUser,
    assignRole,
    inviteUser,
  };