// Tests de la lógica pura de matching (no toca la base ni el server).
// Uso: npm test
const assert = require("assert");
const M = require("../src/lib/matching");

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

// Fábrica de filas con la forma que tienen en la tabla products.
function product(fields) {
  return {
    id: fields.id ?? 1,
    supermercado: fields.supermercado ?? "carrefour",
    ean13: fields.ean13 ?? null,
    name: fields.name,
    brand: fields.brand ?? null,
    price_eur: fields.price_eur ?? null,
    price_per_unit_eur: fields.price_per_unit_eur ?? null,
    measure_unit: fields.measure_unit ?? null,
    category: fields.category ?? null,
  };
}

// --- normalización ---

test("normalizeName baja a minúsculas y quita acentos", () => {
  assert.strictEqual(M.normalizeName("Chocolate Nestlé PEQUEÑA"), "chocolate nestle pequena");
});

test("normalizeName limpia puntuación pero conserva números y coma decimal", () => {
  assert.strictEqual(M.normalizeName("Agua (Font Vella) 1,5 l."), "agua font vella 1,5 l.");
});

test("tokenize quita stopwords y adjetivos de tamaño", () => {
  assert.deepStrictEqual(
    M.tokenize(M.normalizeName("Agua mineral grande de Font Vella")),
    ["agua", "mineral", "font", "vella"]
  );
});

// --- cantidades ---

test("parseQuantity convierte cl a litros", () => {
  assert.deepStrictEqual(M.parseQuantity("cerveza mahou lata 50 cl"), {
    value: 0.5, unit: "l", text: "50 cl",
  });
});

test("parseQuantity convierte g a kg y acepta coma decimal", () => {
  assert.strictEqual(M.parseQuantity("pizza campofrio 360 g").value, 0.36);
  assert.strictEqual(M.parseQuantity("agua font vella 1,5 l").value, 1.5);
});

test("parseQuantity multiplica los packs 6 x 1,5 l", () => {
  assert.strictEqual(M.parseQuantity("agua pack 6 x 1,5 l").value, 9);
});

test("parseQuantity cuenta rollos como unidades", () => {
  assert.deepStrictEqual(M.parseQuantity("papel higienico 4 rollos").unit, "ud");
});

test("parseQuantity no confunde porcentajes con cantidades", () => {
  assert.strictEqual(M.parseQuantity("chocolate negro 85% cacao"), null);
});

test("parseQuantity ignora 'grande' aunque empiece por gr", () => {
  assert.strictEqual(M.parseQuantity("agua mineral grande bronchales"), null);
});

// --- tamaño derivado del precio ---

test("productSize saca el tamaño de price_eur / price_per_unit_eur", () => {
  const row = product({ name: "Agua mineral grande Font Vella", price_eur: 0.77, price_per_unit_eur: 0.51, measure_unit: "l" });
  const size = M.productSize(row, M.normalizeName(row.name));
  assert.strictEqual(size.unit, "l");
  assert.ok(Math.abs(size.value - 1.51) < 0.01, `esperaba ~1.51, dio ${size.value}`);
});

test("productSize deduce la unidad del nombre cuando falta measure_unit", () => {
  // Todas las filas de carrefour vienen sin measure_unit.
  const row = product({ name: "Pizza carbonara Campofrío 360 g.", price_eur: 3.15, price_per_unit_eur: 8.75 });
  const size = M.productSize(row, M.normalizeName(row.name));
  assert.strictEqual(size.unit, "kg");
  assert.ok(Math.abs(size.value - 0.36) < 0.01);
});

test("productSize distingue el pack del envase suelto con el mismo nombre", () => {
  const suelta = product({ name: "Agua mineral grande Font Vella", price_eur: 0.77, price_per_unit_eur: 0.51, measure_unit: "l" });
  const pack = product({ name: "Agua mineral grande Font Vella", price_eur: 4.44, price_per_unit_eur: 0.49, measure_unit: "l" });
  const a = M.productSize(suelta, M.normalizeName(suelta.name)).value;
  const b = M.productSize(pack, M.normalizeName(pack.name)).value;
  assert.ok(b > a * 5, `el pack (${b}) debería ser mucho mayor que la unidad (${a})`);
});

test("productSize cae al nombre si no hay precio por unidad", () => {
  const row = product({ name: "Agua mineral Bezoya 1 l.", price_eur: 0.72 });
  assert.strictEqual(M.productSize(row, M.normalizeName(row.name)).value, 1);
});

// --- escenario real: el cruce carrefour <-> mercadona ---

const CARREFOUR = [
  product({ id: 19, name: "Agua mineral Font Vella 1,5 l.", price_eur: 0.77, price_per_unit_eur: 0.51 }),
  product({ id: 1, name: "Cerveza Mahou clásica lata 50 cl.", price_eur: 1.1, price_per_unit_eur: 2.2 }),
  product({ id: 7, name: "Pizza carbonara Pizza & Salsa Campofrío 360 g.", price_eur: 3.15, price_per_unit_eur: 8.75 }),
  product({ id: 27, name: "Agua mineral con gas Carrefour Classic 50 cl.", price_eur: 0.26, price_per_unit_eur: 0.52 }),
];

// El catálogo de prueba tiene que ser variado a propósito: el peso de cada token
// se calcula por IDF sobre estos mismos candidatos, así que hacen falta varias
// aguas para que "agua mineral" quede como genérico y la marca sea lo que manda.
// Con cuatro filas el IDF no puede distinguir genérico de discriminante.
const MERCADONA = [
  product({ id: 202, supermercado: "mercadona", name: "Agua mineral grande Font Vella", price_eur: 0.77, price_per_unit_eur: 0.51, measure_unit: "l", category: "Agua" }),
  product({ id: 201, supermercado: "mercadona", name: "Agua mineral grande Font Vella", price_eur: 4.44, price_per_unit_eur: 0.49, measure_unit: "l", category: "Agua" }),
  product({ id: 180, supermercado: "mercadona", name: "Agua mineral grande Bronchales", price_eur: 0.39, price_per_unit_eur: 0.26, measure_unit: "l", category: "Agua" }),
  product({ id: 182, supermercado: "mercadona", name: "Agua mineral mediana Bronchales", price_eur: 0.5, price_per_unit_eur: 0.5, measure_unit: "l", category: "Agua" }),
  product({ id: 190, supermercado: "mercadona", name: "Agua mineral grande Cortes", price_eur: 0.27, price_per_unit_eur: 0.18, measure_unit: "l", category: "Agua" }),
  product({ id: 198, supermercado: "mercadona", name: "Agua mineral grande Bezoya", price_eur: 0.75, price_per_unit_eur: 0.5, measure_unit: "l", category: "Agua" }),
  product({ id: 200, supermercado: "mercadona", name: "Agua mineral grande Nestlé Aquarel", price_eur: 0.64, price_per_unit_eur: 0.43, measure_unit: "l", category: "Agua" }),
  product({ id: 204, supermercado: "mercadona", name: "Agua mineral grande Solán de Cabras", price_eur: 0.89, price_per_unit_eur: 0.59, measure_unit: "l", category: "Agua" }),
  product({ id: 206, supermercado: "mercadona", name: "Agua mineral grande Lanjarón", price_eur: 0.75, price_per_unit_eur: 0.5, measure_unit: "l", category: "Agua" }),
  product({ id: 846, supermercado: "mercadona", name: "Cerveza clásica Mahou", price_eur: 0.75, price_per_unit_eur: 2.27, measure_unit: "l", category: "Cerveza" }),
  product({ id: 845, supermercado: "mercadona", name: "Cerveza clásica Mahou", price_eur: 6.96, price_per_unit_eur: 1.76, measure_unit: "l", category: "Cerveza" }),
  product({ id: 999, supermercado: "mercadona", name: "Salsa carbonara Hacendado", price_eur: 1.4, price_per_unit_eur: 4.0, measure_unit: "kg", category: "Otras salsas" }),
  product({ id: 998, supermercado: "mercadona", name: "Pizza carbonara Hacendado", price_eur: 2.9, price_per_unit_eur: 6.74, measure_unit: "kg", category: "Pizzas" }),
  product({ id: 212, supermercado: "mercadona", name: "Agua mineral con gas pequeña Cortes", price_eur: 0.26, price_per_unit_eur: 0.52, measure_unit: "l", category: "Agua" }),
];

const index = M.buildIndex(MERCADONA);
const byId = (id) => CARREFOUR.concat(MERCADONA).find((p) => p.id === id);
const match = (id, opts) => M.findBestMatch(M.prepare(byId(id)), index, opts);

test("elige el mismo agua del mismo formato entre cadenas distintas", () => {
  const res = match(19);
  assert.strictEqual(res.match.id, 202, `casó con ${res.match && res.match.name}`);
  assert.ok(res.confidence > 0.9, `confianza baja: ${res.confidence}`);
});

test("el tamaño desempata entre la botella suelta y el pack homónimo", () => {
  // 201 y 202 tienen nombre idéntico; sólo el tamaño los separa.
  assert.strictEqual(match(19).match.id, 202);
});

test("no confunde dos marcas de agua distintas", () => {
  const bronchales = M.prepare(byId(180));
  const fontVella = M.prepare(byId(19));
  const score = M.scorePair(fontVella, bronchales, index.idf);
  assert.ok(score.confidence < M.DEFAULT_THRESHOLD, `Font Vella casó con Bronchales: ${score.confidence}`);
});

test("una pizza no casa con un bote de salsa del mismo sabor", () => {
  const res = match(7);
  assert.strictEqual(res.match.id, 998, `casó con ${res.match && res.match.name}`);
});

test("un litro nunca casa con un kilo", () => {
  const cerveza = M.prepare(byId(1));
  const salsa = M.prepare(MERCADONA.find((p) => p.id === 999));
  assert.strictEqual(M.scorePair(cerveza, salsa, index.idf).confidence, 0);
});

test("con gas y sin gas no son el mismo agua", () => {
  const conGas = M.prepare(byId(27));
  const sinGas = M.prepare(byId(180));
  const score = M.scorePair(conGas, sinGas, index.idf);
  assert.ok(score.confidence < M.DEFAULT_THRESHOLD, `casaron: ${score.confidence}`);
});

test("la marca blanca de cada cadena se ignora al comparar", () => {
  // "Carrefour Classic" contra "Cortes": el agua con gas de 50 cl de cada cadena.
  assert.strictEqual(match(27).match.id, 212);
});

test("descarta el pack de 12 latas frente a la lata suelta", () => {
  // Desde mercadona: el pack de 3.95 l no es equivalente a una lata de 50 cl.
  const carrefourIndex = M.buildIndex(CARREFOUR);
  const pack = M.findBestMatch(M.prepare(byId(845)), carrefourIndex);
  const lata = M.findBestMatch(M.prepare(byId(846)), carrefourIndex);
  assert.strictEqual(pack.match, null, `el pack casó con ${pack.match && pack.match.name}`);
  assert.ok(lata.match && lata.match.id === 1, "la lata suelta sí debería casar");
});

test("el ean13 compartido gana por identidad, no por parecido", () => {
  const conEan = product({ id: 50, name: "Nombre totalmente distinto", ean13: "8410320133692", price_eur: 3.15, price_per_unit_eur: 8.75 });
  const target = product({ id: 51, supermercado: "mercadona", name: "Otro nombre cualquiera", ean13: "8410320133692", price_eur: 2.75, price_per_unit_eur: 6.98, measure_unit: "kg" });
  const res = M.findBestMatch(M.prepare(conEan), M.buildIndex([target]));
  assert.strictEqual(res.confidence, 1);
  assert.strictEqual(res.method, "ean13");
});

test("devuelve null en vez de forzar un match malo", () => {
  const raro = product({ id: 60, name: "Detergente lavavajillas cápsulas 40 ud" , price_eur: 8.5, price_per_unit_eur: 0.21, measure_unit: "ud" });
  assert.strictEqual(M.findBestMatch(M.prepare(raro), index).match, null);
});

test("el umbral es configurable y sube la exigencia", () => {
  assert.ok(match(1, { threshold: 0 }).match, "con umbral 0 debería casar algo");
  assert.strictEqual(match(1, { threshold: 0.99 }).match, null);
});

test("la confianza que se devuelve siempre está entre 0 y 1", () => {
  for (const p of CARREFOUR) {
    const { confidence } = M.findBestMatch(M.prepare(p), index, { threshold: 0 });
    assert.ok(confidence >= 0 && confidence <= 1, `fuera de rango: ${confidence}`);
  }
});

test("nameSimilarity es simétrica", () => {
  const a = M.prepare(byId(19));
  const b = M.prepare(byId(180));
  const ab = M.nameSimilarity(a.tokens, b.tokens, index.idf);
  const ba = M.nameSimilarity(b.tokens, a.tokens, index.idf);
  assert.ok(Math.abs(ab - ba) < 1e-9);
});

test("los trigramas toleran plurales y variantes", () => {
  assert.ok(M.diceCoefficient("chocolate", "chocolates") > 0.8);
  assert.ok(M.diceCoefficient("mediana", "mediano") > 0.6);
  assert.ok(M.diceCoefficient("agua", "vino") < 0.3);
});

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
