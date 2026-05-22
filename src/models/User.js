const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      company_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM(
          "super_admin",
          "enterprise_admin",
          "warehouse_staff",
          "consumer",
          "verifier"
        ),
        defaultValue: "consumer",
      },
      enterprise_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "enterprises", key: "id" },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      email_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      api_key: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      rate_limit_per_minute: {
        type: DataTypes.INTEGER,
        defaultValue: 60,
      },
      refresh_token_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      password_reset_token: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      password_reset_expires: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      invite_token: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      invite_expires: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "users",
      timestamps: true,
    }
  );

  return User;
};
