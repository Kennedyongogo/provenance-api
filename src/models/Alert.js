const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Alert = sequelize.define(
    "Alert",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      enterprise_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "enterprises",
          key: "id",
        },
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "products",
          key: "id",
        },
      },
      event_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "provenance_events",
          key: "id",
        },
      },
      alert_type: {
        type: DataTypes.ENUM(
          "GEOFENCE_VIOLATION",
          "TEMPERATURE_EXCURSION",
          "UNEXPECTED_LOCATION",
          "CHAIN_BROKEN",
          "DUPLICATE_SCAN",
          "SPOOFING_DETECTED",
          "DELAY_DETECTED"
        ),
        allowNull: false,
      },
      severity: {
        type: DataTypes.ENUM("info", "warning", "critical"),
        defaultValue: "warning",
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      data: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      is_resolved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolved_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
      },
    },
    {
      tableName: "alerts",
      timestamps: true,
    }
  );

  return Alert;
};