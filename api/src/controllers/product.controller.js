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
      measure_unit: req.query.measure_unit,
      categoria_canonica: req.query.categoria_canonica,
      pasillo: req.query.pasillo,
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    },
    { limit, offset, sort }
  );

  res.json({ total, limit, offset, sort: sort || (q ? "relevance" : null), items });
}

// Un producto por id, para que un enlace directo a un producto funcione: la app
// recibía el objeto por parámetro de navegación, así que al abrir el enlace desde
// fuera no tenía de dónde sacarlo.
function detail(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id debe ser un entero positivo" });
  }

  const product = productModel.findById(id);
  if (!product) return res.status(404).json({ error: "producto no encontrado" });

  res.json(product);
}

// Los cajones canónicos: el primer paso del flujo que pidió el usuario, elegir
// categoría antes de elegir pasillo.
function categorias(req, res) {
  res.json(
    productModel.countByCanonical({
      supermercado: req.query.supermercado,
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    })
  );
}

// Las unidades del catálogo con su conteo, para que la app pueda ofrecer el filtro
// de `measure_unit` sin adivinar cuáles existen.
function unidades(req, res) {
  res.json(
    productModel.countByMeasureUnit({
      supermercado: req.query.supermercado,
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    })
  );
}

function supermercados(req, res) {
  // Con is_new/is_offer devuelve sólo las cadenas que tienen algo, para que la
  // UI no ofrezca un filtro de novedades en una cadena que no trae ninguna.
  res.json(
    productModel.countBySupermercado({
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    })
  );
}

// Los pasillos que tiene una cadena, para poder navegarla sin escribir nada en
// el buscador. Es un GROUP BY sobre `category`, que hoy ya guarda la taxonomía
// propia de cada cadena.
function pasillos(req, res) {
  const minTotal = parseInt(req.query.min_total, 10) || 0;
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : undefined;

  const { total, pasillos: lista } = productModel.countByAisle(
    {
      supermercado: req.query.supermercado,
      categoria_canonica: req.query.categoria_canonica,
      is_offer: parseBoolFlag(req.query.is_offer),
      is_new: parseBoolFlag(req.query.is_new),
    },
    { minTotal, limit }
  );

  // `total` son los pasillos que existen; `pasillos` los que caben en el limit.
  res.json({ total, limit: limit || null, min_total: minTotal, pasillos: lista });
}

module.exports = { list, detail, categorias, unidades, supermercados, pasillos, parseBoolFlag };
