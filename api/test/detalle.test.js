// Tests de GET /products/:id, del filtro ?measure_unit= y de GET /unidades.
// Uso: npm test
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB_PATH = path.join(os.tmpdir(), `market_detalle_test_${process.pid}.db`);
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

// Los rangos de precio por unidad son los que hacen que mezclarlas no signifique
// nada: el lavado y la cápsula valen céntimos, el kilo euros.
const FIXTURES = [
  ["Aceite de oliva virgen extra garrafa", 17.75, 3.55, "l", "mercadona", "Aceite"],
  ["Aceite de oliva virgen extra botella", 4.95, 4.95, "l", "mercadona", "Aceite"],
  ["Leche entera brick", 0.89, 0.89, "l", "dia", "Leche"],
  ["Arroz redondo", 1.2, 1.2, "kg", "dia", "Arroz"],
  ["Jamón serrano en lonchas", 2.5, 25.0, "kg", "mercadona", "Charcutería"],
  ["Detergente líquido 40 lavados", 6.0, 0.15, "lavado", "mercadona", "Detergente"],
  ["Detergente en cápsulas 30 uds", 9.0, 0.3, "capsula", "dia", "Detergente"],
  ["Huevos camperos docena", 3.2, 3.2, "docena", "dia", "Huevos"],
  ["Papel higiénico 12 rollos", 5.4, 0.45, "ud", "mercadona", "Papel"],
  ["Solomillo al peso", 12.0, 18.0, "kg.peso esc", "ahorramas", "Carne"],
  ["Producto sin unidad", 1.0, null, null, "aldi", "Otros"],
];

productModel.insertMany(
  FIXTURES.map(([name, price_eur, price_per_unit_eur, measure_unit, supermercado, category]) => ({
    supermercado, name, price_eur, price_per_unit_eur, measure_unit, category,
    ean13: null, brand: null, image: null, url: null,
    is_offer: 0, price_before: null, is_new: 0,
  }))
);

const find = (filters, paging) => productModel.findAll(filters, { limit: 50, offset: 0, ...paging });

function llamar(handler, req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  handler({ query: {}, params: {}, ...req }, res);
  return res;
}

// --- GET /products/:id ----------------------------------------------------

test("devuelve el producto completo por id", () => {
  const existente = find({}).items[0];
  const res = llamar(productController.detail, { params: { id: String(existente.id) } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.id, existente.id);
  assert.strictEqual(res.body.name, existente.name);
  // El objeto entero, no un resumen: la pantalla de detalle lo necesita completo.
  for (const campo of ["supermercado", "price_eur", "price_per_unit_eur", "measure_unit", "category", "is_offer", "is_new"]) {
    assert.ok(campo in res.body, `falta ${campo}`);
  }
});

test("un id que no existe da 404, no un objeto vacío", () => {
  const res = llamar(productController.detail, { params: { id: "999999" } });
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body.error, "producto no encontrado");
});

test("un id que no es entero positivo da 400", () => {
  for (const id of ["abc", "0", "-5", "1.5", "", "  "]) {
    const res = llamar(productController.detail, { params: { id } });
    assert.strictEqual(res.statusCode, 400, `id=${JSON.stringify(id)} no dio 400`);
  }
});

test("findById devuelve undefined y no revienta con un id inexistente", () => {
  assert.strictEqual(productModel.findById(999999), undefined);
});

// --- ?measure_unit= -------------------------------------------------------

test("measure_unit filtra por coincidencia exacta", () => {
  assert.strictEqual(find({ measure_unit: "l" }).total, 3);
  assert.strictEqual(find({ measure_unit: "kg" }).total, 2);
  assert.strictEqual(find({ measure_unit: "lavado" }).total, 1);
});

test("no convierte entre unidades: kg y kg.peso esc son distintas", () => {
  // No son convertibles y mezclarlas es justo lo que rompe la comparación.
  assert.strictEqual(find({ measure_unit: "kg" }).total, 2);
  assert.strictEqual(find({ measure_unit: "kg.peso esc" }).total, 1);
});

test("una unidad inexistente devuelve vacío, no todo el catálogo", () => {
  assert.strictEqual(find({ measure_unit: "furlong" }).total, 0);
});

test("measure_unit vacío no filtra", () => {
  assert.strictEqual(find({ measure_unit: "" }).total, FIXTURES.length);
  assert.strictEqual(find({}).total, FIXTURES.length);
});

test("el precio por unidad sólo es comparable dentro de una unidad", () => {
  // Sin filtro, "lo que más conviene" arranca con el detergente por lavado, que no
  // se puede comparar con un euro por kilo.
  const mezclado = find({}, { sort: "unit_price_asc" }).items;
  assert.strictEqual(mezclado[0].measure_unit, "lavado");

  // Con la unidad fijada, el orden significa algo: la garrafa de aceite gana a la
  // botella aunque cueste casi cuatro veces más.
  const porLitro = find({ measure_unit: "l" }, { sort: "unit_price_asc" }).items;
  assert.deepStrictEqual(porLitro.map((p) => p.price_per_unit_eur), [0.89, 3.55, 4.95]);
  const aceites = porLitro.filter((p) => p.name.includes("Aceite"));
  assert.strictEqual(aceites[0].price_eur, 17.75, "la garrafa debería ganar por litro");
});

test("measure_unit se combina con los filtros de siempre", () => {
  assert.strictEqual(find({ measure_unit: "l", supermercado: "mercadona" }).total, 2);
  assert.strictEqual(find({ measure_unit: "kg", supermercado: "dia" }).total, 1);
  assert.strictEqual(find({ measure_unit: "l", category: "Aceite" }).total, 2);
  assert.strictEqual(find({ measure_unit: "l", q: "aceite" }).total, 2);
  assert.strictEqual(find({ measure_unit: "kg", is_offer: 1 }).total, 0);
});

test("measure_unit llega desde la query del listado", () => {
  const res = llamar(productController.list, { query: { measure_unit: "kg" } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.total, 2);
});

// --- GET /unidades --------------------------------------------------------

test("unidades lista las que hay con su conteo, de mayor a menor", () => {
  const unidades = productModel.countByMeasureUnit();
  const totales = unidades.map((u) => u.total);
  assert.deepStrictEqual(totales, [...totales].sort((a, b) => b - a));
  const nombres = unidades.map((u) => u.measure_unit);
  assert.ok(nombres.includes("l") && nombres.includes("kg") && nombres.includes("lavado"));
});

test("unidades no inventa una entrada para las filas sin unidad", () => {
  const unidades = productModel.countByMeasureUnit();
  assert.ok(!unidades.some((u) => u.measure_unit === null || u.measure_unit === ""));
  // La suma cuadra con las filas que sí declaran unidad.
  const suma = unidades.reduce((s, u) => s + u.total, 0);
  assert.strictEqual(suma, FIXTURES.length - 1);
});

test("unidades incluye la cola sucia, que es lo que la hace consultable", () => {
  // "lavado" y "capsula" son comparaciones reales que un comprador quiere hacer y
  // que sin esto eran inalcanzables.
  const nombres = productModel.countByMeasureUnit().map((u) => u.measure_unit);
  for (const raro of ["lavado", "capsula", "docena", "kg.peso esc"]) {
    assert.ok(nombres.includes(raro), `falta ${raro}`);
  }
});

test("unidades se puede acotar por cadena", () => {
  const nombres = productModel.countByMeasureUnit({ supermercado: "dia" }).map((u) => u.measure_unit);
  assert.deepStrictEqual(nombres.sort(), ["capsula", "docena", "kg", "l"]);
});

test("el endpoint de unidades responde 200 con la lista", () => {
  const res = llamar(productController.unidades, { query: {} });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok("measure_unit" in res.body[0] && "total" in res.body[0]);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
