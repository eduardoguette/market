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

const SORT_VALUES = Object.keys(productModel.SORTS);

function list(req, res) {
  const { supermercado, category, ean13, q } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;

  // Un `sort` desconocido se rechaza en vez de ignorarse: si se ignorara, la
  // respuesta vendría en un orden que no es el que se pidió y desde afuera no
  // habría forma de saberlo -- un error tipográfico se vería como un bug de la
  // API. Con los filtros booleanos la decisión es la contraria porque ahí
  // ignorar significa "no filtrar", que no falsea nada.
  const sort = req.query.sort;
  if (sort !== undefined && !SORT_VALUES.includes(sort)) {
    return res.status(400).json({ error: "sort desconocido", valores: SORT_VALUES });
  }

  const { total, items } = productModel.findAll(
    {
      supermercado,
      category,
      ean13,
      q,
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    },
    { limit, offset, sort }
  );

  res.json({ total, limit, offset, sort: sort || (q ? "relevance" : null), items });
}

function supermercados(req, res) {
  res.json(productModel.countBySupermercado());
}

module.exports = { list, supermercados, parseBoolFlag };
