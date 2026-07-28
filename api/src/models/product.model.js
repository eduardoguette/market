const db = require("../config/db");

function buildWhere({ supermercado, category, ean13, q }) {
  const clauses = [];
  const params = [];

  if (supermercado) {
    clauses.push("supermercado = ?");
    params.push(supermercado);
  }
  if (category) {
    clauses.push("category = ?");
    params.push(category);
  }
  if (ean13) {
    clauses.push("ean13 = ?");
    params.push(ean13);
  }
  if (q) {
    clauses.push("name LIKE ?");
    params.push(`%${q}%`);
  }

  return {
    clause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function findAll(filters, { limit, offset }) {
  const { clause, params } = buildWhere(filters);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM products ${clause}`).get(...params).n;
  const items = db
    .prepare(`SELECT * FROM products ${clause} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return { total, items };
}

function countBySupermercado() {
  return db
    .prepare("SELECT supermercado, COUNT(*) AS total FROM products GROUP BY supermercado")
    .all();
}

function insertMany(rows) {
  const stmt = db.prepare(`
    INSERT INTO products
      (supermercado, ean13, name, brand, price_eur, price_per_unit_eur, measure_unit, image, url, category)
    VALUES (@supermercado, @ean13, @name, @brand, @price_eur, @price_per_unit_eur, @measure_unit, @image, @url, @category)
  `);
  const insertAll = db.transaction((items) => {
    for (const item of items) stmt.run(item);
  });
  insertAll(rows);
}

module.exports = { findAll, countBySupermercado, insertMany };
