module.exports = {
  ...require("./blockchainService"),
  ...require("./antiSpoofingService"),
  geofenceService: require("./geofenceService"),
  qrCodeService: require("./qrCodeService"),
  storageService: require("./storageService"),
  emailService: require("./emailService"),
  webhookService: require("./webhookService"),
  scanService: require("./scanService"),
};
