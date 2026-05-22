const QRCode = require("qrcode");
const config = require("../config/config");

const buildVerifyPayload = (product) =>
  JSON.stringify({
    product_id: product.id,
    product_code: product.product_code,
    verify_url: `${config.frontendUrl}/verify/${product.product_code}`,
  });

const generateQrDataUrl = async (product) => {
  const payload = buildVerifyPayload(product);
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 400 });
};

module.exports = {
  buildVerifyPayload,
  generateQrDataUrl,
};
