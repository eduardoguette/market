// Genera la lista auditable de candidatos a excluir del catálogo. NO BORRA NADA:
// sólo escribe ficheros para que una persona los revise y decida.
//
// Uso:
//   node src/scripts/scope_report.js --out=/ruta/salida
//   node src/scripts/scope_report.js --input=productos.json --out=/ruta/salida
//
// Sin --input lee de la base (MARKET_DB_PATH). Con --input lee un JSON con un
// array de productos, para poder trabajar sobre un volcado sin tocar producción.
//
// Salidas:
//   candidatos_bazar.csv/json   -> bazar identificado, con la razón concreta
//   dudosos.csv/json            -> ambiguos, los decide una persona (NO borrar)
//   reglas_por_categoria.csv    -> las categorías enteras fuera de alcance
//   resumen.json                -> los números para el informe

const fs = require("fs");
const path = require("path");
const scope = require("../lib/scope");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function toCsv(rows, columns) {
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => escape(r[c])).join(","))].join("\n");
}

function main() {
  const args = parseArgs();
  const outDir = args.out || ".";
  fs.mkdirSync(outDir, { recursive: true });

  let products;
  if (args.input) {
    products = JSON.parse(fs.readFileSync(args.input, "utf8"));
  } else {
    const db = require("../config/db");
    products = db
      .prepare("SELECT id, supermercado, category, name, price_eur, measure_unit FROM products")
      .all();
  }

  const bazar = [];
  const dudosos = [];
  let mantenidos = 0;
  const porVia = { categoria: 0, nombre: 0 };
  const porFamilia = {};
  const porRegla = {};

  for (const product of products) {
    const veredicto = scope.decide(product);
    const fila = {
      id: product.id,
      supermercado: product.supermercado,
      name: product.name,
      category: product.category,
      price_eur: product.price_eur,
      measure_unit: product.measure_unit,
      razon: veredicto.motivo,
      familia: veredicto.familia,
      via: veredicto.via,
    };

    if (veredicto.decision === scope.DESCARTAR) {
      bazar.push(fila);
      porVia[veredicto.via] = (porVia[veredicto.via] || 0) + 1;
      porFamilia[veredicto.familia] = (porFamilia[veredicto.familia] || 0) + 1;
      const regla = String(veredicto.motivo || "").split(":")[0];
      porRegla[regla] = (porRegla[regla] || 0) + 1;
    } else if (veredicto.decision === scope.DUDOSO) {
      dudosos.push(fila);
    } else {
      mantenidos++;
    }
  }

  // Las categorías enteras se auditan como reglas, no producto a producto: son
  // diez líneas en vez de miles de nombres, y la decisión es la misma para todas.
  const reglas = [];
  for (const [cadena, categorias] of Object.entries(scope.CATEGORIAS_FUERA_DE_ALCANCE)) {
    for (const categoria of categorias) {
      const afectados = bazar.filter(
        (r) => String(r.supermercado).toLowerCase() === cadena && r.category === categoria
      ).length;
      reglas.push({ supermercado: cadena, categoria, tipo: "categoría completa", productos: afectados });
    }
  }

  const columnas = ["id", "supermercado", "name", "category", "price_eur", "measure_unit", "razon", "familia", "via"];
  const escribir = (nombre, contenido) => {
    fs.writeFileSync(path.join(outDir, nombre), contenido);
    return path.join(outDir, nombre);
  };

  escribir("candidatos_bazar.json", JSON.stringify(bazar, null, 2));
  escribir("candidatos_bazar.csv", toCsv(bazar, columnas));
  escribir("dudosos.json", JSON.stringify(dudosos, null, 2));
  escribir("dudosos.csv", toCsv(dudosos, columnas));
  escribir("reglas_por_categoria.csv", toCsv(reglas, ["supermercado", "categoria", "tipo", "productos"]));

  const resumen = {
    total_analizado: products.length,
    a_borrar_bazar_identificado: bazar.length,
    dudosos_no_borrar: dudosos.length,
    se_mantienen: mantenidos,
    por_via: porVia,
    por_familia: porFamilia,
    por_regla: porRegla,
  };
  escribir("resumen.json", JSON.stringify(resumen, null, 2));

  console.log(`analizados ${products.length}`);
  console.log(`  bazar identificado (candidatos a borrar): ${bazar.length}`);
  console.log(`  dudosos (NO borrar, decide una persona):  ${dudosos.length}`);
  console.log(`  se mantienen:                             ${mantenidos}`);
  console.log(`  ficheros en ${path.resolve(outDir)}`);
}

main();
