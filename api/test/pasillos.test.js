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

const categorias = require("../src/lib/categories");
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

// Pasando por `columnsFor()`, igual que el ingest y que los fixtures de más abajo.
// Insertados en crudo quedaban con `aisle` y `canonical_category` a NULL, así que
// eran filas con una forma que en producción no existe: los tests de este archivo
// sólo pasaban porque `countByAisle` agrupa por `category`, y cualquier prueba que
// filtrara por `pasillo=` (que va contra `p.aisle`) o por `categoria_canonica=`
// habría dado cero sin que el fixture tuviera nada que ver con lo que se probaba.
productModel.insertMany(
  FIXTURES.map((row) => ({ ...row, ...categorias.columnsFor(row) }))
);

const pasillos = (filters, opts) => productModel.countByAisle(filters, opts).pasillos;
const contar = (filters, opts) => productModel.countByAisle(filters, opts).total;

// --- el caso que motivó el endpoint ---------------------------------------

test("una cadena devuelve sus pasillos con el número de productos", () => {
  const r = pasillos({ supermercado: "mercadona" });
  assert.deepStrictEqual(r, [
    { supermercado: "mercadona", aisle: "Leche y bebidas vegetales", total: 12,
      aisle_key: "lech y bebida vegetal", aisle_canonical: "Leche y bebidas vegetales" },
    // "Verdura" es un pasillo genérico de fruta y verdura: su nombre canónico está
    // escrito a mano, así que no depende de la ortografía de esta cadena.
    { supermercado: "mercadona", aisle: "Verdura", total: 8,
      aisle_key: "fruta y verdura", aisle_canonical: "Frutas y verduras" },
    { supermercado: "mercadona", aisle: "Helados", total: 5,
      aisle_key: "helado", aisle_canonical: "Helados" },
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

test("el total cuenta los pasillos que hay, no los que devuelve el limit", () => {
  // Misma semántica que en /products: si contara después del recorte, quien
  // consume la API no podría saber cuántos hay ni paginar.
  assert.strictEqual(contar({ supermercado: "ahorramas" }), 5);
  assert.strictEqual(contar({ supermercado: "ahorramas" }, { limit: 2 }), 5);
  assert.strictEqual(pasillos({ supermercado: "ahorramas" }, { limit: 2 }).length, 2);
});

test("el total sí respeta min_total, porque ahí cambia el conjunto", () => {
  assert.strictEqual(contar({ supermercado: "ahorramas" }, { minTotal: 2 }), 3);
  assert.strictEqual(contar({ supermercado: "ahorramas" }, { minTotal: 2, limit: 1 }), 3);
});

// --- datos sucios ---------------------------------------------------------

test("las filas sin categoría no aparecen como pasillo", () => {
  // aldi tiene 103 productos sin categoría en producción.
  const r = pasillos({ supermercado: "aldi" });
  assert.deepStrictEqual(r, [
    { supermercado: "aldi", aisle: "Limpieza y hogar", total: 2,
      aisle_key: "limpieza y hogar", aisle_canonical: "Limpieza y hogar" },
  ]);
});

test("una cadena que no existe devuelve lista vacía, no error", () => {
  assert.deepStrictEqual(pasillos({ supermercado: "no_existe" }), []);
});

test("una cadena con la etiqueta inservible devuelve ese único pasillo", () => {
  // carrefour dice "Bebidas" para todo su catálogo: es la verdad de los datos.
  assert.deepStrictEqual(pasillos({ supermercado: "carrefour" }), [
    { supermercado: "carrefour", aisle: "Bebidas", total: 4,
      aisle_key: "bebida", aisle_canonical: "Bebidas" },
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
    { supermercado: "mercadona", aisle: "Helados", total: 5,
      aisle_key: "helado", aisle_canonical: "Helados" },
  ]);
});

test("y sólo los que tienen ofertas", () => {
  assert.deepStrictEqual(pasillos({ is_offer: 1 }), [
    { supermercado: "ahorramas", aisle: "Zumos", total: 2,
      aisle_key: "zumo", aisle_canonical: "Zumos" },
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
  assert.deepStrictEqual(Object.keys(res.body), ["total", "limit", "min_total", "pasillos"]);
  assert.strictEqual(res.body.total, 3);
  assert.deepStrictEqual(Object.keys(res.body.pasillos[0]), [
    "supermercado", "aisle", "total", "aisle_key", "aisle_canonical",
  ]);
});

test("min_total y limit llegan desde la query", () => {
  assert.strictEqual(llamar(productController.pasillos, { supermercado: "ahorramas", min_total: "2" }).body.total, 3);
  const conLimit = llamar(productController.pasillos, { supermercado: "ahorramas", limit: "2" }).body;
  assert.strictEqual(conLimit.total, 5, "el total no debe depender del limit");
  assert.strictEqual(conLimit.pasillos.length, 2);
  assert.strictEqual(conLimit.limit, 2);
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

// --- varios `category` en una sola llamada --------------------------------
//
// El caso real: la app pinta UNA fila por pasillo agrupando los nombres que sólo
// se diferencian en acentos/mayúsculas o en singular/plural, porque las cadenas
// escriben el mismo pasillo distinto ("Frutas" en dia y aldi, "Fruta" en
// mercadona: 143 productos en tres filas repetidas). Esa fila agrupada tiene que
// poder abrirse, y para eso `?category=` tiene que aceptar los dos nombres.
//
// Estas filas se insertan al final a propósito: los tests de arriba ya corrieron
// (test() ejecuta en el momento) y varios cuentan sobre FIXTURES.length.
//
// Y se insertan pasando por `columnsFor()`, no a mano: la app pide el pasillo
// junto con `categoria_canonica`, así que un fixture sin `canonical_category`
// haría que el filtro canónico no encontrara nada y el test pasaría por el
// motivo equivocado. Derivar las columnas a mano acá es exactamente el bug que
// ya se pagó una vez -- los fixtures tienen que salir de la misma función que
// usa el ingest.

const crudos = [
  { supermercado: "dia", category: "Frutas", veces: 4 },
  { supermercado: "mercadona", category: "Fruta", veces: 3 },
  // Otro pasillo del MISMO cajón: así el cajón es más grande que la fila y se
  // puede comprobar que pedir los dos nombres acota de verdad en vez de traer
  // el cajón entero. Las FIXTURES de arriba no sirven para esto porque se
  // insertaron sin pasar por columnsFor y quedaron sin `canonical_category`.
  { supermercado: "dia", category: "Verduras", veces: 2 },
  // Control: otro cajón, para comprobar que el IN no se lleva de más.
  { supermercado: "dia", category: "Carnes", veces: 2 },
];

const NUEVOS = [];
for (const { supermercado, category, veces } of crudos) {
  for (let i = 0; i < veces; i++) {
    const base = {
      supermercado, category,
      name: `Fruta ${NUEVOS.length + 1}`,
      price_eur: 2, price_per_unit_eur: 2, measure_unit: "kg",
      ean13: null, brand: null, image: null, url: null,
      is_offer: 0, price_before: null, is_new: 0,
    };
    NUEVOS.push({ ...base, ...categorias.columnsFor(base) });
  }
}
productModel.insertMany(NUEVOS);

const buscar = (filtros) => productModel.findAll(filtros, { limit: 50, offset: 0 });

test("los fixtures nuevos caen en el cajón canónico por columnsFor, no a mano", () => {
  // Si esto falla, los tests de abajo estarían midiendo otra cosa.
  const items = buscar({ category: "Fruta" }).items;
  assert.strictEqual(items.length, 3);
  assert.ok(items.every((p) => p.canonical_category === "frutas_verduras"));
});

test("un solo category sigue funcionando igual que antes", () => {
  assert.strictEqual(buscar({ category: "Frutas" }).total, 4);
  assert.strictEqual(buscar({ category: "Fruta" }).total, 3);
});

test("category repetido suma los dos nombres en una sola llamada", () => {
  // Antes esto era un 500: `RangeError: Too many parameter values were provided`.
  const r = buscar({ category: ["Fruta", "Frutas"] });
  assert.strictEqual(r.total, 7);
  assert.deepStrictEqual([...new Set(r.items.map((p) => p.category))].sort(), ["Fruta", "Frutas"]);
});

test("y no arrastra pasillos que no se pidieron", () => {
  assert.ok(!buscar({ category: ["Fruta", "Frutas"] }).items.some((p) => p.category === "Carnes"));
});

test("varios category se combinan con categoria_canonica, como los pide la app", () => {
  // Es literalmente lo que manda la pantalla: el cajón + los nombres de la fila.
  const r = buscar({ categoria_canonica: "frutas_verduras", category: ["Fruta", "Frutas"] });
  assert.strictEqual(r.total, 7);
  // Y el cajón por sí solo trae más que la fila: la fila acota de verdad.
  assert.ok(buscar({ categoria_canonica: "frutas_verduras" }).total > 7);
});

test("un category repetido con valores vacíos no filtra por cadena vacía", () => {
  // `?category=&category=Fruta` tiene que valer lo mismo que `?category=Fruta`,
  // igual que un `?category=` a secas no filtra.
  assert.strictEqual(buscar({ category: ["", "Fruta"] }).total, 3);
  assert.strictEqual(buscar({ category: ["", "  "] }).total, buscar({}).total);
});

test("los duplicados no multiplican filas", () => {
  // El IN es de conjunto: pedir dos veces el mismo nombre no duplica productos.
  assert.strictEqual(buscar({ category: ["Fruta", "Fruta"] }).total, 3);
});

test("varios category también acotan el conteo de pasillos", () => {
  // buildWhere es compartido, así que /pasillos hereda el filtro sin tocarlo.
  const r = productModel.countByAisle({ category: ["Fruta", "Frutas"] }).pasillos;
  assert.deepStrictEqual(r, [
    { supermercado: "dia", aisle: "Frutas", total: 4,
      aisle_key: "fruta y verdura", aisle_canonical: "Frutas y verduras" },
    { supermercado: "mercadona", aisle: "Fruta", total: 3,
      aisle_key: "fruta y verdura", aisle_canonical: "Frutas y verduras" },
  ]);
});

test("varios category llegan por HTTP tal como express los entrega", () => {
  // express da un array cuando el parámetro viene repetido; el controller lo
  // pasa tal cual y el modelo es el que decide `=` o `IN`.
  const res = llamar(productController.list, { category: ["Fruta", "Frutas"] });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.total, 7);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
