// Carga un .jsonl de un scraper (ej carrefour_crawl.py) a la tabla products.
// Uso: node src/scripts/ingest.js --file carrefour_products.jsonl --supermercado carrefour

const fs = require("fs");
const readline = require("readline");
const productModel = require("../models/product.model");

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value;
  });
  return args;
}

async function main() {
  const { file, supermercado } = parseArgs();
  if (!file || !supermercado) {
    console.error("uso: node src/scripts/ingest.js --file=<path> --supermercado=<nombre>");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  const rows = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    rows.push({
      supermercado,
      ean13: p.ean13 ?? null,
      name: p.name,
      brand: p.brand ?? null,
      price_eur: p.price_eur ?? null,
      price_per_unit_eur: p.price_per_unit_eur ?? null,
      measure_unit: p.measure_unit ?? null,
      image: p.image ?? null,
      url: p.url ?? null,
      category: p.category ?? null,
      is_offer: p.is_offer ? 1 : 0,
      price_before: p.price_before ?? null,
      is_new: p.is_new ? 1 : 0,
    });
  }

  productModel.insertMany(rows);
  console.log(`${rows.length} productos insertados (${supermercado})`);
}

main();
