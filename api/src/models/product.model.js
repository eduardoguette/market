const db = require("../config/db");

function buildWhere({ supermercado, category, ean13, q, is_offer, is_new }) {
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
  // Llegan ya normalizados a 0/1 desde el controller; undefined = sin filtrar.
  if (is_offer !== undefined) {
    clauses.push("is_offer = ?");
    params.push(is_offer);
  }
  if (is_new !== undefined) {
    clauses.push("is_new = ?");
    params.push(is_new);
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

function findByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
}

// Catálogo completo de una cadena, para armar el índice de matching. Sin LIMIT a
// propósito: el motor necesita ver todos los candidatos.
function findAllBySupermercado(supermercado) {
  return db.prepare("SELECT * FROM products WHERE supermercado = ?").all(supermercado);
}

function insertMany(rows) {
  const stmt = db.prepare(`
    INSERT INTO products
      (supermercado, ean13, name, brand, price_eur, price_per_unit_eur, measure_unit, image, url, category,
       is_offer, price_before, is_new)
    VALUES (@supermercado, @ean13, @name, @brand, @price_eur, @price_per_unit_eur, @measure_unit, @image, @url, @category,
       @is_offer, @price_before, @is_new)
  `);
  const insertAll = db.transaction((items) => {
    for (const item of items) stmt.run(item);
  });
  insertAll(rows);
}

module.exports = {
  findAll,
  findByIds,
  findAllBySupermercado,
  countBySupermercado,
  insertMany,
};
