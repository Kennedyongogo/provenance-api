const multer = require("multer");
const path = require("path");
const storageService = require("../services/storageService");

storageService.ensureUploadDir();

const memoryStorage = multer.memoryStorage();

const uploadProductPhoto = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  },
}).single("file");

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Upload failed",
    });
  }
  next();
};

module.exports = {
  uploadProductPhoto,
  handleUploadError,
};
