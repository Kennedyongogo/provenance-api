const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Geofence = sequelize.define(
    "Geofence",
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
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      fence_type: {
        type: DataTypes.ENUM("circle", "polygon", "route"),
        defaultValue: "circle",
      },
      center_latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
        comment: "For circle type",
      },
      center_longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
        comment: "For circle type",
      },
      radius_meters: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "For circle type",
      },
      polygon_coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Array of {lat, lng} for polygon",
      },
      route_coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Array of {lat, lng} for route",
      },
      allowed_actions: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ["CREATE", "INSPECT", "STORE"],
        comment: "Which actions are allowed inside this geofence",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "geofences",
      timestamps: true,
    }
  );

  return Geofence;
};