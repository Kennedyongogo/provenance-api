const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Batch = sequelize.define(
    "Batch",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      batch_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      unit: {
        type: DataTypes.ENUM("kg", "liters", "pieces", "tons", "grams"),
        defaultValue: "pieces",
      },
      parent_batch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "batches",
          key: "id",
        },
        comment: "For splitting/merging batches",
      },
      status: {
        type: DataTypes.ENUM("active", "split", "merged", "consumed", "expired"),
        defaultValue: "active",
      },
    },
    {
      tableName: "batches",
      timestamps: true,
    }
  );

  return Batch;
};