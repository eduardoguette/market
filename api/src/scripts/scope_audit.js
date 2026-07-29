// Busca huecos en la lista negra de forma sistemática, en vez de esperar a que
// alguien audite a mano y encuentre otro.
//
// El fallo que se repite siempre es el mismo: una lista de términos incompleta.
// Pasó con los plurales ("toallitas" no matcheaba "toallita"), con los sinónimos
// ("tealight" no lleva la palabra vela) y con las familias ("pila" sin
// "bombilla"). No se arregla añadiendo términos de uno en uno, se arregla
// teniendo una forma de detectar que faltan.
//
// Tres detectores, del más fuerte al más débil:
//
//   1. cruce con cadenas limpias: si una palabra aparece en el catálogo de una
//      cadena cuya categoría es fiable y de alcance, esa palabra nombra algo que
//      los supermercados venden. Si además aparece en la lista de borrado, hay
//      contradicción. Es el que habría cazado "vela" y "pila" solos.
//   2. cruce con nombres de categoría: si una palabra da nombre a un pasillo de
//      una cadena limpia, es un tipo de producto de supermercado. Habría cazado
//      "bombilla" (ahorramás tiene "Bombillas e iluminación").
//   3. inventario de sustantivos: agrupa la lista de borrado por sustantivo
//      inicial, para revisar ~200 grupos en vez de 4.000 nombres.
//
// Uso: node src/scripts/scope_audit.js --candidatos=<json> --conteos=<json>
//      [--limpias=mercadona,dia,aldi] [--out=<dir>]

const fs = require("fs");
const path = require("path");
const { normalizeName, STOPWORDS } = require("../lib/matching");
const scope = require("../lib/scope");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function tokens(texto) {
  return normalizeName(texto)
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function palabras(texto) {
  return new Set(tokens(texto));
}

// Del vocabulario de referencia sólo interesa el sustantivo que abre el nombre:
// es el que dice QUÉ ES el producto. Si se toman todas las palabras, el ranking
// se llena de colores y materiales ("color", "acero", "blanco") que aparecen en
// cualquier catálogo y no significan nada.
const ARRANQUES = new Set(["pack", "lote", "surtido", "caja", "bolsa", "bote", "estuche", "set", "juego", "kit", "otros", "otras", "resto"]);

function cabeza(texto) {
  const lista = tokens(texto);
  return lista.find((t) => !ARRANQUES.has(t)) || null;
}

// Igualdad tolerante al singular/plural, que es el otro agujero recurrente.
function raiz(palabra) {
  return palabra.endsWith("es") ? palabra.slice(0, -2) : palabra.endsWith("s") ? palabra.slice(0, -1) : palabra;
}

function main() {
  const args = parseArgs();
  const outDir = args.out || ".";
  const candidatos = JSON.parse(fs.readFileSync(args.candidatos, "utf8"));

  // --- vocabulario de referencia -----------------------------------------
  // Las cadenas cuya categoría es fiable: lo que venden es, por definición, de
  // supermercado. Su vocabulario es la vara de medir.
  const limpias = new Set(
    (args.limpias || "mercadona,dia,aldi,lasirena,bm,ahorramas").split(",").map((s) => s.trim())
  );

  const vocabLimpio = new Map(); // palabra -> {n, ejemplo}
  const anotar = (mapa, palabra, ejemplo) => {
    const previo = mapa.get(palabra);
    if (previo) previo.n++;
    else mapa.set(palabra, { n: 1, ejemplo });
  };

  if (args.catalogo) {
    // Nombres de producto de las cadenas limpias, si se pasan.
    for (const row of JSON.parse(fs.readFileSync(args.catalogo, "utf8"))) {
      if (!limpias.has(String(row.supermercado).toLowerCase())) continue;
      // categoriaNoFiable ya cubre las filas sin categoría, que no son evidencia
      // de nada: es justo donde las cadenas limpias esconden su bazar.
      if (scope.categoriaNoFiable(row.supermercado, row.category)) continue;
      if (scope.categoriaFueraDeAlcance(row.supermercado, row.category)) continue;
      const h = cabeza(row.name);
      if (h) anotar(vocabLimpio, raiz(h), row.name);
    }
  }

  const vocabCategorias = new Map();
  if (args.conteos) {
    for (const row of JSON.parse(fs.readFileSync(args.conteos, "utf8"))) {
      if (!limpias.has(String(row.supermercado).toLowerCase())) continue;
      if (!row.category) continue;
      if (scope.categoriaFueraDeAlcance(row.supermercado, row.category)) continue;
      const h = cabeza(row.category);
      if (h) anotar(vocabCategorias, raiz(h), `${row.supermercado}: ${row.category}`);
    }
  }

  // --- detectores ---------------------------------------------------------
  const sospechas = new Map(); // palabra -> {enBorrado, detector, evidencia, ejemplos}

  for (const producto of candidatos) {
    // Cabeza contra cabeza: la pregunta es si el TIPO de producto que se borra es
    // un tipo que las cadenas limpias venden. Cruzar todas las palabras mete
    // ruido de colores y materiales, que aparecen en cualquier catálogo.
    const cab = cabeza(producto.name);
    for (const palabra of cab ? [cab] : []) {
      const r = raiz(palabra);
      let detector = null;
      let evidencia = null;
      if (vocabCategorias.has(r)) {
        detector = "es el nombre de un pasillo de una cadena limpia";
        evidencia = vocabCategorias.get(r).ejemplo;
      } else if (vocabLimpio.has(r)) {
        const { n, ejemplo } = vocabLimpio.get(r);
        detector = `es el tipo de ${n} producto(s) de cadenas limpias`;
        evidencia = ejemplo;
      }
      if (!detector) continue;

      const entrada = sospechas.get(palabra) || { enBorrado: 0, detector, evidencia, ejemplos: [] };
      entrada.enBorrado++;
      if (entrada.ejemplos.length < 3) entrada.ejemplos.push(producto.name);
      sospechas.set(palabra, entrada);
    }
  }

  const ranking = [...sospechas.entries()]
    .map(([palabra, v]) => ({ palabra, ...v }))
    .sort((a, b) => b.enBorrado - a.enBorrado);

  // --- inventario de sustantivos iniciales -------------------------------
  const porCabeza = new Map();
  for (const producto of candidatos) {
    const tokens = normalizeName(producto.name)
      .split(" ")
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);
    const cabeza = tokens.find((t) => !/^\d+$/.test(t) && t.length > 2) || "(sin nombre)";
    const entrada = porCabeza.get(cabeza) || { n: 0, ejemplos: [] };
    entrada.n++;
    if (entrada.ejemplos.length < 2) entrada.ejemplos.push(producto.name);
    porCabeza.set(cabeza, entrada);
  }
  const inventario = [...porCabeza.entries()]
    .map(([cabeza, v]) => ({ cabeza, ...v }))
    .sort((a, b) => b.n - a.n);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "auditoria_sospechas.json"), JSON.stringify(ranking, null, 2));
  fs.writeFileSync(path.join(outDir, "auditoria_inventario.json"), JSON.stringify(inventario, null, 2));

  console.log(`candidatos analizados: ${candidatos.length}`);
  console.log(`vocabulario de cadenas limpias: ${vocabLimpio.size} palabras de producto, ${vocabCategorias.size} de pasillo`);
  console.log(`\n=== palabras sospechosas en la lista de borrado (${ranking.length}) ===`);
  for (const s of ranking.slice(0, 40)) {
    console.log(`  ${String(s.enBorrado).padStart(4)}  ${s.palabra.padEnd(18)} ${s.detector}`);
    console.log(`        evidencia: ${s.evidencia}`);
    console.log(`        en borrado: ${s.ejemplos[0].slice(0, 72)}`);
  }
  console.log(`\n=== inventario: ${inventario.length} sustantivos distintos en la lista ===`);
  console.log("  (revisar esto es ver 200 grupos en vez de 4.000 nombres)");
  for (const i of inventario.slice(0, 25)) {
    console.log(`  ${String(i.n).padStart(4)}  ${i.cabeza.padEnd(18)} ${i.ejemplos[0].slice(0, 60)}`);
  }
}

main();
