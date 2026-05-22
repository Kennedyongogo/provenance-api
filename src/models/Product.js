const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Product = sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      product_code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.ENUM("coffee", "diamonds", "pharmaceuticals", "seafood", "luxury_goods", "other"),
        defaultValue: "other",
      },
      batch_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      manufacturer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      origin_latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
      },
      origin_longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false,
      },
      origin_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      production_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiry_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      qr_code_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "products",
      timestamps: true,
    }
  );

  return Product;
};