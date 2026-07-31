// Tests de la taxonomía canónica: la resolución (pura) y los endpoints.
// Uso: npm test
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB_PATH = path.join(os.tmpdir(), `market_categorias_test_${process.pid}.db`);
fs.rmSync(DB_PATH, { force: true });
process.env.MARKET_DB_PATH = DB_PATH;

const categorias = require("../src/lib/categories");
const productModel = require("../src/models/product.model");
const productController = require("../src/controllers/product.controller");

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

const resolver = (supermercado, category, category_path) =>
  categorias.resolve({ supermercado, category, category_path });

// --- las tres pasadas -----------------------------------------------------

test("la ruta gana a la etiqueta, y con el prefijo más largo", () => {
  // "Cocina y hogar" es bazar salvo su rama de limpieza: el prefijo más largo la
  // rescata sin tener que rediseñar la entrada de la raíz.
  assert.strictEqual(
    resolver("lidl", "x", ["Cocina y hogar", "Limpieza del hogar"]).canonical,
    "limpieza_drogueria"
  );
  assert.strictEqual(
    resolver("lidl", "x", ["Cocina y hogar", "Almacenamiento"]).canonical,
    categorias.FUERA_DE_ALCANCE
  );
  assert.strictEqual(resolver("lidl", "x", ["Vino, cerveza y licores"]).canonical, "bebidas_alcohol");
});

test("la etiqueta exacta resuelve las cadenas con categorías utilizables", () => {
  assert.strictEqual(resolver("dia", "Cervezas, vinos y licores").canonical, "bebidas_alcohol");
  assert.strictEqual(resolver("alcampo", "Droguería").canonical, "limpieza_drogueria");
  assert.strictEqual(resolver("mercadona", "Verdura").canonical, "frutas_verduras");
  assert.strictEqual(resolver("dia", "Cervezas, vinos y licores").source, "category");
});

test("la palabra clave cubre la cola larga de hojas", () => {
  // bm y ahorramás traen cientos de hojas: sin esto habría que escribirlas a mano.
  assert.strictEqual(resolver("bm", "Vino tinto").canonical, "bebidas_alcohol");
  assert.strictEqual(resolver("bm", "Merluza y otros pescados blancos").canonical, "pescado_marisco");
  assert.strictEqual(resolver("ahorramas", "Comida húmeda para gatos").canonical, "mascotas");
  assert.strictEqual(resolver("bm", "Vino tinto").source, "keyword");
});

test("los patrones se escriben en el alfabeto normalizado", () => {
  // Se comparan contra texto sin acentos y con la ñ convertida en n. Escribir
  // "baño" en el patrón no coincide nunca: costó 43 productos de bm.
  assert.strictEqual(resolver("bm", "Gel de baño").canonical, "higiene_personal");
  assert.strictEqual(resolver("mercadona", "Pañales").canonical, "bebe");
  assert.strictEqual(resolver("bm", "Champiñones").canonical, "frutas_verduras");
});

test("lo distintivo gana a lo genérico", () => {
  // "Chocolate con leche" es chocolate: con el orden inverso caía en lácteos.
  assert.strictEqual(resolver("bm", "Chocolate con leche").canonical, "dulces_chocolate");
  assert.strictEqual(resolver("bm", "Leche, batidos y bebidas vegetales").canonical, "lacteos_huevos");
  assert.strictEqual(resolver("mercadona", "Leche y bebidas vegetales").canonical, "lacteos_huevos");
});

test("los frutos secos son aperitivo, no fruta", () => {
  // Mismo caso que "Chocolate con leche": el `fruta` de la regla de frutas y
  // verduras se llevaba por delante "Frutos secos y fruta desecada" antes de que
  // la regla de snacks (que ya dice "fruto seco") pudiera ejecutarse. Eran 65
  // productos de mercadona -- almendra, nuez, pistacho, cacahuete, pipas,
  // palomitas -- dentro del cajón de frutas y verduras.
  assert.strictEqual(
    resolver("mercadona", "Frutos secos y fruta desecada").canonical,
    "snacks"
  );
  assert.strictEqual(resolver("bm", "Frutos secos").canonical, "snacks");
  assert.strictEqual(resolver("ahorramas", "Otros frutos secos").canonical, "snacks");

  // Y la fruta de verdad no se mueve: la regla nueva es específica, no un cambio
  // de precedencia general entre snacks y frutas.
  assert.strictEqual(resolver("dia", "Frutas").canonical, "frutas_verduras");
  assert.strictEqual(resolver("mercadona", "Fruta y verdura").canonical, "frutas_verduras");
  assert.strictEqual(resolver("bm", "Champiñones").canonical, "frutas_verduras");
});

// --- cuarta pasada: el nombre, dentro de un departamento ------------------

const enFrescos = (supermercado, name) =>
  categorias.resolve({ supermercado, category: "Frescos", name });

test("\"Frescos\" es un departamento y lo decide el nombre del producto", () => {
  // El bug que reportó el usuario: "Frescos" de alcampo son 2.810 productos que
  // incluyen la frutería, la carnicería, la pescadería, la charcutería, la
  // quesería y el horno. Mapearla entera a frutas y verduras metía 716 quesos ahí.
  assert.strictEqual(enFrescos("alcampo", "GALBANI Queso mozzarella en lonchas 100 g.").canonical, "charcuteria_quesos");
  assert.strictEqual(enFrescos("alcampo", "SAINT AGUR Queso azul - Trozo").canonical, "charcuteria_quesos");
  assert.strictEqual(enFrescos("bm", "Queso fresco de Burgos al corte").canonical, "charcuteria_quesos");
  assert.strictEqual(enFrescos("ahorramas", "Queso rulo de cabra El Pastor 140g").canonical, "charcuteria_quesos");
  assert.strictEqual(enFrescos("alcampo", "Lomo de salmón.").canonical, "pescado_marisco");
  assert.strictEqual(enFrescos("alcampo", "Paletilla entera de cordero").canonical, "carne");
  assert.strictEqual(enFrescos("alcampo", "Hogaza de pan de centeno (70%) 400 g.").canonical, "panaderia_bolleria");
  assert.strictEqual(enFrescos("alcampo", "LEYENDA IBÉRICA Salchichón ibérico de cebo 50 g.").canonical, "charcuteria_quesos");
  // Y la fuente lo declara, para que se pueda auditar de dónde salió.
  assert.strictEqual(enFrescos("bm", "Queso ricotta 250 g").source, "name");
});

test("el departamento cae a su cajón por defecto, no a null", () => {
  // La pasada es segura por construcción: lo que las reglas de nombre no
  // reconocen se queda donde está hoy. Si cayera a null, el cambio dejaría 2.889
  // productos fuera de la navegación, que es peor que el bug.
  const r = enFrescos("alcampo", "Zurracapote de la casa al peso.");
  assert.strictEqual(r.canonical, "frutas_verduras");
  assert.strictEqual(r.source, "category");
});

test("las reglas de nombre no se pueden escribir como las de etiqueta", () => {
  // Los cuatro fallos reales que da POR_PALABRA aplicada a nombres de producto, y
  // que POR_NOMBRE tiene que no repetir: subcadena suelta y palabra polisémica.
  assert.strictEqual(enFrescos("alcampo", "Chipirones.").canonical, "pescado_marisco"); // no "ron"
  assert.strictEqual(enFrescos("alcampo", "Sandía de carne naranja al peso.").canonical, "frutas_verduras");
  assert.strictEqual(enFrescos("alcampo", "Melocotones rojos, bandeja 1 kg.").canonical, "frutas_verduras");
  assert.strictEqual(enFrescos("alcampo", "CALIDAD EXTRA Aguacate al peso.").canonical, "frutas_verduras");
  assert.strictEqual(enFrescos("alcampo", "Tomate corazón de buey al peso.").canonical, "frutas_verduras");
});

test("el ingrediente no decide: la ensalada y la hamburguesa ganan al queso", () => {
  assert.strictEqual(enFrescos("alcampo", "FLORETTE Ensalada de queso de cabra, nueces y manzana").canonical, "frutas_verduras");
  assert.strictEqual(enFrescos("alcampo", "PUJOL'S Burger meat de vaca madurada con cheddar inglés").canonical, "carne");
});

test("el corte que alcampo pega al nombre no cuenta", () => {
  // "- Taco ensalada 1 cm" es la forma de corte, no el producto: sin recortarlo,
  // seis quesos se iban a frutas y verduras por la palabra "ensalada".
  assert.strictEqual(enFrescos("alcampo", "Queso Cheddar rojo MINSTREL - Taco ensalada 1 cm").canonical, "charcuteria_quesos");
});

test("el plural no se escapa de las reglas de nombre", () => {
  // `\b(croissant)\b` no encuentra "croissants": por eso las reglas se compilan
  // con el plural en vez de escribirse a mano.
  assert.strictEqual(enFrescos("alcampo", "Mini croissants bañados surtidos 9 uds.").canonical, "panaderia_bolleria");
  assert.strictEqual(enFrescos("alcampo", "ZANETTI Burratinas 4x50 g.").canonical, "charcuteria_quesos");
});

test("el departamento sólo aplica a las cadenas declaradas", () => {
  // mercadona no tiene "Frescos". Lo que cambia sin declararlo es el CAJÓN POR
  // DEFECTO: sin departamento, un nombre que ninguna regla reconoce queda sin
  // cajón en vez de caer en frutas y verduras.
  const desconocido = categorias.resolve({
    supermercado: "mercadona", category: "Frescos", name: "Zurracapote de la casa",
  });
  assert.strictEqual(desconocido.canonical, null);
  // El nombre sí sigue decidiendo, por la pasada de respaldo, y así se declara.
  const queso = categorias.resolve({ supermercado: "mercadona", category: "Frescos", name: "Queso" });
  assert.strictEqual(queso.canonical, "charcuteria_quesos");
  assert.strictEqual(queso.source, "name");
});

// --- quinta pasada: el nombre cuando la etiqueta no dice nada --------------

test("una hoja sin rama la resuelve el nombre del producto", () => {
  // El agujero más grande del mapa: bm captura la hoja SIN su rama, y una hoja así
  // no se puede resolver por su texto porque no dice de qué habla. Eran 1.919
  // productos de bm y 666 de ahorramás sin cajón.
  const porNombre = (supermercado, category, name) =>
    categorias.resolve({ supermercado, category, name });
  assert.strictEqual(porNombre("bm", "Secas", "Alubia blanca larga 1 kg").canonical, "pasta_arroz_legumbres");
  assert.strictEqual(porNombre("bm", "Lonchas", "Queso en lonchas 8 unidades 150 g").canonical, "charcuteria_quesos");
  assert.strictEqual(porNombre("bm", "Oveja", "Queso de oveja al corte").canonical, "charcuteria_quesos");
  assert.strictEqual(porNombre("bm", "Máquina líquido", "Detergente líquido ropa delicada 50 lavados").canonical, "limpieza_drogueria");
  assert.strictEqual(porNombre("bm", "Rostro", "Maquillaje Nude finish Natural tono medio").canonical, "cosmetica_perfumeria");
  assert.strictEqual(porNombre("bm", "Antiarrugas y antiedad", "Crema facial antiarrugas de día 50 ml").canonical, "cosmetica_perfumeria");
  assert.strictEqual(porNombre("bm", "Pérdidas de orina", "Compresa pérdidas normal 14 unidades").canonical, "higiene_personal");
  assert.strictEqual(porNombre("bm", "Tarrinas", "Helado de crema de cacao y avellana tarrina 470 ml").canonical, "congelados");
  assert.strictEqual(porNombre("bm", "Natural", "Café natural molido puro sabor 250 g").canonical, "cafe_te");
  assert.strictEqual(porNombre("bm", "Té frío", "Kombucha piña colada 250 ml").canonical, "bebidas");
  assert.strictEqual(porNombre("ahorramas", "Colgate", "Pasta de dientes Colgate Triple Action").canonical, "higiene_personal");
  assert.strictEqual(porNombre("mercadona", "Velas y decoración", "Vela de cumpleaños 0 Hacendado").canonical, "pilas_iluminacion");
  // La garantía: la pasada sólo se ejecuta sobre lo que hoy NO tiene cajón, así que
  // una etiqueta que sí resuelve sigue mandando ella aunque el nombre diga otra cosa.
  assert.strictEqual(
    categorias.resolve({ supermercado: "dia", category: "Quesos", name: "Detergente" }).canonical,
    "charcuteria_quesos"
  );
});

// --- las raíces gruesas de alcampo son departamentos ----------------------

test("las raíces gruesas de alcampo las decide el nombre, no la etiqueta", () => {
  const en = (category, name) => categorias.resolve({ supermercado: "alcampo", category, name });
  // "Bebidas" metía ~1.100 botellas de alcohol en el cajón del agua mineral.
  assert.strictEqual(en("Bebidas", "MONTECILLO Vino tinto reserva con D.O. Ca. Rioja botella 75 cl.").canonical, "bebidas_alcohol");
  assert.strictEqual(en("Bebidas", "MAHOU 5 ESTRELLAS Cervezas pack 28 latas x 33 cl.").canonical, "bebidas_alcohol");
  assert.strictEqual(en("Bebidas", "FONT VELLA Agua mineral botella de 1,5 l.").canonical, "bebidas");
  // "Alimentación" era la despensa entera, pasta y aperitivos incluidos.
  assert.strictEqual(en("Alimentación", "GALLO Nº 5  Pasta fideos 450 g.").canonical, "pasta_arroz_legumbres");
  assert.strictEqual(en("Alimentación", "GREFUSA Pipas de girasol 200 g.").canonical, "snacks");
  assert.strictEqual(en("Alimentación", "COOSUR  Aceite de oliva virgen extra 5 l.").canonical, "despensa");
  // "Desayuno y Merienda" tenía 708 chocolates y 384 cafés dentro de los cereales.
  assert.strictEqual(en("Desayuno y Merienda", "LINDT Chocolate con leche y avellanas enteras 300 g.").canonical, "dulces_chocolate");
  assert.strictEqual(en("Desayuno y Merienda", "MARCILLA Café en cápsulas descafeinado Gran Aroma 28 uds.").canonical, "cafe_te");
  assert.strictEqual(en("Desayuno y Merienda", "GULLÓN Galletas integrales con avena y naranja 425 g.").canonical, "cereales_galletas");
  // "Droguería" mezclaba el papel higiénico con los detergentes.
  assert.strictEqual(en("Droguería", "SCOTTEX Pañuelos de papel de 3 capas 15 uds.").canonical, "papel_desechables");
  assert.strictEqual(en("Droguería", "ARIEL Detergente en cápsulas original 22 DS").canonical, "limpieza_drogueria");
  // Y el defecto sigue siendo el cajón que tenían: lo no reconocido no se mueve.
  const raro = en("Alimentación", "Zurracapote de la casa");
  assert.strictEqual(raro.canonical, "despensa");
  assert.strictEqual(raro.source, "category");
});

test("las palabras que engañan a las reglas de nombre del resto del súper", () => {
  const en = (supermercado, category, name) => categorias.resolve({ supermercado, category, name });
  // Cada una es un falso positivo medido contra el catálogo real.
  // "cortado" es el café Y el corte de la charcutería: 231 jamones al pasillo del café.
  assert.strictEqual(en("alcampo", "Frescos", "CAMPOFRÍO Jamón cocido extra, cortado en lonchas").canonical, "charcuteria_quesos");
  // "ron" dentro de "macarrones" no dispara, por el \b.
  assert.strictEqual(en("alcampo", "Alimentación", "GALLO Macarrones 500 g.").canonical, "pasta_arroz_legumbres");
  // "leche" también nombra un cosmético: 91 protectores solares en la nevera.
  assert.strictEqual(en("alcampo", "Perfumeria", "NIVEA Sun Leche solar protectora con FPS 30").canonical, "cosmetica_perfumeria");
  // "agua" micelar no es agua de beber; "aceite" capilar no es aceite de oliva.
  assert.strictEqual(en("alcampo", "Perfumeria", "NIVEA Micell air Agua micelar desmaquilladora 400 ml").canonical, "cosmetica_perfumeria");
  assert.strictEqual(en("alcampo", "Perfumeria", "GLISS Aceite capilar reparador de daños 100 ml").canonical, "cosmetica_perfumeria");
  // "pasta" de dientes no es pasta alimenticia.
  assert.strictEqual(en("alcampo", "Perfumeria", "COLGATE Max fresh Pasta de dientes con flúor 75 ml").canonical, "higiene_personal");
  // "azúcar" es casi siempre el reclamo "sin azúcares añadidos", no el producto.
  assert.strictEqual(en("alcampo", "Alimentación", "MENSAJERO Mitades de melocotón en almíbar sin azúcar añadido 240 g.").canonical, "despensa");
  assert.strictEqual(en("alcampo", "Desayuno y Merienda", "PRODUCTO ALCAMPO Azúcar blanco 1 Kg.").canonical, "dulces_chocolate");
  // "NACHO" es una marca de conservas; sólo el plural es el aperitivo.
  assert.strictEqual(en("alcampo", "Alimentación", "NACHO Atún en aceite de girasol en conserva 141 g.").canonical, "pescado_marisco");
  assert.strictEqual(en("alcampo", "Alimentación", "SANTA MARÍA Nachos bolsa de 185 g.").canonical, "snacks");
  // "bebida de avena" es bebida, no cereal de desayuno: 115 bricks.
  assert.strictEqual(en("alcampo", "Desayuno y Merienda", "ALPRO Bebida de avena 100% vegetal 1 l").canonical, "bebidas");
  // El chocolate va antes que la leche, igual que en POR_PALABRA.
  assert.strictEqual(en("alcampo", "Desayuno y Merienda", "MILKA Chocolate con leche y almendras enteras 100 gr.").canonical, "dulces_chocolate");
  // "nuez moscada" es una especia, no un fruto seco.
  assert.strictEqual(en("alcampo", "Alimentación", "CARMENCITA Nuez moscada molida 43 g.").canonical, "despensa");
});

test("\"Cerdo y cochinillo\" es el mismo pasillo que \"Cerdo\"", () => {
  // Se comprobó antes de fusionar: los 41 productos de ahorramás no tienen ni un
  // cochinillo, son cortes de cerdo. El cochinillo suelto NO se fusiona, para que
  // una cadena que traiga ese pasillo de verdad no se lo coma el del cerdo.
  assert.strictEqual(categorias.nombrePasillo("Cerdo y cochinillo", "carne"), "Cerdo");
  assert.strictEqual(
    categorias.clavePasillo("Cerdo y cochinillo", "carne"),
    categorias.clavePasillo("Cerdo", "carne")
  );
  assert.notStrictEqual(
    categorias.clavePasillo("Cochinillo", "carne"),
    categorias.clavePasillo("Cerdo", "carne")
  );
  // Y no toca la pescadería, donde los pasillos cortos SÍ son distintos.
  assert.notStrictEqual(
    categorias.clavePasillo("Bacalao", "pescado_marisco"),
    categorias.clavePasillo("Merluza", "pescado_marisco")
  );
});

// --- fusión de pasillos: aves, conejo, panadería y cereales ---------------

test("el nombre de un DEPARTAMENTO no es un nombre de pasillo", () => {
  // Desde que los departamentos se resuelven por el nombre del producto, su etiqueta
  // aparece como fila en cada cajón donde cae alguno: "Desayuno y Merienda" (224),
  // "Alimentación" (215) y "Frescos" (137) eran tres de las cinco filas más grandes
  // de panadería, y ninguna dice qué hay dentro. Se pliegan al nombre del cajón.
  assert.strictEqual(categorias.nombrePasillo("Frescos", "panaderia_bolleria"), "Panadería y bollería");
  assert.strictEqual(categorias.nombrePasillo("Desayuno y Merienda", "panaderia_bolleria"), "Panadería y bollería");
  assert.strictEqual(categorias.nombrePasillo("Alimentación", "carne"), "Carne");
  assert.strictEqual(categorias.nombrePasillo("Frescos", "frutas_verduras"), "Frutas y verduras");
  // Y la fila genérica de la cadena cae en la MISMA clave, que es el objetivo:
  // "Carnes" de dia y los "Frescos" de alcampo son la misma fila.
  assert.strictEqual(
    categorias.clavePasillo("Frescos", "carne"),
    categorias.clavePasillo("Carnes", "carne")
  );
  // Sin cajón no se puede plegar: no se sabe a qué nombre.
  assert.strictEqual(categorias.nombrePasillo("Frescos"), null);
});

test("la pollería son seis nombres del mismo pasillo, el conejo NO", () => {
  const p = (n) => categorias.nombrePasillo(n, "carne");
  assert.strictEqual(p("Aves y pollo"), "Aves y pollo");
  assert.strictEqual(p("Aves de España"), "Aves y pollo");
  assert.strictEqual(p("Pollo"), "Aves y pollo");
  assert.strictEqual(p("Pollo airfryer"), "Aves y pollo");
  assert.strictEqual(p("Conejo, pavo y otras aves"), "Aves y pollo");
  assert.strictEqual(p("Pollo y pavo"), "Aves y pollo");
  // "Conejo y cordero" NO se fusiona, y es el hallazgo de la auditoría: se parece a
  // "Cerdo y cochinillo" pero no lo es. De sus 9 productos, 6 son de CORDERO
  // (chuletas de palo y riñonada, hígado, garretas, burger al romero...), así que es
  // un pasillo mixto de dos especies, no otro nombre para el del conejo.
  assert.strictEqual(p("Conejo y cordero"), null);
  assert.strictEqual(p("Conejo"), null);
  assert.notStrictEqual(
    categorias.clavePasillo("Conejo y cordero", "carne"),
    categorias.clavePasillo("Conejo", "carne")
  );
  // "Carne y pollo" tampoco: son empanados de marca, no la pollería.
  assert.strictEqual(p("Carne y pollo"), null);
  // La casquería sí: "Arreglos" y "Casquería y arreglos" son el mismo pasillo.
  assert.strictEqual(p("Arreglos"), "Casquería y arreglos");
  assert.strictEqual(p("Casquería y arreglos"), "Casquería y arreglos");
});

test("panadería: se fusiona la redacción, no el tipo de producto", () => {
  const p = (n) => categorias.nombrePasillo(n, "panaderia_bolleria");
  assert.strictEqual(p("Pan de horno"), "Pan");
  assert.strictEqual(p("Pan de baguette"), "Pan");
  // Las cinco variantes de pan de molde son la misma compra: mercadona tiene UNA
  // fila genérica que las cubre todas.
  assert.strictEqual(p("Pan de molde blanco"), "Pan de molde");
  assert.strictEqual(p("Pan de molde integral"), "Pan de molde");
  assert.strictEqual(p("Pan de molde multicereales y semillas"), "Pan de molde");
  // "Pan de molde y tostado" es pan de molde: el molde decide antes que el tostado.
  assert.strictEqual(p("Pan de molde y tostado"), "Pan de molde");
  assert.strictEqual(p("Pan tostado, barritas y biscotes"), "Pan tostado y biscotes");
  // ...y el tostado antes que la repostería, aunque el pan rallado sea repostería.
  assert.strictEqual(p("Pan tostado y rallado"), "Pan tostado y biscotes");
  assert.strictEqual(p("Harinas, levadura y pan rallado"), "Harinas y repostería");
  assert.strictEqual(p("Picos, rosquilletas y picatostes"), "Picos, colines y picatostes");
  assert.strictEqual(p("Colines, picos y crackers"), "Picos, colines y picatostes");
  assert.strictEqual(p("Pasteleria"), "Tartas y pasteles");
  assert.strictEqual(p("Tartas , contesas y otros"), "Tartas y pasteles");
  // La bollería del día y la de horno son lo mismo; la ENVASADA no, y mercadona
  // tiene las dos como pasillos distintos (igual que "Agua con gas"/"Agua sin gas").
  assert.strictEqual(p("Bollería de horno"), "Bollería");
  assert.strictEqual(p("Bollería del día"), "Bollería");
  assert.strictEqual(p("Croissants, ensaimadas y napolitanas"), "Bollería");
  assert.strictEqual(p("Bollería envasada"), "Bollería envasada");
  assert.notStrictEqual(
    categorias.clavePasillo("Bollería envasada", "panaderia_bolleria"),
    categorias.clavePasillo("Bollería de horno", "panaderia_bolleria")
  );
  // Guardas: llevan palabra de panadería y no son el pasillo.
  assert.strictEqual(p("Galletas tostadas"), null);
  assert.strictEqual(p("Maíz tostado"), null);
  assert.strictEqual(p("Moldes y recipientes"), null);
});

test("cereales y galletas: la misma galleta sí, otra galleta no", () => {
  const p = (n) => categorias.nombrePasillo(n, "cereales_galletas");
  assert.strictEqual(p("Galletas clásicas"), "Galletas");
  assert.strictEqual(p("Galletas y pastas"), "Galletas");
  assert.strictEqual(p("Cereales clásicos"), "Cereales");
  assert.strictEqual(p("Cereales integrales, avena y muesli"), "Cereales integrales y muesli");
  assert.strictEqual(p("Wafer y barquillos"), "Barquillos y wafer");
  // "Galletas de avena e integrales" es galleta, no muesli: las reglas de galleta
  // van antes que las de cereal integral.
  assert.strictEqual(p("Galletas de avena e integrales"), "Galletas integrales");
  // Y estas tres son productos distintos, no tres formas de escribir "galleta".
  assert.strictEqual(p("Galletas rellenas"), "Galletas rellenas");
  assert.strictEqual(p("Galletas saladas"), "Galletas saladas");
  assert.strictEqual(p("Galletas María"), "Galletas María");
  assert.notStrictEqual(
    categorias.clavePasillo("Galletas rellenas", "cereales_galletas"),
    categorias.clavePasillo("Galletas saladas", "cereales_galletas")
  );
});

test("en lidl la regla de pasillo mira la hoja, no la rama", () => {
  // lidl manda la ruta entera separada por "/". El tramo padre habla del
  // departamento y arrastraba al hijo: "Carne y aves" mandaba los embutidos y la
  // carne de vacuno a la pollería.
  const p = (n) => categorias.nombrePasillo(n, "carne");
  assert.strictEqual(p("Comida y cerca de la comida/Carne y aves/Aves de corral"), "Aves y pollo");
  assert.strictEqual(p("Comida y cerca de la comida/Carne y aves/Embutidos y fiambres"), null);
  assert.strictEqual(p("Comida y cerca de la comida/Carne y aves/Carne de vacuno"), null);
});

// --- pasillo canónico -----------------------------------------------------

const FV = "frutas_verduras";

test("el singular y el plural caen juntos sin escribir nada a mano", () => {
  assert.strictEqual(categorias.clavePasillo("Yogur líquido"), categorias.clavePasillo("Yogures líquidos"));
  assert.strictEqual(categorias.clavePasillo("Arroz"), categorias.clavePasillo("Arroces"));
  assert.strictEqual(categorias.clavePasillo("Bollería envasada"), categorias.clavePasillo("Bolleria Envasada"));
  assert.strictEqual(categorias.clavePasillo("Fruta"), categorias.clavePasillo("Frutas"));
});

test("el ORDEN de las palabras no distingue un pasillo", () => {
  // 20 familias del catálogo, en 13 cajones, son la misma etiqueta permutada. No hay
  // ninguna cadena para la que "Salazones y ahumados" signifique otra cosa que
  // "Ahumados y salazones".
  const pares = [
    ["Ahumados y salazones", "Salazones y ahumados"],
    ["Sepia, pulpo y calamar", "Pulpo, calamar y sepia"],
    ["Caldos y sopas", "Sopa y caldo"],
    ["Barritas de cereales", "Cereales y barritas"],
    ["Embutido curado", "Curados y embutidos"],
    ["Pastas y arroces", "Arroz y pasta"],
    ["Champiñones y setas", "Setas y champiñones"],
    // "Otras" es relleno: seis cadenas lo usan para el cajón de sobras de un pasillo.
    ["Especias", "Otras especias"],
    ["Insecticidas", "Otros insecticidas"],
  ];
  for (const [a, b] of pares) {
    assert.strictEqual(categorias.clavePasillo(a), categorias.clavePasillo(b), `${a} / ${b}`);
  }
});

test("\"con\" y \"sin\" NO son partículas: distinguen el producto", () => {
  // Es el contraejemplo que acota la regla de arriba. Si se ignoraran como se ignora
  // la "y", el agua con gas y el agua sin gas serían una sola fila.
  assert.notStrictEqual(
    categorias.clavePasillo("Agua con gas", "bebidas"),
    categorias.clavePasillo("Agua sin gas", "bebidas")
  );
  assert.notStrictEqual(categorias.clavePasillo("Para carne", "carne"), categorias.clavePasillo("Carnes", "carne"));
});

test("dentro de un cajón, la fruta y la verdura se fusionan por palabra clave", () => {
  // El problema reportado: dentro de "Frutas y verduras" el usuario veía 87 filas de
  // pasillo, 46 de una sola cadena y 42 con 15 productos o menos.
  const frutas = categorias.clavePasillo("Fruta", FV);
  for (const nombre of ["Frutas", "Fruta variada", "Fruta de temporada", "Manzanas, peras y uvas", "Naranja", "Plátanos y uvas", "Manzana", "Fresas y frutos rojos", "Fruta de hueso"]) {
    assert.strictEqual(categorias.clavePasillo(nombre, FV), frutas, `"${nombre}"`);
    assert.strictEqual(categorias.nombrePasillo(nombre, FV), "Frutas", `"${nombre}"`);
  }

  const verduras = categorias.clavePasillo("Verdura", FV);
  for (const nombre of ["Verduras", "Verduras y hortalizas", "Otras verduras", "Mezcla de verduras", "Tomate", "Tomates y pepinos", "Maíz, guisantes y zanahoria", "Pimientos, calabacín y berenjenas", "Cebolla y ajo", "Champiñones y setas"]) {
    assert.strictEqual(categorias.clavePasillo(nombre, FV), verduras, `"${nombre}"`);
    assert.strictEqual(categorias.nombrePasillo(nombre, FV), "Verduras y hortalizas", `"${nombre}"`);
  }

  assert.strictEqual(categorias.nombrePasillo("Lechugas y ensaladas", FV), "Lechugas y ensaladas");
  assert.strictEqual(categorias.nombrePasillo("Lechuga y ensalada preparada", FV), "Lechugas y ensaladas");
  // "Fruta y verdura" habla de las dos, así que no puede caer en ninguna.
  assert.strictEqual(categorias.nombrePasillo("Fruta y verdura", FV), "Frutas y verduras");
  // Y "Frescos" dentro de este cajón es la frutería, no un pasillo propio.
  assert.strictEqual(categorias.nombrePasillo("Frescos", FV), "Frutas y verduras");
});

test("la fusión por palabra clave NO se aplica sin declarar el cajón", () => {
  // Es lo que la hace segura: fuera del pasillo fresco las mismas palabras son otra
  // cosa. Medido, una fusión global se llevaría "Refresco de naranja y de limón"
  // (34), "Yogures con frutas y sabores" (30) y "Estropajo, bayeta y guantes" (25,
  // por "ajo" dentro de "estropAJO") al pasillo de las verduras.
  assert.strictEqual(categorias.nombrePasillo("Refresco de naranja y de limón", "bebidas"), null);
  assert.strictEqual(categorias.nombrePasillo("Yogures con frutas y sabores", "lacteos_huevos"), null);
  assert.strictEqual(categorias.nombrePasillo("Estropajo, bayeta y guantes", "limpieza_drogueria"), null);
  assert.strictEqual(categorias.nombrePasillo("Tomate", undefined), null);
});

test("las guardas no dejan que una conserva se llame verdura", () => {
  // Su sitio es otro cajón (lo arregla POR_PALABRA), y mientras tanto lo que no hay
  // que hacer es renombrarlas: taparía el error.
  for (const nombre of ["Conservas de verdura y frutas", "Tomate frito", "Fruta deshidratada", "Cremas y purés de verdura", "Salsas para ensalada"]) {
    assert.strictEqual(categorias.nombrePasillo(nombre, FV), null, `"${nombre}"`);
  }
});

test("la carnicería fusiona la picada, y el pescado NO fusiona por conteo bajo", () => {
  // mercadona dice "Hamburguesas y picadas" y bm "Carne picada y hamburguesas": son
  // las mismas palabras menos una, no permutadas, así que la clave mecánica no basta.
  const picada = categorias.clavePasillo("Carne picada y hamburguesas", "carne");
  assert.strictEqual(categorias.clavePasillo("Hamburguesas y picadas", "carne"), picada);
  assert.strictEqual(categorias.clavePasillo("Hamburguesas y carne picada", "carne"), picada);
  assert.strictEqual(categorias.nombrePasillo("Hamburguesas y picadas", "carne"), "Carne picada y hamburguesas");
  // "Pan de hamburguesas" es panadería, no picada.
  assert.strictEqual(categorias.nombrePasillo("Pan de hamburguesas y otros", "carne"), null);

  // El criterio es "el mismo concepto escrito distinto", nunca "tiene pocos
  // productos": "Bacalao" (4), "Merluza" (10) y "Anchoas" (12) son pasillos
  // legítimamente distintos y no se tocan.
  const claves = ["Bacalao", "Merluza", "Anchoas", "Mejillones", "Sardinas"].map(
    (n) => categorias.clavePasillo(n, "pescado_marisco")
  );
  assert.strictEqual(new Set(claves).size, claves.length);
});

// --- las tres salidas -----------------------------------------------------

test("las campañas comerciales no son un pasillo", () => {
  // ahorramás mezcla pasillos con promociones: "Feria del chocolate" no es el
  // pasillo del chocolate, es una promoción con productos de cualquier pasillo.
  for (const etiqueta of ["Black Friday", "Feria del chocolate", "Día del Padre", "Especial fútbol", "Campaña Puchero", "Semana Santa"]) {
    assert.strictEqual(
      resolver("ahorramas", etiqueta).canonical,
      categorias.NO_FIABLE,
      `"${etiqueta}" no se marcó como no fiable`
    );
  }
});

test("las marcas usadas como sección tampoco", () => {
  assert.strictEqual(resolver("ahorramas", "Mondelez").canonical, categorias.NO_FIABLE);
  assert.strictEqual(resolver("ahorramas", "Pepsico").canonical, categorias.NO_FIABLE);
});

test("los atributos que no son pasillo se marcan no fiables", () => {
  // "Sin gluten" son 803 productos de cualquier pasillo, y "Envasado" o "Al corte"
  // son la forma de venta, no el tipo de producto.
  for (const etiqueta of ["Sin gluten", "Envasado", "Al corte", "Bio", "Seco", "Húmedo"]) {
    assert.strictEqual(resolver("bm", etiqueta).canonical, categorias.NO_FIABLE, `"${etiqueta}"`);
  }
});

test("las categorías mixtas de alcampo siguen siendo no fiables", () => {
  for (const etiqueta of ["Folletos y Promociones", "Campañas", "Hogar y Decoración"]) {
    assert.strictEqual(resolver("alcampo", etiqueta).canonical, categorias.NO_FIABLE);
  }
});

test("lo que queda en las categorías de bazar de alcampo es no fiable, no bazar", () => {
  // Tras la limpieza sólo quedan las pilas y bombillas rescatadas, así que la
  // etiqueta miente sobre lo que hay dentro.
  assert.strictEqual(resolver("alcampo", "Bricolaje").canonical, categorias.NO_FIABLE);
  assert.strictEqual(resolver("alcampo", "Automóvil").canonical, categorias.NO_FIABLE);
});

test("carrefour es no fiable: una etiqueta para todo el catálogo", () => {
  assert.strictEqual(resolver("carrefour", "Bebidas").canonical, categorias.NO_FIABLE);
});

test("lo que no resuelve ninguna pasada queda sin cajón, no en uno inventado", () => {
  const r = resolver("bm", "Máquina líquido");
  assert.strictEqual(r.canonical, null);
  assert.strictEqual(r.source, null);
  // Y sin categoría tampoco se inventa nada.
  assert.strictEqual(resolver("aldi", null).canonical, null);
});

// --- el pasillo y la ruta -------------------------------------------------

test("el pasillo es la hoja de la ruta", () => {
  assert.strictEqual(
    categorias.aisleFrom({ category_path: ["Despensa", "Aceites", "Aceite de oliva"] }),
    "Aceite de oliva"
  );
});

test("sin ruta, el pasillo es la etiqueta plana", () => {
  // Es la degradación que toca: 1 de cada 10 productos de bm no trae ruta.
  assert.strictEqual(categorias.aisleFrom({ category: "Ternera" }), "Ternera");
  assert.strictEqual(categorias.aisleFrom({ category: null }), null);
});

test("la ruta se guarda como texto y se puede volver a leer", () => {
  const path = ["Frescos", "Carnicería", "Ternera"];
  const texto = categorias.pathToString(path);
  assert.strictEqual(texto, "Frescos > Carnicería > Ternera");
  assert.deepStrictEqual(categorias.pathToArray(texto), path);
  assert.strictEqual(categorias.pathToString([]), null);
  assert.strictEqual(categorias.pathToString(null), null);
});

test("FUERA_DE_ALCANCE y NO_FIABLE no son cajones", () => {
  // Son estados de la resolución, no categorías, así que no se guardan.
  assert.ok(!categorias.esCanonica(categorias.FUERA_DE_ALCANCE));
  assert.ok(!categorias.esCanonica(categorias.NO_FIABLE));
  assert.ok(!categorias.esCanonica(null));
  assert.ok(categorias.esCanonica("lacteos_huevos"));
});

// --- contra sqlite --------------------------------------------------------

const FIXTURES = [
  ["mercadona", "Leche y bebidas vegetales", null, "Leche entera Hacendado"],
  ["mercadona", "Verdura", null, "Tomate rama"],
  ["dia", "Cervezas, vinos y licores", null, "Cerveza Mahou"],
  ["bm", "Ternera", ["Frescos", "Carnicería", "Ternera"], "Cadera de añojo"],
  ["bm", "Yogur bífidus", null, "Bífidus natural"],
  ["alcampo", "Folletos y Promociones", null, "Aceite de oliva Carbonell 5 l"],
  ["bm", "Máquina líquido", null, "Producto sin resolver"],
  ["lidl", "x", ["Tienda de bricolaje y jardín", "Taller"], "Destornillador"],
];

productModel.insertMany(
  FIXTURES.map(([supermercado, category, category_path, name]) => ({
    supermercado, name, category,
    // Se derivan con la misma función que usa el ingest, que es el punto de tener
    // una sola: si el test derivara a mano podría pasar mientras producción falla.
    ...categorias.columnsFor({ supermercado, category, category_path }),
    price_eur: 1.5, price_per_unit_eur: 1.5, measure_unit: "ud",
    ean13: null, brand: null, image: null, url: null,
    is_offer: 0, price_before: null, is_new: 0,
  }))
);

test("las columnas de la taxonomía se guardan", () => {
  const { items } = productModel.findAll({ q: "cadera" }, { limit: 5, offset: 0 });
  const fila = items[0];
  assert.strictEqual(fila.category_path, "Frescos > Carnicería > Ternera");
  assert.strictEqual(fila.aisle, "Ternera");
  assert.strictEqual(fila.canonical_category, "carne");
  assert.strictEqual(fila.category_source, "keyword");
});

test("lo no resuelto se guarda como null, no con un cajón inventado", () => {
  const { items } = productModel.findAll({ q: "sin resolver" }, { limit: 5, offset: 0 });
  assert.strictEqual(items[0].canonical_category, null);
  assert.strictEqual(items[0].category_source, null);
});

test("countByCanonical devuelve los cajones con nombre y si son alimentación", () => {
  const { categorias: cajones } = productModel.countByCanonical();
  const ids = cajones.map((c) => c.id);
  assert.ok(ids.includes("lacteos_huevos") && ids.includes("carne"));
  const lacteos = cajones.find((c) => c.id === "lacteos_huevos");
  assert.strictEqual(lacteos.nombre, "Lácteos y huevos");
  assert.strictEqual(lacteos.alimentacion, true);
  assert.strictEqual(lacteos.total, 2);
});

test("el flag que se devuelve es alimentacion, y los de comida vienen en true", () => {
  // No hay `en_alcance`: todo cajón canónico es de alcance por construcción, porque
  // lo que queda fuera nunca recibe cajón. Un campo siempre true no informa de nada,
  // y devolverlo hacía que la app leyera undefined y escondiera el catálogo entero.
  const cajones = productModel.countByCanonical().categorias;
  assert.ok(!("en_alcance" in cajones[0]), "en_alcance no debería existir");
  const comida = cajones.find((c) => c.id === "lacteos_huevos");
  const noComida = categorias.CANONICAS.find((c) => c.id === "limpieza_drogueria");
  assert.strictEqual(comida.alimentacion, true);
  assert.strictEqual(noComida.alimentacion, false);
  // Todos los cajones de comida del mapa lo declaran.
  for (const id of ["frutas_verduras", "carne", "despensa", "bebidas"]) {
    assert.strictEqual(categorias.canonicaPorId(id).alimentacion, true, id);
  }
});

test("sin_clasificar y etiqueta_no_fiable son cosas distintas y se cuentan aparte", () => {
  // Mezclarlos triplicaba el número: el endpoint decía 8.869 cuando los realmente
  // sin resolver eran 2.846. "La etiqueta miente" no es "no supe".
  const r = productModel.countByCanonical();
  assert.strictEqual(r.etiqueta_no_fiable, 1); // el de Folletos y Promociones
  assert.strictEqual(r.sin_clasificar, 1); // el de "Máquina líquido"
  // Y el de lidl fuera de alcance no cae en ninguno de los dos.
  assert.notStrictEqual(r.sin_clasificar + r.etiqueta_no_fiable, 3);
});

test("category_source dice por qué no hay cajón, no sólo de dónde salió", () => {
  const { items } = productModel.findAll({ q: "carbonell" }, { limit: 5, offset: 0 });
  assert.strictEqual(items[0].canonical_category, null);
  assert.strictEqual(items[0].category_source, categorias.FUENTE_NO_FIABLE);

  const raro = productModel.findAll({ q: "sin resolver" }, { limit: 5, offset: 0 }).items[0];
  assert.strictEqual(raro.category_source, null);

  const fuera = productModel.findAll({ q: "destornillador" }, { limit: 5, offset: 0 }).items[0];
  assert.strictEqual(fuera.category_source, categorias.FUENTE_FUERA_DE_ALCANCE);
});

test("columnsFor es la única derivación, para que ingest y recategorize no divergan", () => {
  // El bug de `en_alcance` salió de tener la forma documentada en un sitio y la
  // implementada en otro; esto evita la versión de datos del mismo problema.
  const col = categorias.columnsFor({
    supermercado: "bm", category: "Ternera", category_path: ["Frescos", "Carnicería", "Ternera"],
  });
  assert.deepStrictEqual(Object.keys(col).sort(), [
    "aisle", "canonical_category", "category_path", "category_source",
  ]);
  assert.strictEqual(col.canonical_category, "carne");
  assert.strictEqual(col.category_path, "Frescos > Carnicería > Ternera");
  assert.strictEqual(col.aisle, "Ternera");
});

test("el orden de los cajones es el del mapa, no alfabético ni por volumen", () => {
  // Es el orden de los pasillos de un supermercado real.
  const ids = productModel.countByCanonical().categorias.map((c) => c.id);
  const esperado = categorias.CANONICAS.map((c) => c.id).filter((id) => ids.includes(id));
  assert.deepStrictEqual(ids, esperado);
});

test("se puede filtrar productos por cajón canónico y por pasillo", () => {
  assert.strictEqual(productModel.findAll({ categoria_canonica: "carne" }, { limit: 10, offset: 0 }).total, 1);
  assert.strictEqual(productModel.findAll({ pasillo: "Ternera" }, { limit: 10, offset: 0 }).total, 1);
  assert.strictEqual(productModel.findAll({ categoria_canonica: "no_existe" }, { limit: 10, offset: 0 }).total, 0);
});

test("los pasillos se pueden pedir dentro de un cajón, que es el paso 2 del flujo", () => {
  const { pasillos } = productModel.countByAisle({ categoria_canonica: "lacteos_huevos" });
  const aisles = pasillos.map((p) => p.aisle);
  assert.ok(aisles.includes("Leche y bebidas vegetales") && aisles.includes("Yogur bífidus"));
  // Y cada fila lleva su cadena, para poder elegir por qué pasillo de qué cadena ir.
  assert.ok(pasillos.every((p) => typeof p.supermercado === "string"));
});

test("los endpoints responden con la forma acordada", () => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  productController.categorias({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(Object.keys(res.body), ["categorias", "sin_clasificar", "etiqueta_no_fiable"]);
  assert.deepStrictEqual(Object.keys(res.body.categorias[0]), ["id", "nombre", "alimentacion", "total", "supermercados"]);
});

test("categorias se puede acotar por cadena", () => {
  const { categorias: cajones } = productModel.countByCanonical({ supermercado: "mercadona" });
  assert.deepStrictEqual(cajones.map((c) => c.id).sort(), ["frutas_verduras", "lacteos_huevos"]);
});

fs.rmSync(DB_PATH, { force: true });

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
