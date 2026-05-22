const storageService = require("../services/storageService");

const uploadProductPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "file is required",
      });
    }

    const { product_id, event_id } = req.body;
    const result = await storageService.saveProductPhoto(req.file, {
      product_id,
      event_id,
    });

    res.status(201).json({
      success: true,
      data: {
        photo_url: result.photo_url,
        thumbnail_url: result.photo_url,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message,
    });
  }
};

module.exports = { uploadProductPhoto };
