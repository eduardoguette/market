// Interpretación de la query de búsqueda (`?q=`).
//
// El problema que resuelve: `name LIKE '%agua bronchales%'` exige que lo tecleado
// aparezca como subcadena contigua, y "Agua mineral grande Bronchales" tiene
// palabras en medio, así que daba 0 resultados aunque cada término por separado
// encontrara cosas. Acá la query se parte en tokens que después se exigen todos
// (en cualquier orden) contra el índice FTS5.
//
// Además hay un caso que ningún match textual puede resolver: "agua 50cl", porque
// el 50cl no está en ningún nombre (mercadona bautiza los formatos
// "pequeña/mediana/grande"). La cantidad se saca de los tokens de texto y se
// resuelve aparte, con el tamaño derivado de price_eur / price_per_unit_eur.

const { normalizeName, parseQuantity, STOPWORDS } = require("./matching");

// ±10% sobre el tamaño pedido. Cubre el ruido de redondeo del tamaño derivado
// (un pack de 6x1,5 l suele dar 9.06 en vez de 9) sin llegar al formato de al lado.
const SIZE_TOLERANCE = 0.1;

// Sólo letras y números: así los operadores de FTS5 (", *, AND, NEAR...) nunca
// llegan a la expresión de búsqueda desde la entrada del usuario.
function cleanToken(token) {
  return token.replace(/[^a-z0-9]/g, "");
}

function parseSearchQuery(raw) {
  if (raw === undefined || raw === null || !String(raw).trim()) return null;

  const normalized = normalizeName(raw);
  const quantity = parseQuantity(normalized);
  // La cantidad se quita del texto: "50cl" no aparece en ningún nombre y como
  // token de búsqueda sólo lograría que no matcheara nada.
  const text = quantity ? normalized.replace(quantity.text, " ") : normalized;

  const tokens = text
    .split(" ")
    .map(cleanToken)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));

  return {
    raw: String(raw).trim(),
    tokens,
    size: quantity ? { value: quantity.value, unit: quantity.unit } : null,
  };
}

// Todos los tokens son obligatorios; el orden y la posición no importan.
// `prefix` deja abierto el final de cada token, para que "choco" encuentre
// "chocolate" mientras se escribe.
function ftsExpression(tokens, { prefix = false } = {}) {
  if (!tokens.length) return null;
  return tokens.map((token) => (prefix ? `"${token}"*` : `"${token}"`)).join(" AND ");
}

function sizeBand({ value }, tolerance = SIZE_TOLERANCE) {
  return { min: value * (1 - tolerance), max: value * (1 + tolerance) };
}

module.exports = { parseSearchQuery, ftsExpression, sizeBand, SIZE_TOLERANCE };
