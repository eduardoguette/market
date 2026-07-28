const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.MARKET_DB_PATH || path.join(__dirname, "../../data/market.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supermercado TEXT NOT NULL,
    ean13 TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    price_eur REAL,
    price_per_unit_eur REAL,
    measure_unit TEXT,
    image TEXT,
    url TEXT,
    category TEXT,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_products_supermercado ON products(supermercado);
  CREATE INDEX IF NOT EXISTS idx_products_ean13 ON products(ean13);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
`);

// El CREATE TABLE IF NOT EXISTS de arriba no toca una tabla que ya existe, así
// que sobre una base ya creada (producción) las columnas nuevas nunca llegarían.
// Se añaden de a una, sólo las que falten, sin recrear la tabla ni reescribir las
// filas que ya están. Idempotente: en el segundo arranque no hay nada que hacer.
const ADDED_COLUMNS = [
  ["is_offer", "INTEGER NOT NULL DEFAULT 0"],
  ["price_before", "REAL"],
  ["is_new", "INTEGER NOT NULL DEFAULT 0"],
];

const existingColumns = new Set(
  db.prepare("PRAGMA table_info(products)").all().map((column) => column.name)
);
for (const [name, definition] of ADDED_COLUMNS) {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE products ADD COLUMN ${name} ${definition}`);
  }
}

// Índices parciales: las ofertas y las novedades son siempre una minoría del
// catálogo, así que indexar sólo esas filas sale mucho más chico que un índice
// sobre la columna entera, y cubre justo lo que filtra el listado.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_offer
    ON products(supermercado) WHERE is_offer = 1;
  CREATE INDEX IF NOT EXISTS idx_products_new
    ON products(supermercado) WHERE is_new = 1;
`);

module.exports = db;
