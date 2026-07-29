// Tests de la taxonomía canónica: la resolución (pura) y los endpoints.
// Uso: npm test
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB_PATH = path.join(os.tmpdir(), `market_categorias_test_${process.pid}.db`);
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

const resolver = (supermercado, category, category_path) =>
  categorias.resolve({ supermercado, category, category_path });

// --- las tres pasadas -----------------------------------------------------

test("la ruta gana a la etiqueta, y con el prefijo más largo", () => {
  // "Cocina y hogar" es bazar salvo su rama de limpieza: el prefijo más largo la
  // rescata sin tener que rediseñar la entrada de la raíz.
  assert.strictEqual(
    resolver("lidl", "x", ["Cocina y hogar", "Limpieza del hogar"]).canonical,
    "limpieza_drogueria"
  );
  assert.strictEqual(
    resolver("lidl", "x", ["Cocina y hogar", "Almacenamiento"]).canonical,
    categorias.FUERA_DE_ALCANCE
  );
  assert.strictEqual(resolver("lidl", "x", ["Vino, cerveza y licores"]).canonical, "bebidas_alcohol");
});

test("la etiqueta exacta resuelve las cadenas con categorías utilizables", () => {
  assert.strictEqual(resolver("dia", "Cervezas, vinos y licores").canonical, "bebidas_alcohol");
  assert.strictEqual(resolver("alcampo", "Droguería").canonical, "limpieza_drogueria");
  assert.strictEqual(resolver("mercadona", "Verdura").canonical, "frutas_verduras");
  assert.strictEqual(resolver("dia", "Cervezas, vinos y licores").source, "category");
});

test("la palabra clave cubre la cola larga de hojas", () => {
  // bm y ahorramás traen cientos de hojas: sin esto habría que escribirlas a mano.
  assert.strictEqual(resolver("bm", "Vino tinto").canonical, "bebidas_alcohol");
  assert.strictEqual(resolver("bm", "Merluza y otros pescados blancos").canonical, "pescado_marisco");
  assert.strictEqual(resolver("ahorramas", "Comida húmeda para gatos").canonical, "mascotas");
  assert.strictEqual(resolver("bm", "Vino tinto").source, "keyword");
});

test("los patrones se escriben en el alfabeto normalizado", () => {
  // Se comparan contra texto sin acentos y con la ñ convertida en n. Escribir
  // "baño" en el patrón no coincide nunca: costó 43 productos de bm.
  assert.strictEqual(resolver("bm", "Gel de baño").canonical, "higiene_personal");
  assert.strictEqual(resolver("mercadona", "Pañales").canonical, "bebe");
  assert.strictEqual(resolver("bm", "Champiñones").canonical, "frutas_verduras");
});

test("lo distintivo gana a lo genérico", () => {
  // "Chocolate con leche" es chocolate: con el orden inverso caía en lácteos.
  assert.strictEqual(resolver("bm", "Chocolate con leche").canonical, "dulces_chocolate");
  assert.strictEqual(resolver("bm", "Leche, batidos y bebidas vegetales").canonical, "lacteos_huevos");
  assert.strictEqual(resolver("mercadona", "Leche y bebidas vegetales").canonical, "lacteos_huevos");
});

// --- las tres salidas -----------------------------------------------------

test("las campañas comerciales no son un pasillo", () => {
  // ahorramás mezcla pasillos con promociones: "Feria del chocolate" no es el
  // pasillo del chocolate, es una promoción con productos de cualquier pasillo.
  for (const etiqueta of ["Black Friday", "Feria del chocolate", "Día del Padre", "Especial fútbol", "Campaña Puchero", "Semana Santa"]) {
    assert.strictEqual(
      resolver("ahorramas", etiqueta).canonical,
      categorias.NO_FIABLE,
      `"${etiqueta}" no se marcó como no fiable`
    );
  }
});

test("las marcas usadas como sección tampoco", () => {
  assert.strictEqual(resolver("ahorramas", "Mondelez").canonical, categorias.NO_FIABLE);
  assert.strictEqual(resolver("ahorramas", "Pepsico").canonical, categorias.NO_FIABLE);
});

test("los atributos que no son pasillo se marcan no fiables", () => {
  // "Sin gluten" son 803 productos de cualquier pasillo, y "Envasado" o "Al corte"
  // son la forma de venta, no el tipo de producto.
  for (const etiqueta of ["Sin gluten", "Envasado", "Al corte", "Bio", "Seco", "Húmedo"]) {
    assert.strictEqual(resolver("bm", etiqueta).canonical, categorias.NO_FIABLE, `"${etiqueta}"`);
  }
});

test("las categorías mixtas de alcampo siguen siendo no fiables", () => {
  for (const etiqueta of ["Folletos y Promociones", "Campañas", "Hogar y Decoración"]) {
    assert.strictEqual(resolver("alcampo", etiqueta).canonical, categorias.NO_FIABLE);
  }
});

test("lo que queda en las categorías de bazar de alcampo es no fiable, no bazar", () => {
  // Tras la limpieza sólo quedan las pilas y bombillas rescatadas, así que la
  // etiqueta miente sobre lo que hay dentro.
  assert.strictEqual(resolver("alcampo", "Bricolaje").canonical, categorias.NO_FIABLE);
  assert.strictEqual(resolver("alcampo", "Automóvil").canonical, categorias.NO_FIABLE);
});

test("carrefour es no fiable: una etiqueta para todo el catálogo", () => {
  assert.strictEqual(resolver("carrefour", "Bebidas").canonical, categorias.NO_FIABLE);
});

test("lo que no resuelve ninguna pasada queda sin cajón, no en uno inventado", () => {
  const r = resolver("bm", "Máquina líquido");
  assert.strictEqual(r.canonical, null);
  assert.strictEqual(r.source, null);
  // Y sin categoría tampoco se inventa nada.
  assert.strictEqual(resolver("aldi", null).canonical, null);
});

// --- el pasillo y la ruta -------------------------------------------------

test("el pasillo es la hoja de la ruta", () => {
  assert.strictEqual(
    categorias.aisleFrom({ category_path: ["Despensa", "Aceites", "Aceite de oliva"] }),
    "Aceite de oliva"
  );
});

test("sin ruta, el pasillo es la etiqueta plana", () => {
  // Es la degradación que toca: 1 de cada 10 productos de bm no trae ruta.
  assert.strictEqual(categorias.aisleFrom({ category: "Ternera" }), "Ternera");
  assert.strictEqual(categorias.aisleFrom({ category: null }), null);
});

test("la ruta se guarda como texto y se puede volver a leer", () => {
  const path = ["Frescos", "Carnicería", "Ternera"];
  const texto = categorias.pathToString(path);
  assert.strictEqual(texto, "Frescos > Carnicería > Ternera");
  assert.deepStrictEqual(categorias.pathToArray(texto), path);
  assert.strictEqual(categorias.pathToString([]), null);
  assert.strictEqual(categorias.pathToString(null), null);
});

test("FUERA_DE_ALCANCE y NO_FIABLE no son cajones", () => {
  // Son estados de la resolución, no categorías, así que no se guardan.
  assert.ok(!categorias.esCanonica(categorias.FUERA_DE_ALCANCE));
  assert.ok(!categorias.esCanonica(categorias.NO_FIABLE));
  assert.ok(!categorias.esCanonica(null));
  assert.ok(categorias.esCanonica("lacteos_huevos"));
});

// --- contra sqlite --------------------------------------------------------

const FIXTURES = [
  ["mercadona", "Leche y bebidas vegetales", null, "Leche entera Hacendado"],
  ["mercadona", "Verdura", null, "Tomate rama"],
  ["dia", "Cervezas, vinos y licores", null, "Cerveza Mahou"],
  ["bm", "Ternera", ["Frescos", "Carnicería", "Ternera"], "Cadera de añojo"],
  ["bm", "Yogur bífidus", null, "Bífidus natural"],
  ["alcampo", "Folletos y Promociones", null, "Aceite de oliva Carbonell 5 l"],
  ["bm", "Máquina líquido", null, "Producto sin resolver"],
  ["lidl", "x", ["Tienda de bricolaje y jardín", "Taller"], "Destornillador"],
];

productModel.insertMany(
  FIXTURES.map(([supermercado, category, category_path, name]) => {
    const { canonical, aisle, source } = categorias.resolve({ supermercado, category, category_path });
    return {
      supermercado, name, category,
      category_path: categorias.pathToString(category_path),
      aisle,
      canonical_category: categorias.esCanonica(canonical) ? canonical : null,
      category_source: categorias.esCanonica(canonical) ? source : null,
      price_eur: 1.5, price_per_unit_eur: 1.5, measure_unit: "ud",
      ean13: null, brand: null, image: null, url: null,
      is_offer: 0, price_before: null, is_new: 0,
    };
  })
);

test("las columnas de la taxonomía se guardan", () => {
  const { items } = productModel.findAll({ q: "cadera" }, { limit: 5, offset: 0 });
  const fila = items[0];
  assert.strictEqual(fila.category_path, "Frescos > Carnicería > Ternera");
  assert.strictEqual(fila.aisle, "Ternera");
  assert.strictEqual(fila.canonical_category, "carne");
  assert.strictEqual(fila.category_source, "keyword");
});

test("lo no resuelto se guarda como null, no con un cajón inventado", () => {
  const { items } = productModel.findAll({ q: "sin resolver" }, { limit: 5, offset: 0 });
  assert.strictEqual(items[0].canonical_category, null);
  assert.strictEqual(items[0].category_source, null);
});

test("countByCanonical devuelve los cajones con nombre y si son alimentación", () => {
  const { categorias: cajones, sin_clasificar } = productModel.countByCanonical();
  const ids = cajones.map((c) => c.id);
  assert.ok(ids.includes("lacteos_huevos") && ids.includes("carne"));
  const lacteos = cajones.find((c) => c.id === "lacteos_huevos");
  assert.strictEqual(lacteos.nombre, "Lácteos y huevos");
  assert.strictEqual(lacteos.alimentacion, true);
  assert.strictEqual(lacteos.total, 2);
  // Los no resueltos y los no fiables se cuentan aparte, no se esconden.
  assert.strictEqual(sin_clasificar, 3);
});

test("el orden de los cajones es el del mapa, no alfabético ni por volumen", () => {
  // Es el orden de los pasillos de un supermercado real.
  const ids = productModel.countByCanonical().categorias.map((c) => c.id);
  const esperado = categorias.CANONICAS.map((c) => c.id).filter((id) => ids.includes(id));
  assert.deepStrictEqual(ids, esperado);
});

test("se puede filtrar productos por cajón canónico y por pasillo", () => {
  assert.strictEqual(productModel.findAll({ categoria_canonica: "carne" }, { limit: 10, offset: 0 }).total, 1);
  assert.strictEqual(productModel.findAll({ pasillo: "Ternera" }, { limit: 10, offset: 0 }).total, 1);
  assert.strictEqual(productModel.findAll({ categoria_canonica: "no_existe" }, { limit: 10, offset: 0 }).total, 0);
});

test("los pasillos se pueden pedir dentro de un cajón, que es el paso 2 del flujo", () => {
  const { pasillos } = productModel.countByAisle({ categoria_canonica: "lacteos_huevos" });
  const aisles = pasillos.map((p) => p.aisle);
  assert.ok(aisles.includes("Leche y bebidas vegetales") && aisles.includes("Yogur bífidus"));
  // Y cada fila lleva su cadena, para poder elegir por qué pasillo de qué cadena ir.
  assert.ok(pasillos.every((p) => typeof p.supermercado === "string"));
});

test("los endpoints responden con la forma acordada", () => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  productController.categorias({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(Object.keys(res.body), ["categorias", "sin_clasificar"]);
  assert.deepStrictEqual(Object.keys(res.body.categorias[0]), ["id", "nombre", "alimentacion", "total", "supermercados"]);
});

test("categorias se puede acotar por cadena", () => {
  const { categorias: cajones } = productModel.countByCanonical({ supermercado: "mercadona" });
  assert.deepStrictEqual(cajones.map((c) => c.id).sort(), ["frutas_verduras", "lacteos_huevos"]);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
