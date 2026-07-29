// Carga un .jsonl de un scraper a la tabla products.
//
// Uso:
//   node src/scripts/ingest.js --file=mercadona_products.jsonl --supermercado=mercadona --replace
//
// --replace borra el catálogo previo de esa cadena antes de insertar, todo en
// una transacción. Es lo que se quiere casi siempre: los scrapers no producen
// diffs, cada corrida trae el catálogo completo con los precios del día, así
// que sin --replace la segunda pasada duplica la cadena entera.

const fs = require("fs");
const readline = require("readline");
const productModel = require("../models/product.model");
const categorias = require("../lib/categories");

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value === undefined ? true : value;
  });
  return args;
}

// Algunas fuentes rellenan los campos vacíos con espacios en vez de null (BM
// manda ~50 espacios cuando el producto no tiene marca). Sin esto la columna
// queda con basura que no es null ni un valor útil.
function text(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function num(value) {
  return value === null || value === undefined ? null : value;
}

// Los scrapers emiten `category_path` como array de raíz a hoja. Array y no string
// con separador porque los nombres de categoría de lidl llevan "/" dentro.
function derivaCategoria(p) {
  const path = Array.isArray(p.category_path) ? p.category_path : null;
  const producto = { supermercado: p.supermercado, category: p.category, category_path: path };
  const { canonical, aisle, source } = categorias.resolve(producto);
  return {
    category_path: categorias.pathToString(path),
    aisle: aisle || null,
    // Sólo se guarda el cajón cuando es uno de verdad: FUERA_DE_ALCANCE y
    // NO_FIABLE son estados intermedios de la resolución, no categorías.
    canonical_category: categorias.esCanonica(canonical) ? canonical : null,
    category_source: categorias.esCanonica(canonical) ? source : null,
  };
}

async function main() {
  const { file, supermercado, replace } = parseArgs();
  if (!file || !supermercado) {
    console.error(
      "uso: node src/scripts/ingest.js --file=<path> --supermercado=<nombre> [--replace]"
    );
    process.exit(1);
  }

  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  const rows = [];
  let skipped = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);

    // Un producto sin nombre no es consultable ni comparable; y sin precio no
    // sirve para el presupuesto, que es el objetivo de la app.
    const name = text(p.name);
    if (!name || p.price_eur === null || p.price_eur === undefined) {
      skipped += 1;
      continue;
    }

    rows.push({
      supermercado,
      ean13: text(p.ean13),
      name,
      brand: text(p.brand),
      price_eur: num(p.price_eur),
      price_per_unit_eur: num(p.price_per_unit_eur),
      measure_unit: text(p.measure_unit),
      image: text(p.image),
      url: text(p.url),
      category: text(p.category),
      ...derivaCategoria(p),
      is_offer: p.is_offer ? 1 : 0,
      price_before: num(p.price_before),
      is_new: p.is_new ? 1 : 0,
    });
  }

  if (replace) {
    const { deleted, inserted } = productModel.replaceSupermercado(supermercado, rows);
    console.log(`${supermercado}: ${deleted} borradas, ${inserted} insertadas`);
  } else {
    productModel.insertMany(rows);
    console.log(`${supermercado}: ${rows.length} insertadas (append)`);
  }

  if (skipped) console.log(`  (${skipped} descartadas por falta de nombre o precio)`);
}

main();
