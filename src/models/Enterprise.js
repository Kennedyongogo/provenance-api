const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Enterprise = sequelize.define(
    "Enterprise",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      registration_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      tax_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      website: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      industry: {
        type: DataTypes.ENUM("agriculture", "mining", "pharma", "logistics", "retail", "manufacturing"),
        allowNull: true,
      },
      subscription_tier: {
        type: DataTypes.ENUM("free", "basic", "professional", "enterprise"),
        defaultValue: "free",
      },
      scan_limit_monthly: {
        type: DataTypes.INTEGER,
        defaultValue: 1000,
      },
      scans_used_this_month: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      verified_by: {
        type: DataTypes.UUID,
        allowNull: true,
        // No DB FK here — users table is created after enterprises (circular with users.enterprise_id)
      },
    },
    {
      tableName: "enterprises",
      timestamps: true,
    }
  );

  return Enterprise;
};