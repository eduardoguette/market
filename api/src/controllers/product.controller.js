const productModel = require("../models/product.model");

// Acepta true/false, 1/0 y sí/no. Cualquier otra cosa se trata como ausente para
// que un `?is_offer=` vacío no filtre por is_offer = 0 sin que nadie lo pida.
function parseBoolFlag(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes"].includes(normalized)) return 1;
  if (["false", "0", "no"].includes(normalized)) return 0;
  return undefined;
}

function list(req, res) {
  const { supermercado, category, ean13, q } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;

  const { total, items } = productModel.findAll(
    {
      supermercado,
      category,
      ean13,
      q,
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    },
    { limit, offset }
  );

  res.json({ total, limit, offset, items });
}

function supermercados(req, res) {
  res.json(productModel.countBySupermercado());
}

module.exports = { list, supermercados, parseBoolFlag };
