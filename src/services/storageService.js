const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads", "product-photos");

const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
};

const saveProductPhoto = async (file, { product_id, event_id }) => {
  ensureUploadDir();
  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `${product_id || "unknown"}_${event_id || "new"}_${crypto.randomUUID()}${ext}`;
  const dest = path.join(UPLOAD_ROOT, filename);
  fs.writeFileSync(dest, file.buffer);
  const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
  return {
    photo_url: `${baseUrl}/uploads/product-photos/${filename}`,
    filename,
  };
};

module.exports = {
  UPLOAD_ROOT,
  ensureUploadDir,
  saveProductPhoto,
};
