const db = require("../config/db");
const { parseSearchQuery, ftsExpression, sizeBand } = require("../lib/search");
const { productSize, normalizeName, unitAliases } = require("../lib/matching");

const FTS_JOIN = "JOIN products_fts ON products_fts.rowid = p.id";

// Criterios de ordenación admitidos. `relevance` no tiene expresión porque
// depende de si hay búsqueda: con `q` es el bm25 del índice y sin `q` no hay
// relevancia que medir, así que queda el orden por id.
//
// NULLS LAST en todos: sqlite pone los NULL primero por defecto, o sea que "los
// más baratos" abriría con los productos sin precio. Y no es un caso raro,
// price_per_unit_eur falta en el 33% de lidl y el 10% de aldi.
const SORTS = {
  relevance: null,
  price_asc: "p.price_eur ASC NULLS LAST",
  price_desc: "p.price_eur DESC NULLS LAST",
  unit_price_asc: "p.price_per_unit_eur ASC NULLS LAST",
  unit_price_desc: "p.price_per_unit_eur DESC NULLS LAST",
};

// Los precios empatan muchísimo (hay 254 productos a 1,55 €), así que sin un
// desempate determinista dos páginas seguidas pueden repetir o saltear filas:
// el orden entre empatados no está definido y sqlite no garantiza reproducirlo
// entre dos consultas distintas. El id ordena lo que el criterio deja empatado.
function orderClause(sort, { relevance }) {
  const expression = sort ? SORTS[sort] : null;
  if (expression) return `${expression}, p.id`;
  return relevance ? "bm25(products_fts), p.id" : "p.id";
}

// Filtros que no son texto. Van con prefijo `p.` porque la búsqueda hace join
// contra el índice FTS y si no la columna quedaría ambigua.
function buildWhere({ supermercado, category, ean13, measure_unit, is_offer, is_new }) {
  const clauses = [];
  const params = [];

  if (supermercado) {
    clauses.push("p.supermercado = ?");
    params.push(supermercado);
  }
  if (category) {
    clauses.push("p.category = ?");
    params.push(category);
  }
  if (ean13) {
    clauses.push("p.ean13 = ?");
    params.push(ean13);
  }
  // Coincidencia exacta a propósito: las unidades del catálogo no son
  // convertibles entre sí, y es justo lo que hace comparable el precio por unidad.
  if (measure_unit) {
    clauses.push("p.measure_unit = ?");
    params.push(measure_unit);
  }
  // Llegan ya normalizados a 0/1 desde el controller; undefined = sin filtrar.
  if (is_offer !== undefined) {
    clauses.push("p.is_offer = ?");
    params.push(is_offer);
  }
  if (is_new !== undefined) {
    clauses.push("p.is_new = ?");
    params.push(is_new);
  }

  return { clauses, params };
}

function hasMatches(match) {
  return (
    db.prepare("SELECT 1 FROM products_fts WHERE products_fts MATCH ? LIMIT 1").get(match) !==
    undefined
  );
}

// Primero se prueba con los tokens exactos y sólo si no hay nada se abre a
// prefijo. El motivo es el ranking: bm25 premia los nombres cortos, así que
// buscando "agua" con prefijo "Aguacate" salía por encima de "Agua mineral".
// Exigir el token exacto deja fuera al aguacate, y el prefijo queda para cuando
// la palabra está a medio escribir ("choco" -> "chocolate"), donde no hay
// alternativa mejor.
//
// La decisión se toma mirando sólo el texto contra todo el catálogo, a propósito:
// si además se miraran los otros filtros, un `?q=agua&category=Fruta` se quedaría
// sin coincidencias exactas, caería a prefijo y devolvería aguacates, justo lo que
// `?q=agua` sin filtro evita. Que el mismo texto busque distinto según el filtro
// sería difícil de explicar.
function resolveMatch(search) {
  if (!search.tokens.length) return null;

  const exact = ftsExpression(search.tokens);
  return hasMatches(exact) ? exact : ftsExpression(search.tokens, { prefix: true });
}

function findAll(filters, { limit, offset, sort }) {
  const base = buildWhere(filters);
  const search = parseSearchQuery(filters.q);

  if (!search) {
    const where = base.clauses.length ? `WHERE ${base.clauses.join(" AND ")}` : "";
    const order = orderClause(sort, { relevance: false });
    const total = db.prepare(`SELECT COUNT(*) AS n FROM products p ${where}`).get(...base.params).n;
    const items = db
      .prepare(`SELECT p.* FROM products p ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...base.params, limit, offset);
    return { total, items };
  }

  const clauses = [...base.clauses];
  const params = [...base.params];
  let join = "";
  let order = orderClause(sort, { relevance: false });

  const match = resolveMatch(search);
  if (match) {
    join = FTS_JOIN;
    clauses.unshift("products_fts MATCH ?");
    params.unshift(match);
    order = orderClause(sort, { relevance: true });
  } else if (!search.size) {
    // Una query que no dejó ningún token útil ni cantidad (por ejemplo "de"):
    // se cae al LIKE de antes para no cambiarle la semántica a los casos raros.
    clauses.push("p.name LIKE ?");
    params.push(`%${search.raw}%`);
  }

  if (search.size) {
    const { min, max } = sizeBand(search.size);
    clauses.push("p.price_per_unit_eur > 0 AND p.price_eur / p.price_per_unit_eur BETWEEN ? AND ?");
    params.push(min, max);

    // La unidad se filtra acá abajo cuando la fila la declara, que es lo normal.
    // Las de carrefour vienen con measure_unit NULL y hay que deducirla del
    // nombre, así que ésas pasan y se resuelven después en JS.
    const aliases = unitAliases(search.size.unit);
    clauses.push(
      `(p.measure_unit IS NULL OR p.measure_unit IN (${aliases.map(() => "?").join(",")}))`
    );
    params.push(...aliases);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  if (!search.size) {
    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM products p ${join} ${where}`)
      .get(...params).n;
    const items = db
      .prepare(`SELECT p.* FROM products p ${join} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    return { total, items };
  }

  // Con cantidad hay un segundo filtro que SQL no puede hacer: la unidad. Las
  // filas de carrefour vienen sin measure_unit y hay que deducirla del nombre,
  // así que un "chocolate 200g" tiene que descartar acá el bote de 0,2 l que la
  // banda numérica sí dejó pasar. Se paga barato porque el texto y la banda ya
  // recortaron el candidato a unas pocas filas.
  const candidates = db
    .prepare(`SELECT p.* FROM products p ${join} ${where} ORDER BY ${order}`)
    .all(...params);
  const matched = candidates.filter(
    (row) => productSize(row, normalizeName(row.name)).unit === search.size.unit
  );

  return { total: matched.length, items: matched.slice(offset, offset + limit) };
}

function countBySupermercado(filters = {}) {
  const { clauses, params } = buildWhere(filters);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT p.supermercado, COUNT(*) AS total FROM products p ${where}
       GROUP BY p.supermercado ORDER BY total DESC, p.supermercado`
    )
    .all(...params);
}

// Los pasillos de una cadena son los valores propios de su columna `category`:
// hoy ya son la taxonomía de cada cadena, sin nada canónico por encima. Se
// ordenan por número de productos porque hay cadenas con 537 pasillos y 73 de
// ellos con un solo producto, así que alfabético dejaría lo útil abajo.
function countByAisle(filters = {}, { minTotal = 0, limit } = {}) {
  const { clauses, params } = buildWhere(filters);
  // Las filas sin categoría no son un pasillo: aldi tiene 103 así.
  clauses.push("p.category IS NOT NULL AND TRIM(p.category) != ''");

  const having = minTotal > 0 ? "HAVING COUNT(*) >= ?" : "";
  if (minTotal > 0) params.push(minTotal);

  // El desempate por nombre hace estable el orden entre pasillos con el mismo
  // número de productos, que en las cadenas granulares son muchísimos.
  const agrupado = `SELECT p.supermercado, p.category AS aisle, COUNT(*) AS total
                      FROM products p
                     WHERE ${clauses.join(" AND ")}
                     GROUP BY p.supermercado, p.category
                     ${having}`;

  // El total cuenta los pasillos que hay, no los que se devuelven: `limit` sólo
  // recorta la lista, igual que en findAll. Si contara después del recorte, quien
  // consume la API no podría saber cuántos hay ni paginar.
  const total = db.prepare(`SELECT COUNT(*) AS n FROM (${agrupado})`).get(...params).n;

  const sql = `${agrupado} ORDER BY total DESC, aisle ${limit ? "LIMIT ?" : ""}`;
  if (limit) params.push(limit);

  return { total, pasillos: db.prepare(sql).all(...params) };
}

function findById(id) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id);
}

function findByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
}

// Las unidades que hay en el catálogo, para que la app pueda ofrecer el filtro sin
// tener que adivinarlas. Hacen falta porque el precio por unidad sólo se puede
// comparar dentro de una misma unidad: €/kg contra €/lavado no dice nada.
function countByMeasureUnit(filters = {}) {
  const { clauses, params } = buildWhere(filters);
  clauses.push("p.measure_unit IS NOT NULL AND TRIM(p.measure_unit) != ''");
  return db
    .prepare(
      `SELECT p.measure_unit, COUNT(*) AS total FROM products p
        WHERE ${clauses.join(" AND ")}
        GROUP BY p.measure_unit ORDER BY total DESC, p.measure_unit`
    )
    .all(...params);
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

// Reemplaza el catálogo entero de una cadena en una sola transacción.
// Los scrapers no producen diffs: cada corrida trae el catálogo completo con
// los precios del día, así que la forma correcta de recargar es borrar lo
// viejo de esa cadena e insertar lo nuevo. Hacerlo con insertMany a secas
// duplicaría el catálogo en cada pasada.
//
// Atómico a propósito: si algún INSERT falla a mitad, el DELETE se deshace y
// la cadena queda con sus datos anteriores en lugar de vacía. Los triggers de
// FTS5 mantienen el índice al día en ambos sentidos.
function replaceSupermercado(supermercado, rows) {
  const del = db.prepare("DELETE FROM products WHERE supermercado = ?");
  const stmt = db.prepare(`
    INSERT INTO products
      (supermercado, ean13, name, brand, price_eur, price_per_unit_eur, measure_unit, image, url, category,
       is_offer, price_before, is_new)
    VALUES (@supermercado, @ean13, @name, @brand, @price_eur, @price_per_unit_eur, @measure_unit, @image, @url, @category,
       @is_offer, @price_before, @is_new)
  `);

  const run = db.transaction((items) => {
    const deleted = del.run(supermercado).changes;
    for (const item of items) stmt.run(item);
    return deleted;
  });

  return { deleted: run(rows), inserted: rows.length };
}

module.exports = {
  SORTS,
  findAll,
  countByAisle,
  countByMeasureUnit,
  findById,
  findByIds,
  findAllBySupermercado,
  countBySupermercado,
  insertMany,
  replaceSupermercado,
};
