// Tests de la búsqueda: la parte pura (interpretación de la query) y la parte
// contra sqlite (índice FTS, ranking, filtros), porque el bug que originó todo
// esto estaba en el SQL y un test puro no lo habría visto.
// Uso: npm test
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB_PATH = path.join(os.tmpdir(), `market_search_test_${process.pid}.db`);
fs.rmSync(DB_PATH, { force: true });
process.env.MARKET_DB_PATH = DB_PATH;

const { parseSearchQuery, ftsExpression, sizeBand } = require("../src/lib/search");
const productModel = require("../src/models/product.model");

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

// --- interpretación de la query (puro) ---

test("parseSearchQuery parte la query en tokens", () => {
  assert.deepStrictEqual(parseSearchQuery("agua bronchales").tokens, ["agua", "bronchales"]);
});

test("parseSearchQuery quita acentos y mayúsculas", () => {
  assert.deepStrictEqual(parseSearchQuery("Papel HIGIÉNICO").tokens, ["papel", "higienico"]);
});

test("parseSearchQuery descarta palabras funcionales", () => {
  assert.deepStrictEqual(parseSearchQuery("leche de la vaca").tokens, ["leche", "vaca"]);
});

test("parseSearchQuery conserva grande/pequeña, que en búsqueda sí significan algo", () => {
  // A diferencia del matching entre cadenas, acá el usuario los escribió a propósito.
  assert.deepStrictEqual(parseSearchQuery("agua grande").tokens, ["agua", "grande"]);
});

test("parseSearchQuery separa la cantidad del texto", () => {
  const parsed = parseSearchQuery("agua 50cl");
  assert.deepStrictEqual(parsed.tokens, ["agua"]);
  assert.deepStrictEqual(parsed.size, { value: 0.5, unit: "l" });
});

test("parseSearchQuery entiende los formatos de cantidad habituales", () => {
  assert.strictEqual(parseSearchQuery("agua 1,5l").size.value, 1.5);
  assert.strictEqual(parseSearchQuery("agua 1.5 l").size.value, 1.5);
  assert.strictEqual(parseSearchQuery("leche 500ml").size.value, 0.5);
  assert.strictEqual(parseSearchQuery("arroz 2kg").size.value, 2);
  assert.strictEqual(parseSearchQuery("chocolate 200 g").size.value, 0.2);
  assert.strictEqual(parseSearchQuery("papel 4 rollos").size.unit, "ud");
});

test("parseSearchQuery no invents cantidad donde no hay", () => {
  assert.strictEqual(parseSearchQuery("chocolate 85% cacao").size, null);
});

test("parseSearchQuery devuelve null con query vacía", () => {
  assert.strictEqual(parseSearchQuery(""), null);
  assert.strictEqual(parseSearchQuery("   "), null);
  assert.strictEqual(parseSearchQuery(undefined), null);
});

test("ftsExpression exige todos los tokens", () => {
  assert.strictEqual(ftsExpression(["agua", "bronchales"]), '"agua" AND "bronchales"');
});

test("ftsExpression en modo prefijo deja el final abierto", () => {
  assert.strictEqual(ftsExpression(["choco"], { prefix: true }), '"choco"*');
});

test("los operadores de FTS5 no sobreviven a la query del usuario", () => {
  // Si un `"` o un `*` llegara a la expresión, FTS5 tiraría error de sintaxis.
  const parsed = parseSearchQuery('agua " OR 1=1 -- *');
  for (const token of parsed.tokens) assert.ok(/^[a-z0-9]+$/.test(token), `token sucio: ${token}`);
});

test("sizeBand deja un margen del 10%", () => {
  const band = sizeBand({ value: 0.5, unit: "l" });
  assert.ok(Math.abs(band.min - 0.45) < 1e-9 && Math.abs(band.max - 0.55) < 1e-9);
});

// --- búsqueda real contra sqlite ---

const FIXTURES = [
  // Los nombres reproducen los patrones reales de cada cadena.
  ["mercadona", "Agua mineral grande Bronchales", 0.39, 0.26, "l", "Agua"],
  ["mercadona", "Agua mineral mediana Bronchales", 0.5, 0.5, "l", "Agua"],
  ["mercadona", "Agua mineral pequeña Bronchales", 0.29, 0.58, "l", "Agua"],
  ["mercadona", "Agua mineral grande Font Vella", 0.77, 0.51, "l", "Agua"],
  ["mercadona", "Agua mineral con gas grande Vichy Catalan", 1.55, 1.55, "l", "Agua"],
  ["mercadona", "Aguacate", 1.2, 4.0, "kg", "Fruta"],
  ["mercadona", "Aguacates", 2.5, 3.5, "kg", "Fruta"],
  ["mercadona", "Papel higiénico Suave Bosque Verde", 3.7, 0.46, "ud", "Papel"],
  ["mercadona", "Chocolate con leche extrafino Nestlé", 1.1, 8.8, "kg", "Chocolate"],
  ["mercadona", "Crema catalana Hacendado", 1.8, 4.5, "kg", "Postres"],
  // carrefour: litraje en el nombre y measure_unit vacío
  ["carrefour", "Agua mineral con gas Vichy Catalán natural 50 cl.", 1.36, 2.72, null, "Bebidas"],
  ["carrefour", "Agua mineral Font Vella 1,5 l.", 0.77, 0.51, null, "Bebidas"],
];

productModel.insertMany(
  FIXTURES.map(([supermercado, name, price_eur, price_per_unit_eur, measure_unit, category]) => ({
    supermercado, name, price_eur, price_per_unit_eur, measure_unit, category,
    ean13: null, brand: null, image: null, url: null,
    is_offer: 0, price_before: null, is_new: 0,
  }))
);

const find = (filters, paging = { limit: 50, offset: 0 }) => productModel.findAll(filters, paging);
const names = (filters) => find(filters).items.map((i) => i.name);

test("el caso reportado: 'agua bronchales' encuentra las Bronchales", () => {
  const found = names({ q: "agua bronchales" });
  assert.strictEqual(found.length, 3, `encontró ${found.length}: ${found}`);
  assert.ok(found.every((n) => n.includes("Bronchales")));
});

test("el orden de los términos no importa", () => {
  assert.deepStrictEqual(names({ q: "bronchales agua" }).sort(), names({ q: "agua bronchales" }).sort());
});

test("los tokens no necesitan estar pegados ni en orden", () => {
  // "grande ... Vella" tiene palabras en medio en un sentido y en el otro.
  assert.deepStrictEqual(names({ q: "font vella" }), ["Agua mineral grande Font Vella", "Agua mineral Font Vella 1,5 l."]);
});

test("buscar sin tildes encuentra lo que las tiene", () => {
  assert.deepStrictEqual(names({ q: "higienico" }), ["Papel higiénico Suave Bosque Verde"]);
  assert.deepStrictEqual(names({ q: "nestle" }), ["Chocolate con leche extrafino Nestlé"]);
});

test("y buscar con tildes encuentra lo que no las tiene", () => {
  // En los datos reales la misma marca aparece escrita de las dos formas.
  assert.strictEqual(names({ q: "catalán" }).length, 2);
});

test("'agua' no devuelve aguacates", () => {
  const found = names({ q: "agua" });
  assert.ok(!found.some((n) => n.toLowerCase().includes("aguacate")), `colaron aguacates: ${found}`);
  assert.strictEqual(found.length, 7);
});

test("una palabra a medio escribir sí cae a prefijo", () => {
  assert.deepStrictEqual(names({ q: "bronchal" }).length, 3);
  assert.deepStrictEqual(names({ q: "choco" }), ["Chocolate con leche extrafino Nestlé"]);
});

test("el ranking pone primero lo más relevante", () => {
  // "vichy" es raro y "agua" comunísimo: la Vichy tiene que salir arriba.
  assert.ok(names({ q: "agua vichy" })[0].includes("Vichy"));
});

test("query sin resultados devuelve vacío, no error", () => {
  assert.deepStrictEqual(find({ q: "xyzzy inexistente" }), { total: 0, items: [] });
});

// --- búsquedas por tamaño ---

test("el caso reportado: 'agua 50cl' encuentra el formato de 50 cl", () => {
  const found = names({ q: "agua 50cl" });
  assert.deepStrictEqual(found.sort(), [
    "Agua mineral con gas Vichy Catalán natural 50 cl.",
    "Agua mineral pequeña Bronchales",
  ]);
});

test("'agua 1,5l' encuentra el litro y medio en las dos cadenas", () => {
  const found = names({ q: "agua 1,5l" }).sort();
  assert.deepStrictEqual(found, [
    "Agua mineral Font Vella 1,5 l.",
    "Agua mineral grande Bronchales",
    "Agua mineral grande Font Vella",
  ]);
});

test("el tamaño se deduce igual sin measure_unit (filas de carrefour)", () => {
  // "Font Vella 1,5 l." viene con measure_unit NULL y aun así entra en la banda.
  assert.ok(names({ q: "font vella 1,5l" }).includes("Agua mineral Font Vella 1,5 l."));
});

test("la unidad importa: 1 kg no aparece buscando 1 l", () => {
  assert.deepStrictEqual(names({ q: "aguacate 1,2kg" }), []);
  assert.deepStrictEqual(names({ q: "aguacate 300g" }), ["Aguacate"]);
});

test("un tamaño que no existe devuelve vacío en vez de aproximar", () => {
  assert.deepStrictEqual(names({ q: "agua 33cl" }), []);
});

// --- convivencia con el resto de los filtros ---

test("q se combina con supermercado", () => {
  assert.deepStrictEqual(names({ q: "agua vichy", supermercado: "carrefour" }), [
    "Agua mineral con gas Vichy Catalán natural 50 cl.",
  ]);
});

test("q se combina con category", () => {
  assert.strictEqual(find({ q: "agua", category: "Agua" }).total, 5);
  assert.strictEqual(find({ q: "agua", category: "Fruta" }).total, 0);
});

test("q se combina con is_offer y is_new", () => {
  assert.strictEqual(find({ q: "agua", is_offer: 0 }).total, 7);
  assert.strictEqual(find({ q: "agua", is_offer: 1 }).total, 0);
  assert.strictEqual(find({ q: "agua", is_new: 1 }).total, 0);
});

test("q se combina con ean13", () => {
  assert.strictEqual(find({ q: "agua", ean13: "no-existe" }).total, 0);
});

test("q por tamaño se combina con supermercado", () => {
  assert.deepStrictEqual(names({ q: "agua 50cl", supermercado: "mercadona" }), [
    "Agua mineral pequeña Bronchales",
  ]);
});

test("los filtros de siempre siguen andando sin q", () => {
  assert.strictEqual(find({}).total, FIXTURES.length);
  assert.strictEqual(find({ supermercado: "carrefour" }).total, 2);
  assert.strictEqual(find({ category: "Fruta" }).total, 2);
});

test("sin q el orden sigue siendo por id", () => {
  const ids = find({}).items.map((i) => i.id);
  assert.deepStrictEqual(ids, [...ids].sort((a, b) => a - b));
});

test("limit y offset paginan sin repetir ni saltear", () => {
  const all = names({ q: "agua" });
  const page1 = find({ q: "agua" }, { limit: 2, offset: 0 }).items.map((i) => i.name);
  const page2 = find({ q: "agua" }, { limit: 2, offset: 2 }).items.map((i) => i.name);
  assert.deepStrictEqual([...page1, ...page2], all.slice(0, 4));
});

test("limit y offset también paginan las búsquedas por tamaño", () => {
  const all = names({ q: "agua 50cl" });
  assert.strictEqual(find({ q: "agua 50cl" }, { limit: 1, offset: 0 }).items[0].name, all[0]);
  assert.strictEqual(find({ q: "agua 50cl" }, { limit: 1, offset: 1 }).items[0].name, all[1]);
  assert.strictEqual(find({ q: "agua 50cl" }, { limit: 1, offset: 1 }).total, 2);
});

test("el índice FTS se mantiene al insertar (triggers)", () => {
  productModel.insertMany([{
    supermercado: "carrefour", name: "Sidra natural asturiana Trabanco 75 cl.",
    price_eur: 3.2, price_per_unit_eur: 4.27, measure_unit: null, category: "Bebidas",
    ean13: null, brand: null, image: null, url: null, is_offer: 0, price_before: null, is_new: 0,
  }]);
  assert.deepStrictEqual(names({ q: "sidra trabanco" }), ["Sidra natural asturiana Trabanco 75 cl."]);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
