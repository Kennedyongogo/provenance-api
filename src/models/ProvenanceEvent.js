const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProvenanceEvent = sequelize.define(
    "ProvenanceEvent",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      previous_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "SHA256 of previous event in chain",
      },
      current_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: "SHA256 of this event",
      },
      action: {
        type: DataTypes.ENUM(
          "CREATE",       // Product created/minted
          "TRANSPORT",    // Product moved
          "INSPECT",      // Quality check
          "STORE",        // Entered warehouse
          "SHIP",         // Left facility
          "RECEIVE",      // Arrived at destination
          "TRANSFORM",    // Processed into new product
          "CONSUME",      // End of life
          "VERIFY"        // Consumer verification scan
        ),
        allowNull: false,
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false,
      },
      location_accuracy_meters: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "GPS accuracy from device",
      },
      altitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      cell_tower_fingerprint: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Array of nearby cell towers for anti-spoofing",
      },
      wifi_fingerprint: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Array of nearby WiFi networks for anti-spoofing",
      },
      device_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Mobile device identifier",
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Passed anti-spoofing checks",
      },
      verification_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Why verification passed/failed",
      },
      photo_urls: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: "Temperature, humidity, seal_number, etc.",
      },
      ip_address: {
        type: DataTypes.INET,
        allowNull: true,
      },
    },
    {
      tableName: "provenance_events",
      timestamps: true,
      indexes: [
        {
          fields: ["product_id", "createdAt"],
        },
        {
          fields: ["user_id"],
        },
        {
          fields: ["current_hash"],
          unique: true,
        },
        {
          fields: ["latitude", "longitude"],
        },
      ],
    }
  );

  return ProvenanceEvent;
};