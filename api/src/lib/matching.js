// Motor de matching difuso de productos entre cadenas distintas.
//
// Por qué difuso: casi ningún producto trae ean13 (mercadona 0%, carrefour ~40%),
// así que el match tiene que salir del nombre, y los nombres no son literalmente
// comparables. Carrefour pone el litraje explícito ("Agua mineral Font Vella
// 1,5 l.") donde mercadona usa un adjetivo ("Agua mineral grande Font Vella").
//
// El tamaño real se recupera de price_eur / price_per_unit_eur: en las dos
// cadenas el precio por unidad está expresado en la unidad canónica (l/kg/ud),
// así que la división devuelve el contenido del formato. Eso es bastante más
// fiable que parsear el nombre, y además distingue el pack del envase suelto,
// que en mercadona comparten nombre exacto.

// Calibrado a mano sobre el cruce carrefour->mercadona de los datos reales. Por
// debajo de 0.6 empiezan a colarse cosas de otra familia (una pizza con "salsa
// boloñesa" en el nombre contra un bote de salsa boloñesa puntuaba 0.52), y por
// encima de 0.65 se caen equivalencias correctas pero mal escritas (la radler de
// marca blanca de cada cadena, 0.60). Un match inventado ensucia el total en
// silencio, mientras que un `null` se reporta honestamente en sin_equivalente,
// así que ante la duda conviene quedarse corto.
const DEFAULT_THRESHOLD = 0.6;

// El nombre manda; el tamaño desempata (mismo nombre + tamaño distinto = otro
// formato); la categoría casi no puntúa porque las taxonomías de cada cadena no
// se parecen en nada (carrefour dice "Bebidas", mercadona "Agua"/"Cerveza").
const DEFAULT_WEIGHTS = { name: 0.68, size: 0.27, category: 0.05 };

// Por debajo de esto dos tokens se consideran cosas distintas y no suman nada.
const FUZZY_TOKEN_MIN = 0.6;

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "y", "e", "o", "u", "a", "al", "en", "con", "sin", "por", "para",
  "su", "sus", "lo", "mas", "tipo", "sabor", "estilo",
]);

// Adjetivos de formato de mercadona. Son redundantes (el tamaño se calcula
// aparte) y sólo ensucian la comparación contra carrefour, que nunca los usa.
const SIZE_WORDS = new Set([
  "grande", "grandes", "mediana", "mediano", "medianas", "medianos",
  "pequena", "pequeno", "pequenas", "pequenos",
  "familiar", "individual", "mini", "maxi", "gigante",
]);

// Marcas paraguas de marca blanca. Cubren una porción enorme del catálogo de su
// cadena (hacendado sale en el 42% de las filas de mercadona) y no dicen nada
// del producto, pero al comparar entre cadenas son tokens raros e irreconciliables
// que hundirían el score: el "Carrefour Essential" de una nunca va a coincidir
// con el "Hacendado" de la otra aunque sean el mismo producto equivalente.
// Las marcas exclusivas de una categoría (Steinburg, Bronchales, Cortes) NO se
// quitan: ahí sí distinguen un producto de otro.
const PRIVATE_LABELS = {
  carrefour: [
    "carrefour essential", "carrefour classic", "carrefour selection",
    "carrefour extra", "carrefour bio", "carrefour kids", "carrefour",
  ],
  mercadona: ["hacendado", "deliplus", "bosque verde", "compy", "colorcor"],
};

// Atributos que convierten un producto en otro producto por más que el nombre
// coincida: agua con gas vs sin gas, cerveza 0,0 vs con alcohol. Sin esto
// "Agua mineral con gas Vichy" y "Agua mineral Vichy" salen casi idénticos.
const FLAGS = [
  ["gas", /\bcon gas\b/],
  ["sin_alcohol", /\bsin alcohol\b|\b0[.,]0\s*%?/],
  ["sin_azucar", /\bsin azucar|\bsin azucares|\b0\s*%\s*azucar|\bzero\b/],
  ["sin_lactosa", /\bsin lactosa\b/],
  ["sin_gluten", /\bsin gluten\b/],
];

// Cada atributo discordante multiplica la confianza: uno solo ya suele bastar
// para que sean productos diferentes.
const FLAG_MISMATCH_FACTOR = 0.6;

// Hasta 3x de diferencia es un formato alternativo razonable (33 cl vs 50 cl vs
// 1 l). Más allá se está comparando una unidad suelta contra un pack, que es otra
// compra: el pack de 12 latas de Mahou casaba con la lata de 50 cl y "ahorraba"
// 11 € imaginarios. El término lineal de tamaño pesa poco para frenar eso solo,
// así que la diferencia grosera de formato penaliza aparte.
const SIZE_RATIO_FLOOR = 1 / 3;
const SIZE_MISMATCH_FACTOR = 0.6;

// El IDF, solo, se deja engañar por los modificadores: "Pizza de pollo con salsa
// de miel y mostaza" casaba con "Salsa Miel y Mostaza" porque "miel"/"mostaza"
// son raras (mucho peso) y "pizza"/"salsa" comunes (poco peso). Pero el
// sustantivo que abre el nombre es lo que el producto ES, y en las dos cadenas
// va primero, así que si el de un lado no aparece en el otro se penaliza.
const HEAD_MISMATCH_FACTOR = 0.75;

const UNITS = {
  l: ["l", 1], lt: ["l", 1], litro: ["l", 1], litros: ["l", 1],
  dl: ["l", 0.1], cl: ["l", 0.01], ml: ["l", 0.001],
  kg: ["kg", 1], kgs: ["kg", 1], kilo: ["kg", 1], kilos: ["kg", 1],
  g: ["kg", 0.001], gr: ["kg", 0.001], gramo: ["kg", 0.001], gramos: ["kg", 0.001],
  mg: ["kg", 0.000001],
  ud: ["ud", 1], uds: ["ud", 1], unidad: ["ud", 1], unidades: ["ud", 1],
  rollo: ["ud", 1], rollos: ["ud", 1], pieza: ["ud", 1], piezas: ["ud", 1],
  capsula: ["ud", 1], capsulas: ["ud", 1], sobre: ["ud", 1], sobres: ["ud", 1],
};

const UNIT_NAMES = Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|");
// Captura "1,5 l", "50 cl", "360 g", "4 rollos" y packs tipo "6 x 1,5 l".
const QTY_RE = new RegExp(
  `(?:(\\d+)\\s*[x*]\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_NAMES})\\b`,
  "g"
);

function stripAccents(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(name) {
  return stripAccents(String(name || "").toLowerCase())
    .replace(/[^a-z0-9.,%x*\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Todas las formas crudas de measure_unit que caen en una familia canónica, para
// poder filtrar por unidad en SQL en vez de traerse las filas a JS.
function unitAliases(family) {
  return Object.keys(UNITS).filter((key) => UNITS[key][0] === family);
}

function canonicalUnit(measureUnit) {
  if (!measureUnit) return null;
  const key = stripAccents(String(measureUnit).toLowerCase()).trim();
  return UNITS[key] ? UNITS[key][0] : null;
}

// Devuelve la última cantidad del nombre (en ambas cadenas el formato va al
// final) ya convertida a la unidad canónica de su familia.
function parseQuantity(normalized) {
  let found = null;
  QTY_RE.lastIndex = 0;
  let m;
  while ((m = QTY_RE.exec(normalized)) !== null) {
    const [, packRaw, valueRaw, unitRaw] = m;
    const [family, factor] = UNITS[unitRaw];
    const value = parseFloat(valueRaw.replace(",", ".")) * factor;
    if (!Number.isFinite(value) || value <= 0) continue;
    const pack = packRaw ? parseInt(packRaw, 10) : 1;
    found = { value: value * (pack > 0 ? pack : 1), unit: family, text: m[0] };
  }
  return found;
}

function stripQuantities(normalized) {
  return normalized.replace(QTY_RE, " ").replace(/\s+/g, " ").trim();
}

function stripPrivateLabels(normalized, supermercado) {
  const labels = PRIVATE_LABELS[String(supermercado || "").toLowerCase()];
  if (!labels) return normalized;
  let out = normalized;
  for (const label of labels) {
    out = out.replace(new RegExp(`\\b${label}\\b`, "g"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function tokenize(text) {
  return text
    .split(" ")
    .map((t) => t.replace(/^[.,%]+|[.,%]+$/g, ""))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !SIZE_WORDS.has(t));
}

function extractFlags(normalized) {
  const flags = new Set();
  for (const [flag, re] of FLAGS) {
    if (re.test(normalized)) flags.add(flag);
  }
  return flags;
}

// El tamaño derivado del precio gana al del nombre porque contempla los packs:
// en mercadona la botella suelta y el pack de 6 se llaman exactamente igual.
function productSize(row, normalized) {
  const parsed = parseQuantity(normalized);
  const unit = canonicalUnit(row.measure_unit) || (parsed ? parsed.unit : null);

  const price = Number(row.price_eur);
  const pricePerUnit = Number(row.price_per_unit_eur);
  let value = null;
  if (price > 0 && pricePerUnit > 0) {
    const derived = price / pricePerUnit;
    if (derived > 0 && derived < 10000) value = derived;
  }
  if (value === null && parsed) value = parsed.value;

  return { value: unit && value ? value : null, unit };
}

function prepare(row) {
  const normalized = normalizeName(row.name);
  const cleaned = stripQuantities(stripPrivateLabels(normalized, row.supermercado));
  return {
    row,
    tokens: tokenize(cleaned),
    size: productSize(row, normalized),
    flags: extractFlags(normalized),
    categoryTokens: tokenize(normalizeName(row.category)),
    ean13: row.ean13 ? String(row.ean13).trim() : "",
  };
}

// El catálogo repite mucho los mismos tokens, así que conviene calcular los
// trigramas de cada uno una sola vez.
const trigramCache = new Map();

function trigrams(token) {
  let grams = trigramCache.get(token);
  if (grams) return grams;
  grams = new Set();
  if (token.length < 3) {
    grams.add(token);
  } else {
    for (let i = 0; i <= token.length - 3; i++) grams.add(token.slice(i, i + 3));
  }
  trigramCache.set(token, grams);
  return grams;
}

// Dice sobre trigramas: tolera plurales y variantes morfológicas
// ("mediana"/"mediano", "chocolate"/"chocolates") sin depender del orden.
function diceCoefficient(a, b) {
  if (a === b) return 1;
  const A = trigrams(a);
  const B = trigrams(b);
  let shared = 0;
  for (const gram of A) if (B.has(gram)) shared++;
  return (2 * shared) / (A.size + B.size);
}

function tokenScore(a, b) {
  if (a === b) return 1;
  const dice = diceCoefficient(a, b);
  return dice >= FUZZY_TOKEN_MIN ? dice : 0;
}

// Cuánto del peso de `from` está cubierto por `to`, ponderando cada token por su
// IDF. Es la pieza clave: en un catálogo de supermercado el sustantivo genérico
// lo comparten cientos de productos y la identidad está en los tokens raros, así
// que "agua mineral" pesa poco y la marca pesa mucho. Sin esto, "Agua mineral
// Font Vella" y "Agua mineral Bronchales" comparten 2 de 3 tokens y salen
// peligrosamente parecidas.
function coverage(from, to, idf) {
  let weighted = 0;
  let total = 0;
  for (const token of from) {
    const weight = idf(token);
    total += weight;
    let best = 0;
    for (const other of to) {
      const score = tokenScore(token, other);
      if (score > best) best = score;
      if (best === 1) break;
    }
    weighted += weight * best;
  }
  return total > 0 ? weighted / total : 0;
}

// Media armónica de las dos coberturas: penaliza la contención unilateral, para
// que "Agua" no case al 100% contra "Agua mineral con gas San Pellegrino".
function nameSimilarity(tokensA, tokensB, idf) {
  const a = coverage(tokensA, tokensB, idf);
  const b = coverage(tokensB, tokensA, idf);
  return a + b > 0 ? (2 * a * b) / (a + b) : 0;
}

function sizeSimilarity(a, b) {
  if (!a.value || !b.value) return null; // dato ausente: neutro, no penaliza
  return Math.min(a.value, b.value) / Math.max(a.value, b.value);
}

// Las taxonomías de las cadenas no coinciden (hoy la intersección es vacía), así
// que la categoría sólo puede sumar cuando de verdad se parece; si no, neutro.
function categorySimilarity(a, b, idf) {
  if (!a.categoryTokens.length || !b.categoryTokens.length) return null;
  const sim = nameSimilarity(a.categoryTokens, b.categoryTokens, idf);
  return sim >= 0.5 ? sim : null;
}

function headPresent(from, to) {
  const head = from[0];
  if (!head) return true;
  return to.some((token) => tokenScore(head, token) > 0);
}

function headPenalty(a, b) {
  let mismatches = 0;
  if (!headPresent(a.tokens, b.tokens)) mismatches++;
  if (!headPresent(b.tokens, a.tokens)) mismatches++;
  return HEAD_MISMATCH_FACTOR ** mismatches;
}

function flagPenalty(flagsA, flagsB) {
  let mismatches = 0;
  for (const flag of flagsA) if (!flagsB.has(flag)) mismatches++;
  for (const flag of flagsB) if (!flagsA.has(flag)) mismatches++;
  return FLAG_MISMATCH_FACTOR ** mismatches;
}

function scorePair(a, b, idf, weights = DEFAULT_WEIGHTS) {
  // Un litro y un kilo no son el mismo producto por más que el nombre coincida.
  if (a.size.unit && b.size.unit && a.size.unit !== b.size.unit) {
    return { confidence: 0, name: 0, size: 0, category: null };
  }

  const name = nameSimilarity(a.tokens, b.tokens, idf);
  const size = sizeSimilarity(a.size, b.size);
  const category = categorySimilarity(a, b, idf);

  let weighted = weights.name * name;
  let total = weights.name;
  if (size !== null) {
    weighted += weights.size * size;
    total += weights.size;
  }
  if (category !== null) {
    weighted += weights.category * category;
    total += weights.category;
  }

  const sizeGap = size !== null && size < SIZE_RATIO_FLOOR ? SIZE_MISMATCH_FACTOR : 1;
  const confidence =
    (weighted / total) * flagPenalty(a.flags, b.flags) * headPenalty(a, b) * sizeGap;
  return { confidence, name, size, category };
}

// Índice de candidatos: se prepara una vez por request y se reutiliza para todos
// los items de la bolsa.
function buildIndex(rows) {
  const items = rows.map(prepare);

  const docFreq = new Map();
  for (const item of items) {
    for (const token of new Set(item.tokens)) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }
  const total = items.length || 1;

  const cache = new Map();
  function idf(token) {
    let value = cache.get(token);
    if (value === undefined) {
      value = Math.log(1 + total / (1 + (docFreq.get(token) || 0)));
      cache.set(token, value);
    }
    return value;
  }

  const byEan = new Map();
  for (const item of items) {
    if (item.ean13) byEan.set(item.ean13, item);
  }

  return { items, idf, byEan };
}

function findBestMatch(origin, index, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const weights = options.weights ?? DEFAULT_WEIGHTS;

  // El ean13 es identidad, no parecido: si los dos lados lo traen, se cierra ahí.
  if (origin.ean13) {
    const exact = index.byEan.get(origin.ean13);
    if (exact) {
      return { match: exact.row, confidence: 1, method: "ean13", breakdown: null };
    }
  }

  let best = null;
  let bestScore = null;
  for (const candidate of index.items) {
    const score = scorePair(origin, candidate, index.idf, weights);
    if (!bestScore || score.confidence > bestScore.confidence) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore.confidence < threshold) {
    return { match: null, confidence: bestScore ? bestScore.confidence : 0, method: "name", breakdown: bestScore };
  }
  return { match: best.row, confidence: bestScore.confidence, method: "name", breakdown: bestScore };
}

module.exports = {
  DEFAULT_THRESHOLD,
  DEFAULT_WEIGHTS,
  STOPWORDS,
  normalizeName,
  parseQuantity,
  productSize,
  unitAliases,
  tokenize,
  prepare,
  buildIndex,
  nameSimilarity,
  diceCoefficient,
  scorePair,
  findBestMatch,
};
