const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Webhook = sequelize.define(
    "Webhook",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      enterprise_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "enterprises", key: "id" },
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      events: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ["scan.created", "alert.raised"],
      },
      secret: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      last_triggered_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      failure_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      tableName: "webhooks",
      timestamps: true,
    }
  );

  return Webhook;
};
