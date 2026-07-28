// Tests de GET /pasillos y del filtrado de GET /supermercados. Contra sqlite,
// porque lo que hay que comprobar es el GROUP BY y su orden.
// Uso: npm test
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB_PATH = path.join(os.tmpdir(), `market_pasillos_test_${process.pid}.db`);
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

// Reproduce la desigualdad real entre cadenas: mercadona con pasillos medianos,
// ahorramas granular con cola de pasillos de un solo producto, carrefour con la
// etiqueta inservible y aldi con filas sin categoría.
const FIXTURES = [];
const add = (supermercado, category, veces, extra = {}) => {
  for (let i = 0; i < veces; i++) {
    FIXTURES.push({
      supermercado, category,
      name: `Producto ${FIXTURES.length + 1}`,
      price_eur: 1.5, price_per_unit_eur: 1.5, measure_unit: "ud",
      ean13: null, brand: null, image: null, url: null,
      is_offer: 0, price_before: null, is_new: 0, ...extra,
    });
  }
};

add("mercadona", "Leche y bebidas vegetales", 12);
add("mercadona", "Verdura", 8);
add("mercadona", "Helados", 5, { is_new: 1 });
add("ahorramas", "Refrescos", 6);
add("ahorramas", "Cerveza", 3);
add("ahorramas", "Vodka", 1);
add("ahorramas", "Yogures proteicos", 1);
add("ahorramas", "Zumos", 2, { is_offer: 1 });
add("carrefour", "Bebidas", 4);
add("aldi", null, 3); // sin categoría: no son un pasillo
add("aldi", "Limpieza y hogar", 2);

productModel.insertMany(FIXTURES);

const pasillos = (filters, opts) => productModel.countByAisle(filters, opts);

// --- el caso que motivó el endpoint ---------------------------------------

test("una cadena devuelve sus pasillos con el número de productos", () => {
  const r = pasillos({ supermercado: "mercadona" });
  assert.deepStrictEqual(r, [
    { supermercado: "mercadona", aisle: "Leche y bebidas vegetales", total: 12 },
    { supermercado: "mercadona", aisle: "Verdura", total: 8 },
    { supermercado: "mercadona", aisle: "Helados", total: 5 },
  ]);
});

test("vienen ordenados por número de productos, no alfabéticamente", () => {
  // Con 537 pasillos, alfabético dejaría lo útil enterrado abajo.
  const totales = pasillos({ supermercado: "ahorramas" }).map((p) => p.total);
  assert.deepStrictEqual(totales, [...totales].sort((a, b) => b - a));
  assert.strictEqual(pasillos({ supermercado: "ahorramas" })[0].aisle, "Refrescos");
});

test("los empates se ordenan por nombre, para que el orden sea estable", () => {
  const empatados = pasillos({ supermercado: "ahorramas" })
    .filter((p) => p.total === 1)
    .map((p) => p.aisle);
  assert.deepStrictEqual(empatados, ["Vodka", "Yogures proteicos"]);
});

test("el pasillo devuelto sirve tal cual para ?category=", () => {
  // Es la mitad del caso de uso: entrar en el pasillo y ver sus productos.
  const aisle = pasillos({ supermercado: "mercadona" })[0].aisle;
  const productos = productModel.findAll(
    { supermercado: "mercadona", category: aisle },
    { limit: 50, offset: 0 }
  );
  assert.strictEqual(productos.total, 12);
  assert.ok(productos.items.every((p) => p.category === aisle));
});

// --- acotar la cola de las cadenas granulares ------------------------------

test("min_total recorta los pasillos con pocos productos", () => {
  assert.strictEqual(pasillos({ supermercado: "ahorramas" }).length, 5);
  assert.strictEqual(pasillos({ supermercado: "ahorramas" }, { minTotal: 2 }).length, 3);
  assert.strictEqual(pasillos({ supermercado: "ahorramas" }, { minTotal: 6 }).length, 1);
});

test("min_total no descarta nada cuando es 0", () => {
  assert.strictEqual(
    pasillos({ supermercado: "ahorramas" }, { minTotal: 0 }).length,
    pasillos({ supermercado: "ahorramas" }).length
  );
});

test("limit corta la lista sin cambiar el orden", () => {
  const todos = pasillos({ supermercado: "ahorramas" });
  assert.deepStrictEqual(pasillos({ supermercado: "ahorramas" }, { limit: 2 }), todos.slice(0, 2));
});

// --- datos sucios ---------------------------------------------------------

test("las filas sin categoría no aparecen como pasillo", () => {
  // aldi tiene 103 productos sin categoría en producción.
  const r = pasillos({ supermercado: "aldi" });
  assert.deepStrictEqual(r, [{ supermercado: "aldi", aisle: "Limpieza y hogar", total: 2 }]);
});

test("una cadena que no existe devuelve lista vacía, no error", () => {
  assert.deepStrictEqual(pasillos({ supermercado: "no_existe" }), []);
});

test("una cadena con la etiqueta inservible devuelve ese único pasillo", () => {
  // carrefour dice "Bebidas" para todo su catálogo: es la verdad de los datos.
  assert.deepStrictEqual(pasillos({ supermercado: "carrefour" }), [
    { supermercado: "carrefour", aisle: "Bebidas", total: 4 },
  ]);
});

// --- sin filtro de cadena -------------------------------------------------

test("sin supermercado devuelve los pasillos de todas las cadenas, con su cadena", () => {
  const r = pasillos({});
  assert.ok(r.length >= 9);
  assert.ok(r.every((p) => typeof p.supermercado === "string" && p.supermercado.length > 0));
  // El mismo nombre de pasillo puede existir en dos cadenas y no se mezclan.
  assert.strictEqual(r.filter((p) => p.aisle === "Bebidas").length, 1);
});

test("cada fila lleva siempre la cadena, aunque se haya filtrado por ella", () => {
  // Así la forma de la respuesta no cambia según los parámetros, y cuando exista
  // la capa canónica se le pueden añadir campos sin romper a quien la consuma.
  for (const fila of pasillos({ supermercado: "mercadona" })) {
    assert.strictEqual(fila.supermercado, "mercadona");
  }
});

// --- combinación con los flags -------------------------------------------

test("se pueden pedir sólo los pasillos que tienen novedades", () => {
  assert.deepStrictEqual(pasillos({ supermercado: "mercadona", is_new: 1 }), [
    { supermercado: "mercadona", aisle: "Helados", total: 5 },
  ]);
});

test("y sólo los que tienen ofertas", () => {
  assert.deepStrictEqual(pasillos({ is_offer: 1 }), [
    { supermercado: "ahorramas", aisle: "Zumos", total: 2 },
  ]);
});

// --- GET /supermercados con flags ----------------------------------------

test("supermercados sin filtro cuenta todo el catálogo de cada cadena", () => {
  const r = productModel.countBySupermercado();
  const total = r.reduce((s, x) => s + x.total, 0);
  assert.strictEqual(total, FIXTURES.length);
  assert.deepStrictEqual(r.map((x) => x.total), [...r.map((x) => x.total)].sort((a, b) => b - a));
});

test("supermercados?is_new devuelve sólo las cadenas que tienen novedades", () => {
  // En producción sólo 5 de 9 las traen, y la UI no debe ofrecer el filtro en las
  // otras 4.
  const r = productModel.countBySupermercado({ is_new: 1 });
  assert.deepStrictEqual(r, [{ supermercado: "mercadona", total: 5 }]);
});

test("supermercados?is_offer devuelve sólo las cadenas que tienen ofertas", () => {
  assert.deepStrictEqual(productModel.countBySupermercado({ is_offer: 1 }), [
    { supermercado: "ahorramas", total: 2 },
  ]);
});

test("una cadena sin novedades desaparece de la lista, no sale con total 0", () => {
  const conNovedades = productModel.countBySupermercado({ is_new: 1 }).map((x) => x.supermercado);
  assert.ok(!conNovedades.includes("carrefour"));
});

// --- la capa HTTP --------------------------------------------------------

function llamar(handler, query) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  handler({ query }, res);
  return res;
}

test("el endpoint devuelve la forma acordada", () => {
  const res = llamar(productController.pasillos, { supermercado: "mercadona" });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(Object.keys(res.body), ["total", "min_total", "pasillos"]);
  assert.strictEqual(res.body.total, 3);
  assert.deepStrictEqual(Object.keys(res.body.pasillos[0]), ["supermercado", "aisle", "total"]);
});

test("min_total y limit llegan desde la query", () => {
  assert.strictEqual(llamar(productController.pasillos, { supermercado: "ahorramas", min_total: "2" }).body.total, 3);
  assert.strictEqual(llamar(productController.pasillos, { supermercado: "ahorramas", limit: "2" }).body.total, 2);
});

test("min_total con basura se trata como 0 en vez de romper", () => {
  const res = llamar(productController.pasillos, { supermercado: "ahorramas", min_total: "muchos" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.min_total, 0);
  assert.strictEqual(res.body.total, 5);
});

test("min_total negativo no invierte nada", () => {
  const res = llamar(productController.pasillos, { supermercado: "ahorramas", min_total: "-5" });
  assert.strictEqual(res.body.total, 5);
});

test("supermercados acepta los flags por HTTP", () => {
  assert.strictEqual(llamar(productController.supermercados, { is_new: "true" }).body.length, 1);
  assert.strictEqual(llamar(productController.supermercados, {}).body.length, 4);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
