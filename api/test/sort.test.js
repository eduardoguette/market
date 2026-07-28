// Tests de ordenación: contra sqlite, porque lo que hay que verificar es
// justamente el ORDER BY (NULL al final, desempate estable, y que el orden
// convive con la búsqueda y los filtros).
// Uso: npm test
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB_PATH = path.join(os.tmpdir(), `market_sort_test_${process.pid}.db`);
fs.rmSync(DB_PATH, { force: true });
process.env.MARKET_DB_PATH = DB_PATH;

const productModel = require("../src/models/product.model");
const productController = require("../src/controllers/product.controller");

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

// [nombre, precio, precio/unidad, unidad, cadena, categoría]
// Hay empates de precio a propósito (tres a 1.00) y NULL en las dos columnas,
// que es lo que rompe el orden y la paginación si no se tratan.
const FIXTURES = [
  ["Leche entera Hacendado", 0.89, 0.89, "l", "mercadona", "Leche"],
  ["Leche entera Alcampo", 1.0, 1.0, "l", "alcampo", "Leche"],
  ["Leche desnatada Dia", 1.0, 1.0, "l", "dia", "Leche"],
  ["Leche semidesnatada Lidl", 1.0, null, "l", "lidl", "Leche"],
  ["Leche entera Aldi garrafa", 4.2, 0.7, "l", "aldi", "Leche"],
  ["Leche sin lactosa Carrefour", 1.35, 1.35, "l", "carrefour", "Leche"],
  ["Leche condensada BM", null, null, "kg", "bm", "Leche"],
  ["Leche en polvo Hipercor", 7.5, 15.0, "kg", "hipercor", "Leche"],
  ["Aceite de oliva Hacendado garrafa", 17.75, 3.55, "l", "mercadona", "Aceite"],
  ["Aceite de oliva Hacendado botella", 4.95, 4.95, "l", "mercadona", "Aceite"],
];

productModel.insertMany(
  FIXTURES.map(([name, price_eur, price_per_unit_eur, measure_unit, supermercado, category]) => ({
    supermercado, name, price_eur, price_per_unit_eur, measure_unit, category,
    ean13: null, brand: null, image: null, url: null,
    is_offer: 0, price_before: null, is_new: 0,
  }))
);

const TOTAL = FIXTURES.length;
const find = (filters, paging) => productModel.findAll(filters, { limit: 50, offset: 0, ...paging });
const prices = (sort, filters = {}) => find(filters, { sort }).items.map((i) => i.price_eur);
const unitPrices = (sort, filters = {}) => find(filters, { sort }).items.map((i) => i.price_per_unit_eur);

// --- orden por precio absoluto ---

test("price_asc ordena de menor a mayor", () => {
  const got = prices("price_asc").filter((p) => p !== null);
  assert.deepStrictEqual(got, [...got].sort((a, b) => a - b));
  assert.strictEqual(got[0], 0.89);
});

test("price_desc ordena de mayor a menor", () => {
  const got = prices("price_desc").filter((p) => p !== null);
  assert.deepStrictEqual(got, [...got].sort((a, b) => b - a));
  assert.strictEqual(got[0], 17.75);
});

test("los precios NULL van al final en price_asc", () => {
  // Es el bug clásico: sqlite pone los NULL primero, así que "lo más barato"
  // arrancaría con los productos sin precio.
  const got = prices("price_asc");
  assert.strictEqual(got[got.length - 1], null);
  assert.notStrictEqual(got[0], null);
});

test("los precios NULL también van al final en price_desc", () => {
  const got = prices("price_desc");
  assert.strictEqual(got[got.length - 1], null);
  assert.notStrictEqual(got[0], null);
});

// --- orden por precio por unidad ---

test("unit_price_asc ordena por precio por unidad, no por precio absoluto", () => {
  // El caso que motiva el criterio: la garrafa de aceite cuesta 17,75 € (la más
  // cara del catálogo) pero a 3,55 €/l es la más barata de las dos.
  const items = find({ category: "Aceite" }, { sort: "unit_price_asc" }).items;
  assert.deepStrictEqual(items.map((i) => i.price_per_unit_eur), [3.55, 4.95]);
  assert.strictEqual(items[0].price_eur, 17.75);
});

test("unit_price_desc invierte el criterio", () => {
  const got = unitPrices("unit_price_desc").filter((p) => p !== null);
  assert.deepStrictEqual(got, [...got].sort((a, b) => b - a));
});

test("los NULL de precio por unidad van al final (lidl y bm)", () => {
  const got = unitPrices("unit_price_asc");
  assert.strictEqual(got[got.length - 1], null);
  assert.strictEqual(got[got.length - 2], null);
  assert.notStrictEqual(got[0], null);
});

test("ordenar no pierde ni duplica filas", () => {
  for (const sort of ["price_asc", "price_desc", "unit_price_asc", "unit_price_desc", "relevance", undefined]) {
    const items = find({}, { sort }).items;
    assert.strictEqual(items.length, TOTAL, `${sort} devolvió ${items.length}`);
    assert.strictEqual(new Set(items.map((i) => i.id)).size, TOTAL, `${sort} duplicó filas`);
    assert.strictEqual(find({}, { sort }).total, TOTAL, `${sort} cambió el total`);
  }
});

// --- desempate y paginación ---

test("los empates se desempatan por id, de forma determinista", () => {
  // Hay tres productos a 1.00: sin desempate el orden entre ellos es arbitrario.
  const tied = find({}, { sort: "price_asc" }).items.filter((i) => i.price_eur === 1.0).map((i) => i.id);
  assert.strictEqual(tied.length, 3);
  assert.deepStrictEqual(tied, [...tied].sort((a, b) => a - b));
});

test("paginar no repite ni saltea filas, con cualquier orden", () => {
  for (const sort of ["price_asc", "price_desc", "unit_price_asc", "relevance", undefined]) {
    const oneShot = find({}, { sort }).items.map((i) => i.id);
    const paged = [];
    for (let offset = 0; offset < TOTAL; offset += 3) {
      paged.push(...find({}, { sort, limit: 3, offset }).items.map((i) => i.id));
    }
    assert.deepStrictEqual(paged, oneShot, `paginado inconsistente con sort=${sort}`);
  }
});

test("paginar es estable también con q", () => {
  for (const sort of ["price_asc", "relevance"]) {
    const oneShot = find({ q: "leche" }, { sort }).items.map((i) => i.id);
    const paged = [];
    for (let offset = 0; offset < oneShot.length; offset += 2) {
      paged.push(...find({ q: "leche" }, { sort, limit: 2, offset }).items.map((i) => i.id));
    }
    assert.deepStrictEqual(paged, oneShot, `paginado inconsistente con q y sort=${sort}`);
  }
});

// --- convivencia con búsqueda y filtros ---

test("sin sort y sin q el orden sigue siendo por id, como antes", () => {
  const ids = find({}).items.map((i) => i.id);
  assert.deepStrictEqual(ids, [...ids].sort((a, b) => a - b));
});

test("con q y sin sort manda la relevancia", () => {
  // "condensada" es raro y "leche" comunísimo: la condensada tiene que salir primera.
  assert.ok(find({ q: "leche condensada" }).items[0].name.includes("condensada"));
});

test("sort=price_asc pisa la relevancia cuando hay q", () => {
  const items = find({ q: "leche" }, { sort: "price_asc" }).items;
  const got = items.map((i) => i.price_eur).filter((p) => p !== null);
  assert.deepStrictEqual(got, [...got].sort((a, b) => a - b));
  assert.strictEqual(got[0], 0.89);
});

test("sort=relevance sin q no rompe: cae al orden por id", () => {
  const ids = find({}, { sort: "relevance" }).items.map((i) => i.id);
  assert.deepStrictEqual(ids, [...ids].sort((a, b) => a - b));
});

test("el orden se aplica dentro de los filtros, no sobre todo el catálogo", () => {
  const items = find({ category: "Leche" }, { sort: "price_asc" }).items;
  assert.ok(items.every((i) => i.category === "Leche"));
  assert.strictEqual(items[0].price_eur, 0.89);
});

test("sort convive con supermercado", () => {
  const items = find({ supermercado: "mercadona" }, { sort: "price_asc" }).items;
  assert.deepStrictEqual(items.map((i) => i.price_eur), [0.89, 4.95, 17.75]);
});

test("sort convive con is_offer/is_new", () => {
  assert.strictEqual(find({ is_offer: 0 }, { sort: "price_asc" }).total, TOTAL);
  assert.strictEqual(find({ is_offer: 1 }, { sort: "price_asc" }).total, 0);
});

test("sort convive con las búsquedas por tamaño", () => {
  // "leche 1l" filtra por formato y además ordena por precio.
  const items = find({ q: "leche 1l" }, { sort: "price_asc" }).items;
  const got = items.map((i) => i.price_eur).filter((p) => p !== null);
  assert.ok(got.length >= 2, `esperaba varios resultados, hubo ${got.length}`);
  assert.deepStrictEqual(got, [...got].sort((a, b) => a - b));
});

// --- validación del parámetro ---

test("SORTS expone exactamente los criterios documentados", () => {
  assert.deepStrictEqual(Object.keys(productModel.SORTS).sort(), [
    "price_asc", "price_desc", "relevance", "unit_price_asc", "unit_price_desc",
  ]);
});

function callList(query) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  productController.list({ query }, res);
  return res;
}

test("un sort desconocido devuelve 400 y no el catálogo entero", () => {
  const res = callList({ sort: "cualquiercosa" });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "sort desconocido");
  assert.ok(res.body.valores.includes("price_asc"));
  assert.strictEqual(res.body.items, undefined, "no debería devolver productos");
});

test("un sort vacío también se rechaza en vez de ignorarse", () => {
  assert.strictEqual(callList({ sort: "" }).statusCode, 400);
});

test("sin sort la respuesta sigue siendo 200", () => {
  const res = callList({});
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.total, TOTAL);
});

test("la respuesta dice con qué orden vino", () => {
  assert.strictEqual(callList({ sort: "price_asc" }).body.sort, "price_asc");
  assert.strictEqual(callList({ q: "leche" }).body.sort, "relevance");
  assert.strictEqual(callList({}).body.sort, null);
});

test("un sort válido no se pisa con los demás parámetros", () => {
  const res = callList({ sort: "price_desc", supermercado: "mercadona", limit: "2" });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.items.map((i) => i.price_eur), [17.75, 4.95]);
  assert.strictEqual(res.body.total, 3);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
