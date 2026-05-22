const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const VerificationRequest = sequelize.define(
    "VerificationRequest",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      product_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      consumer_ip: {
        type: DataTypes.INET,
        allowNull: true,
      },
      consumer_location_lat: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
      },
      consumer_location_lng: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      verification_result: {
        type: DataTypes.ENUM("authentic", "suspicious", "fake", "expired"),
        allowNull: false,
      },
      confidence_score: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100,
        },
      },
      full_chain: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "The full provenance chain shown to consumer",
      },
      consumer_feedback: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "verification_requests",
      timestamps: true,
    }
  );

  return VerificationRequest;
};