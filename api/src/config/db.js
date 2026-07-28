const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.MARKET_DB_PATH || path.join(__dirname, "../../data/market.db");

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

module.exports = db;
