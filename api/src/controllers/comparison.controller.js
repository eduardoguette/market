const productModel = require("../models/product.model");
const matching = require("../lib/matching");

const MAX_ITEMS = 100;
const MAX_QUANTITY = 99;

const ENV_THRESHOLD = parseFloat(process.env.MARKET_MATCH_THRESHOLD);
const THRESHOLD = Number.isFinite(ENV_THRESHOLD) ? ENV_THRESHOLD : matching.DEFAULT_THRESHOLD;

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Devuelve { items } o { error } para que el handler no tenga que validar a mano.
function parseBody(body) {
  const { items, target_supermercado: target } = body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "items debe ser un array con al menos un producto" };
  }
  if (items.length > MAX_ITEMS) {
    return { error: `items admite como máximo ${MAX_ITEMS} productos` };
  }
  if (typeof target !== "string" || !target.trim()) {
    return { error: "target_supermercado es obligatorio" };
  }

  const parsed = [];
  for (const item of items) {
    const productId = Number(item && item.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return { error: "cada item necesita un product_id entero" };
    }
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      return { error: `quantity debe ser un entero entre 1 y ${MAX_QUANTITY}` };
    }
    parsed.push({ productId, quantity });
  }

  let threshold = THRESHOLD;
  if (body.min_confidence !== undefined) {
    threshold = Number(body.min_confidence);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return { error: "min_confidence debe ser un número entre 0 y 1" };
    }
  }

  return { items: parsed, target: target.trim(), threshold };
}

function compareBasket(req, res) {
  const parsed = parseBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const { items, target, threshold } = parsed;

  const known = productModel.countBySupermercado().map((row) => row.supermercado);
  if (!known.includes(target)) {
    return res.status(400).json({ error: "target_supermercado desconocido", disponibles: known });
  }

  const found = new Map(productModel.findByIds(items.map((i) => i.productId)).map((p) => [p.id, p]));
  const missing = items.filter((i) => !found.has(i.productId)).map((i) => i.productId);
  if (missing.length) {
    return res.status(404).json({ error: "product_id inexistente", ids: missing });
  }

  const index = matching.buildIndex(productModel.findAllBySupermercado(target));

  let origenTotal = 0;
  let targetTotal = 0;
  let sinEquivalente = 0;
  const matches = [];

  for (const { productId, quantity } of items) {
    const original = found.get(productId);
    origenTotal += (original.price_eur || 0) * quantity;

    const origin = matching.prepare(original);
    let result;
    if (original.supermercado === target) {
      // Ya es del supermercado destino: no hay nada que estimar.
      result = { match: original, confidence: 1, method: "mismo_supermercado", breakdown: null };
    } else {
      result = matching.findBestMatch(origin, index, { threshold });
    }

    if (result.match) {
      targetTotal += (result.match.price_eur || 0) * quantity;
    } else {
      sinEquivalente++;
    }

    matches.push({
      original,
      match: result.match,
      confidence: round2(result.confidence),
      quantity,
      metodo: result.method,
      // Deja que la UI avise cuando el equivalente viene en otro formato: el
      // precio es real pero no compara la misma cantidad de producto.
      size_ratio:
        result.match && result.breakdown && result.breakdown.size !== null
          ? round2(result.breakdown.size)
          : null,
    });
  }

  res.json({
    origen_total: round2(origenTotal),
    target_total: round2(targetTotal),
    ahorro: round2(origenTotal - targetTotal),
    matches,
    sin_equivalente: sinEquivalente,
  });
}

module.exports = { compareBasket };
