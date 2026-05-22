const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ApiLog = sequelize.define(
    "ApiLog",
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
      },
      api_key: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      endpoint: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      method: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      request_body: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      response_status: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      response_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      ip_address: {
        type: DataTypes.INET,
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "api_logs",
      timestamps: true,
    }
  );

  return ApiLog;
};