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
  // Taxonomía canónica. `category` se queda como está (la etiqueta cruda de la
  // cadena) para no romper `?category=` ni /pasillos durante la transición.
  ["category_path", "TEXT"], // ruta completa "Despensa > Aceites > Aceite de oliva"
  ["aisle", "TEXT"], // la hoja: el pasillo
  ["canonical_category", "TEXT"], // el cajón común entre cadenas
  ["category_source", "TEXT"], // path | category | keyword | name: de dónde salió
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

// Índices para ordenar por precio. Sin ellos, un `sort=price_asc` sin filtro es
// un sort en memoria de la tabla entera (medido: 12 ms con 66k filas, y crece
// lineal). Con el índice sqlite recorre en orden y corta en el LIMIT, sin sort.
//
// No hace falta meter `id` en el índice aunque el ORDER BY lo use para desempatar:
// en sqlite el rowid ya es la última columna implícita de todo índice, y `id` es
// alias del rowid.
//
// Los compuestos con supermercado son para "los más baratos de esta cadena", que
// es la combinación que más se va a pedir: filtrando por mercadona (13.7k filas)
// el orden por precio pasa de un sort de 10-28 ms a un recorrido de índice de
// 0,5 ms, porque el índice ya viene ordenado por precio dentro de cada cadena.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_price
    ON products(price_eur);
  CREATE INDEX IF NOT EXISTS idx_products_unit_price
    ON products(price_per_unit_eur);
  CREATE INDEX IF NOT EXISTS idx_products_super_price
    ON products(supermercado, price_eur);
  CREATE INDEX IF NOT EXISTS idx_products_super_unit_price
    ON products(supermercado, price_per_unit_eur);
`);

// Para listar los pasillos de una cadena (GET /pasillos), que es un
// GROUP BY category dentro de un supermercado. Con este índice la consulta sale
// por covering index y desaparece el temp B-tree del GROUP BY: sobre las 36.583
// filas de alcampo baja de 12,7 ms a 4 ms, y es la pantalla que se abre al
// filtrar por cadena, así que se pide a menudo.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_super_category
    ON products(supermercado, category);
`);

// Para navegar por la taxonomía canónica. Dos compuestos cubren las siete
// consultas de /categorias y /pasillos por covering index, medido: con ellos las
// agregaciones bajan de 18-101 ms a 0,4-4 ms sobre 100k filas.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_canonica_super_aisle
    ON products(canonical_category, supermercado, aisle);
  CREATE INDEX IF NOT EXISTS idx_products_super_canonica_aisle
    ON products(supermercado, canonical_category, aisle);
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
