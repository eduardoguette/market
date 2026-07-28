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

// Índice sobre la expresión del tamaño derivado, para las búsquedas por formato
// ("agua 50cl"). Sin él, filtrar por tamaño obliga a recorrer la tabla entera
// porque el valor no está en ninguna columna. Parcial, porque las filas sin
// precio por unidad no tienen tamaño calculable y no hacen falta en el índice.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_size
    ON products(price_eur / price_per_unit_eur) WHERE price_per_unit_eur > 0;
`);

// Índice de texto para la búsqueda por nombre. Un LIKE '%token%' no puede usar
// índice (comodín a la izquierda), así que escanea la tabla entera por cada
// token; con el catálogo creciendo eso no aguanta. FTS5 es índice invertido, y
// `remove_diacritics 2` resuelve además que "higienico" encuentre "higiénico"
// (LIKE sólo ignora mayúsculas en ASCII).
//
// content='products' lo deja como índice externo: no duplica los nombres, los lee
// de products, así que la tabla sigue siendo la única fuente de verdad. Los
// triggers lo mantienen sincronizado con cualquier INSERT/UPDATE/DELETE.
const hadFts = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'products_fts'")
  .get();

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
    name,
    content='products',
    content_rowid='id',
    tokenize="unicode61 remove_diacritics 2"
  );

  CREATE TRIGGER IF NOT EXISTS products_fts_insert AFTER INSERT ON products BEGIN
    INSERT INTO products_fts(rowid, name) VALUES (new.id, new.name);
  END;
  CREATE TRIGGER IF NOT EXISTS products_fts_delete AFTER DELETE ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, name) VALUES ('delete', old.id, old.name);
  END;
  CREATE TRIGGER IF NOT EXISTS products_fts_update AFTER UPDATE ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, name) VALUES ('delete', old.id, old.name);
    INSERT INTO products_fts(rowid, name) VALUES (new.id, new.name);
  END;
`);

// La tabla virtual nace vacía, así que sobre una base ya poblada hay que indexar
// lo que ya está. Se hace sólo la primera vez: después los triggers alcanzan.
if (!hadFts) {
  db.exec("INSERT INTO products_fts(products_fts) VALUES ('rebuild')");
}

module.exports = db;
