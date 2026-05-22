const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AuditTrail = sequelize.define(
    "AuditTrail",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        comment: "User who performed the action (null for system/consumer actions)",
      },
      action: {
        type: DataTypes.ENUM(
          "CREATE",
          "UPDATE",
          "DELETE",
          "LOGIN",
          "LOGOUT",
          "STATUS_CHANGE",
          "VERIFY",
          "EXPORT",
          "IMPORT",
          "ERROR"
        ),
        allowNull: false,
      },
      resource_type: {
        type: DataTypes.ENUM(
          "user",
          "product",
          "enterprise",
          "batch",
          "provenance_event",
          "geofence",
          "alert",
          "verification",
          "api_log",
          "system"
        ),
        allowNull: false,
      },
      resource_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "ID of the resource being acted upon",
      },
      old_value: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Previous state (for UPDATE/DELETE)",
      },
      new_value: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "New state (for CREATE/UPDATE)",
      },
      ip_address: {
        type: DataTypes.INET,
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("success", "failed", "pending", "warning"),
        defaultValue: "success",
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "audit_trails",
      timestamps: true,
      indexes: [
        {
          fields: ["user_id"],
        },
        {
          fields: ["resource_type", "resource_id"],
        },
        {
          fields: ["action"],
        },
        {
          fields: ["createdAt"],
        },
      ],
    }
  );

  // Association
  AuditTrail.associate = (models) => {
    AuditTrail.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return AuditTrail;
};