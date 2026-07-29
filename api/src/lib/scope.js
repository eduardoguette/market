// Detección de productos que evidentemente NO son de supermercado, a partir del
// NOMBRE. Lista negra: sólo se marca lo que hay evidencia positiva de que es
// bazar; todo lo demás se queda. La `category` no sirve para decidirlo en los
// casos difíciles porque alcampo mete aceite de oliva y una bicicleta eléctrica
// bajo la misma etiqueta ("Folletos y Promociones", "Campañas").
//
// Calibrado de forma deliberadamente asimétrica: dejar un puf en el catálogo es
// ruido que el usuario ignora, pero borrar un alimento es un fallo que nota y no
// puede diagnosticar (busca algo que sabe que existe y no aparece). Ante
// cualquier duda se mantiene, y lo ambiguo sale como "dudoso" para que lo decida
// una persona.
//
// Alcance vigente: entra comida, bebida, hogar consumible (limpieza, droguería,
// papel), cuidado personal (champú, perfumes, higiene, parafarmacia), bebé y
// mascotas. No entra textil, tecnología, electrodomésticos, menaje y bazar
// (platos, sartenes, vajilla), bricolaje, jardín, juguetes, libros, papelería,
// automóvil y deportes.

const { normalizeName } = require("./matching");

const MANTENER = "mantener";
const DESCARTAR = "descartar";
const DUDOSO = "dudoso";

// --- Protecciones ----------------------------------------------------------
//
// Vetan cualquier descarte posterior, y por eso van primero. Son frases y no
// palabras sueltas justo donde la palabra suelta engaña: "papel" no protege
// (papel de regalo es papelería) pero "papel higienico" sí; "aceite" no protege
// (aceite de motor es automóvil) pero "aceite de oliva" sí.
//
// Varias salieron de contrastar contra las cadenas limpias: "Limpiador de Ollas
// y Cacerolas" es limpieza aunque diga ollas, "Estropajo acero inoxidable" es
// limpieza aunque diga acero, y "Lima fibra de vidrio" es cosmética aunque diga
// vidrio.
// Cada protección declara si es FUERTE o CONTEXTUAL, porque no todas son
// evidencia de la misma calidad y eso decide si puede contradecir a la categoría.
//
//   FUERTE     identifica el TIPO de producto de forma inequívoca. Una pila es una
//              pila esté catalogada en "Bricolaje" o en "Bazar", así que le gana a
//              la etiqueta del retailer. Son las decisiones explícitas del usuario
//              (pilas, bombillas, velas, desechables) más la comida, porque borrar
//              comida es el único fallo inaceptable.
//
//   CONTEXTUAL heurística que sólo vale cuando no hay una categoría de la que
//              fiarse. Son de dos tipos: propiedades del envase ("se vende por
//              litro" lo cumplen la pintura y el sustrato igual que el aceite) y
//              palabras polisémicas donde el sentido de supermercado y el de
//              bricolaje conviven (esmalte de uñas / esmalte de pintura,
//              ambientador de casa / de coche, taco de jamón / taco de lija).
//              Siguen protegiendo dentro de los huérfanos, que es para lo que se
//              escribieron, pero no contra una lista negra explícita.
//
// La prueba para clasificar cada una: ¿existe un producto con esta palabra en
// Bricolaje, Automóvil o Jardín que NO sea de supermercado? Si existe, es
// contextual.
// Contextos que descalifican la regla de vajilla desechable: un plato de maceta y
// una bandeja de oficina son de plástico pero no son vajilla. Va como guard sobre
// el nombre entero porque estas palabras aparecen antes del material en el nombre,
// donde un lookahead al final del patrón no las ve.
const NO_ES_VAJILLA = /\b(maceta|macetero|terracota|jardinera|sobremesa|apilable|archivador|oficina|formato a4)\b/;

const FUERTE = "fuerte";
const CONTEXTUAL = "contextual";

const PROTECCIONES = [
  // --- Limpieza y droguería: contextual -------------------------------------
  // Todo este bloque tiene gemelo en bricolaje y automóvil: limpiadores de útiles
  // de pintura, detergente de hidrolimpiadora KARCHER, ambientadores de coche,
  // insecticidas de jardín. Protegen bien dentro de los huérfanos y no deben
  // rescatar nada de una categoría de bazar.
  [/\blimpia(dor|cristales|hogar|muebles|metales|suelos)?\b/, CONTEXTUAL],
  [/\b(quitagrasas|desengrasante|abrillantador|desincrustante|antical|desatascador)\b/, CONTEXTUAL],
  // El detergente de la ropa y el del lavavajillas sí se identifican; el
  // "detergente" a secas lo comparte la hidrolimpiadora KARCHER de Bricolaje.
  [/\bdetergente (para |de )?(lavadora|ropa|prendas|colada|lavavajillas)\b/, FUERTE],
  [/\bsuavizante (para |de )?(ropa|prendas|colada)\b/, FUERTE],
  [/\b(detergente|lejia|suavizante|friegasuelos|lavavajillas|amoniaco|salfuman|sosa caustica)\b/, CONTEXTUAL],
  [/\b(estropajo|fregona|bayeta|mopa|trapo|recambio de fregona|paño de cocina|panos? de cocina)\w*/, CONTEXTUAL],
  [/\b(ambientador|insecticida|antipolillas|desinfectante|quitamanchas|blanqueador|raticida)\b/, CONTEXTUAL],
  [/\bguantes? de (fregar|limpieza|latex|vinilo|nitrilo)\b/, CONTEXTUAL],

  // --- Comida y bebida: fuerte ---------------------------------------------
  [/\baceite de (oliva|girasol|coco|semillas|colza|palma|orujo)\b/, FUERTE],
  [/\baceite (virgen|refinado|de sabor)\b/, FUERTE],
  [/\b(goma de mascar|chicle)/, FUERTE],
  // Semillas de césped y de rúcula son de jardín; las de chía, comida.
  [/\bsemillas? de \w+/, CONTEXTUAL],
  [/\bcopa de (helado|postre)\b/, FUERTE],
  [/\bplatos? (preparado|combinado)/, FUERTE],
  [/\bvasito/, FUERTE],
  [/\bcaldo\b/, FUERTE],
  [/\bpiña\b/, FUERTE],

  // Comida preparada: sus nombres llevan justo las palabras de utensilio y de
  // técnica de cocina que sirven para detectar bazar ("hamburguesa a la plancha",
  // "bandeja de croquetas", "palomitas para microondas"), así que necesita
  // protección propia. "taco" y "pincho" van acotados: un taco de lija y un
  // pincho de jardín no son comida.
  // Prefijos truncados: necesitan \w* para coger todas las terminaciones.
  [/\b(croquet|empanad|rebozad|precocinad|canelon|lasan|lasaña|albondig|tortell|ravioli|ensaladill)\w*/, FUERTE],
  // Palabras completas: sólo plural, nunca derivación. Con \w* "sandwich" cogía
  // sandwichera, "sopa" sopera y "tarta" tartera, todos utensilios.
  [/\b(tortilla|hamburguesa|pizza|nugget|flamenquin|san jacobo|paella|fideua|risotto|escalope|gazpacho|salmorejo|sopa|guiso|estofado|cocido|fabada|callos|migas|salteado|burrito|falafel|hummus|noqui|ñoqui|arancini|samosa|quiche|tarta|tartaleta|bocadillo|sandwich|wrap|kebab|pollo asado)(s|es)?\b/, FUERTE],
  [/\bpures? de \w+/, FUERTE],
  // Contextuales: en una categoría de bazar son otra cosa. "Juego de mesa Sushi &
  // Go", "Parrilla para salchichas", "Perro salchicha" (un peluche), "Set de
  // brochetas cromadas".
  [/\b(sushi|salchicha|brocheta)\w*/, CONTEXTUAL],
  [/\btacos? de (maiz|jamon|queso|pollo|carne|atun|pavo|lomo)\b/, FUERTE],
  [/\bpinchos? (de|moruno)\b/, FUERTE],
  [/\b(a la (plancha|sarten|parrilla|brasa|barbacoa|romana)|al horno|al vapor|frito|asad[oa])\b/, FUERTE],
  [/\bpalomitas\b/, FUERTE],
  [/\bpara (cafetera|freidora)\b/, FUERTE],

  // --- Vajilla desechable y velas: fuerte ----------------------------------
  // Decisión explícita del usuario. Va como protección fuerte porque tiene que
  // ganarle a la regla de marca (ACTUEL vende bazar Y desechables) y a la
  // categoría (hay desechables catalogados en Papelería).
  //
  // "reutilizable" queda fuera a propósito: un vaso de plástico reutilizable es
  // menaje, y así lo deciden las reglas de más abajo.
  [/\b(desechable|un solo uso|un uso|monouso|usar y tirar)\w*(?![^]*reutilizab)/, FUERTE],
  [/\b(plato|platos|vaso|vasos|copa|copas|cubierto|cubiertos|tenedor|tenedores|cuchara|cucharas|cuchillo|cuchillos|mantel|manteles|bandeja|bandejas|bol|boles|cuenco|servilleta|servilletas|pajita|pajitas|palillo|palillos|envase|envases|tarrina|tarrinas)\b[^]*\b(carton|papel|plastico|poliestireno|celulosa|caña de azucar|cana de azucar)\b/, FUERTE, true],
  [/\b(carton|papel|plastico|poliestireno|caña de azucar|cana de azucar)\b[^]*\b(plato|platos|vaso|vasos|copa|copas|cubierto|cubiertos|tenedor|tenedores|cuchara|cucharas|cuchillo|cuchillos|mantel|manteles|bandeja|bandejas|bol|boles|cuenco|servilleta|servilletas|pajita|pajitas|envase|envases|tarrina|tarrinas)\b/, FUERTE, true],

  // Las velas entran: mercadona tiene su propia categoría "Velas y decoración",
  // así que sacarlas de alcampo sería incoherente entre cadenas. Con sinónimos,
  // porque un tealight es una vela y no lleva la palabra. "portavelas" y
  // "posavelas" quedan fuera a propósito: son soportes, no velas.
  [/(?<!barco de )(?<!tabla de )\b(vela|tealight|candelita|lamparilla)\w*\b/, FUERTE],

  // --- Pilas y bombillas: fuerte -------------------------------------------
  // Decisión explícita del usuario, criterio amplio de consumible de hogar:
  // mercadona tiene "Pilas y bolsas de basura" y ahorramás "Bombillas e
  // iluminación". Una pila sigue siendo una pila en "Bricolaje", que es donde
  // alcampo cataloga 197 packs.
  //
  // La bombilla de coche (casquillos H7/HB) es automóvil, y "cargador" suelto es
  // el del móvil, así que sólo se protege el de pilas.
  [/\bbo(m)?billas?\b(?![^]*\b(h[0-9]|hb[0-9]|xenon|halogeno)\b)/, FUERTE],
  [/\bpilas?\b(?! de (fregadero|lavadero|obra))/, FUERTE],
  [/\bcargador de pilas\b/, FUERTE],
  // La iluminación que no es bombilla es contextual: las linternas tácticas y las
  // luces solares de jardín viven en Bricolaje y Jardín, y no son de la compra.
  [/\b(luz solar|linterna|farolillo)\b/, CONTEXTUAL],

  // --- Papel, film y desechables de cocina: fuerte -------------------------
  [/\bpapel (higienico|de cocina|de horno|film|de aluminio|aluminio|absorbente|vegetal|de secar)\b/, FUERTE],
  [/\bservilletas?\b/, FUERTE],
  [/\bfilm (transparente|de cocina|adherente)\b/, FUERTE],
  [/\bbolsas? (de )?(basura|congelacion|conservacion|hielo|horno|sandwich|zip|fruta)\b/, FUERTE],
  [/\brollo de cocina\b/, FUERTE],
  [/\bmanteles? de papel\b/, FUERTE],

  // --- Cuidado personal y parafarmacia ------------------------------------
  // Casi todo es identidad de producto y va fuerte. Las excepciones son las
  // palabras que también nombran material de pintura o de papelería: "esmalte"
  // (de uñas / sobre hierro), "corrector" (de ojeras / Tipp-Ex), "mascarilla"
  // (capilar / de pintor), "laca" (de uñas / de madera).
  [/\b(champu|acondicionador|gel de baño|gel de ducha|gel de manos|jabon|pasta de dientes|dentifrico|colutorio|enjuague bucal)\b/, FUERTE],
  [/\b(desodorante|antitranspirante|colonia|perfume|eau de (toilette|parfum)|after ?shave|espuma de afeitar)\b/, FUERTE],
  [/(?<!color )(?<!tono )\bcremas?\b/, CONTEXTUAL],
  [/\b(serum|locion|exfoliante|tonico|contorno de ojos|protector solar|aftersun|fluido)\b/, CONTEXTUAL],
  [/\bmascarilla (capilar|facial|hidratante|de arcilla)\b/, FUERTE],
  [/\b(base de maquillaje|rimel|mascara de pestañas|pintalabios|barra de labios|laca de uñas|colorete|sombra de ojos|delineador)\b/, FUERTE],
  // "Caja de maquillaje ONE TWO FUN" es un juguete.
  [/\bmaquillaje\b/, CONTEXTUAL],
  [/\besmalte de uñas\b|\besmalte permanente\b/, FUERTE],
  [/\b(corrector de ojeras|corrector fluido|corrector de maquillaje)\b/, FUERTE],
  [/\b(compresa|tampon|salvaslip|copa menstrual|protegeslip|higiene intima)\w*/, FUERTE],
  [/\b(pañal|panal|toallita|bastoncillo|discos? desmaquillante)\w*/, FUERTE],
  [/\bgasas\b|\bgasa (esteril|hidrofil)/, FUERTE],
  [/\balgodon (hidrofilo|magico)\b|\bdiscos? de algodon\b/, FUERTE],
  [/\b(cepillo de dientes|cepillo dental|seda dental|hilo dental|cinta dental|colutorio)\b/, FUERTE],
  [/\birrigador\b/, CONTEXTUAL],
  [/\bbrocha (de maquillaje|para polvos)\b/, FUERTE],
  [/\bmolde de papel\b/, FUERTE],
  [/\b(cuchillas?|maquinilla) de afeitar\b/, FUERTE],
  [/\b(preservativo|lubricante intimo|test de embarazo|suero fisiologico|alcohol sanitario|agua oxigenada|tirita|venda|esparadrapo)\w*/, FUERTE],
  [/\b(ibuprofeno|paracetamol|aspirina|jarabe|vitamina|complemento alimenticio|suplemento|probiotico)\b/, FUERTE],
  [/\btintes? (de |para )?(pelo|cabello|capilar|permanente)\b/, FUERTE],
  [/\b(coloracion|decolorante|champu|mascarilla capilar)\b/, FUERTE],
  // "Tinte al agua" es tinte de madera; en bazar nunca es de pelo.
  [/\btintes?\b/, CONTEXTUAL],
  [/\bmascarilla (ffp2|quirurgica|higienica)\b/, FUERTE],
  [/\blima (de uñas|fibra)\b/, FUERTE],
  [/\bquitaesmalte\b/, FUERTE],
  // La acetona de Bricolaje es disolvente.
  [/\bacetona\b/, CONTEXTUAL],

  // --- Bebé consumible y mascotas: fuerte ---------------------------------
  [/\b(potito|papilla|leche infantil|cereales infantiles|tarrito)\w*/, FUERTE],
  [/\b(pienso|snack para (perro|gato)|arena (para|de) gato|lecho para gato|comida (para|de) (perro|gato|ave|pez|roedor))\b/, FUERTE],
  [/\b(tetina|chupete|biberon)\w*/, FUERTE],
];

// Palabras que ninguna protección puede desactivar: no hay cosmético que sea una
// bicicleta. Hacen falta porque las protecciones son vetos absolutos y algunas se
// disparan por casualidad: "Bicicleta eléctrica YOUIN VIENA CREMA" quedaba
// protegida porque CREMA es el color.
//
// A propósito no lleva nada de cocina (sartén, cacerola, olla): esas palabras
// aparecen en productos de limpieza que sí son de alcance ("Limpiador de Ollas y
// Cacerolas"), así que ahí la protección tiene que seguir ganando. Ni "bañador":
// el "pañal bañador desechable" es de bebé.
const IRREFUTABLES = new Set([
  "bicicleta", "bicicletas", "televisor", "television", "patinete", "monopatin",
  "triciclo", "taladro", "destornillador", "martillo", "alicates", "peluche",
  "puzzle", "puzle", "muñeca", "muneca", "colchon", "colchones", "edredon",
  "nordica", "nordico", "sabana", "sabanas", "almohada", "almohadas", "cojin",
  "cojines", "alfombra", "alfombrilla", "cortina", "cortinas", "camiseta",
  "pantalon", "pijama", "zapatillas", "sudadera",
  "mancuerna", "mancuernas", "raqueta", "portatil", "ordenador", "impresora",
  "smartphone", "tablet", "consola", "videojuego", "altavoz", "altavoces",
  "auriculares", "cuaderno", "boligrafo", "grapadora", "neumatico", "maceta",
  "manguera", "cortacesped", "tumbona", "parasol", "sombrilla", "sombrillas",
  "cenador", "percha", "perchas", "jarron", "portafotos", "puf", "taburete",
  "estanteria", "textileno", "hinchable",
]);

// --- Palabras inequívocas --------------------------------------------------
//
// Imposibles en un producto de supermercado en cualquier posición del nombre.
const INEQUIVOCOS = {
  bicicleta: "deportes", bicicletas: "deportes", triciclo: "juguetes",
  patinete: "deportes", monopatin: "deportes", mancuerna: "deportes",
  mancuernas: "deportes", raqueta: "deportes", bañador: "textil",
  banador: "textil", colchoneta: "deportes", flotador: "deportes",
  esterilla: "deportes", hinchable: "juguetes", tumbona: "jardin",
  televisor: "tecnologia", television: "tecnologia", smartphone: "tecnologia",
  tablet: "tecnologia", ordenador: "tecnologia", portatil: "tecnologia",
  impresora: "tecnologia", auriculares: "tecnologia", altavoz: "tecnologia",
  altavoces: "tecnologia", teclado: "tecnologia", consola: "tecnologia",
  videojuego: "tecnologia", smartwatch: "tecnologia", bluetooth: "tecnologia",
  inalambrico: "tecnologia", inalambrica: "tecnologia", auricular: "tecnologia",
  depiladora: "electrodomesticos", secador: "electrodomesticos",
  batidora: "electrodomesticos", licuadora: "electrodomesticos",
  tostadora: "electrodomesticos",
  freidora: "electrodomesticos",
  aspiradora: "electrodomesticos", lavadora: "electrodomesticos",
  nevera: "electrodomesticos", ventilador: "electrodomesticos",
  radiador: "electrodomesticos", calefactor: "electrodomesticos",
  humidificador: "electrodomesticos", hervidor: "electrodomesticos",
  bascula: "electrodomesticos",
  taladro: "bricolaje", destornillador: "bricolaje", alicates: "bricolaje",
  martillo: "bricolaje", tornillos: "bricolaje",
  herramienta: "bricolaje", herramientas: "bricolaje",
  lija: "bricolaje", soldador: "bricolaje", velcro: "bricolaje",
  manguera: "jardin", regadera: "jardin", maceta: "jardin",
  macetero: "jardin", cortacesped: "jardin", parasol: "jardin",
  juguete: "juguetes", juguetes: "juguetes", peluche: "juguetes",
  muñeca: "juguetes", muneca: "juguetes", muñeco: "juguetes",
  puzzle: "juguetes", puzle: "juguetes", rompecabezas: "juguetes",
  nordica: "textil", nordico: "textil", edredon: "textil",
  sabana: "textil", sabanas: "textil", bajera: "textil",
  encimera: "textil", almohada: "textil", almohadas: "textil",
  colcha: "textil", cojin: "textil", cojines: "textil",
  alfombra: "textil", alfombrilla: "textil", cortina: "textil",
  cortinas: "textil", camiseta: "textil", pantalon: "textil",
  calcetines: "textil", pijama: "textil", zapatillas: "textil",
  chaqueta: "textil", sudadera: "textil", bufanda: "textil",
  albornoz: "textil", sujetador: "textil", percha: "menaje",
  colchon: "textil", sombrilla: "jardin", cenador: "jardin",
  // plancha/microondas/cafetera/sierra sólo deciden en cabeza: dentro de un
  // nombre de comida significan técnica de cocina o lugar de origen
  // ("a la plancha", "para microondas", "queso de la Sierra").
  afilador: "menaje", escurreplatos: "menaje", estante: "menaje",
  rinconera: "menaje", organizador: "menaje", marcadores: "papeleria",
  sombrillas: "jardin", colchones: "textil",
  perchas: "menaje", textileno: "jardin",
  sarten: "menaje", sartenes: "menaje", cazuela: "menaje",
  cacerola: "menaje", vajilla: "menaje", cuberteria: "menaje",
  rallador: "menaje", abrelatas: "menaje", taper: "menaje",
  tapers: "menaje", tupper: "menaje", tuppers: "menaje",
  sacacorchos: "menaje", exprimidor: "menaje", fiambrera: "menaje",
  cantimplora: "menaje", jarron: "menaje", portafotos: "menaje",
  puf: "menaje", taburete: "menaje", estanteria: "menaje",
  ensaladera: "menaje", mug: "menaje", bowl: "menaje",
  termo: "menaje",
  cuaderno: "papeleria", boligrafo: "papeleria", rotulador: "papeleria",
  grapadora: "papeleria", archivador: "papeleria", folios: "papeleria",
  plastilina: "papeleria", neumatico: "automovil",
  limpiaparabrisas: "automovil", anticongelante: "automovil",
};

// --- Cabeza de nombre ------------------------------------------------------
//
// Sólo cuentan si abren el nombre, que es donde va el sustantivo que dice qué ES
// el producto. De modificador significan otra cosa: "copa" abre una copa de
// cristal (menaje) pero en "copa menstrual" es higiene.
const CABEZA = {
  // Vajilla y utensilios reutilizables. Sólo deciden en cabeza, y son seguros
  // porque la vajilla desechable la protege una regla anterior.
  cuchillo: "menaje", cuchillos: "menaje", cuchara: "menaje", cucharas: "menaje",
  cucharon: "menaje", tenedor: "menaje", tenedores: "menaje", taza: "menaje",
  tazas: "menaje", jarra: "menaje", cazo: "menaje", cesta: "menaje",
  tijeras: "menaje", mantel: "textil", manteles: "textil",
  funda: "textil", fundas: "textil", manta: "textil", mantas: "textil",
  toalla: "textil", toallas: "textil", gorro: "textil", zapato: "textil",
  botas: "textil", mochila: "textil", bolso: "textil", maleta: "textil",
  hamaca: "jardin",
 copa: "menaje", copas: "menaje",
 
 
 
 
 bote: null, 
  marco: "decoracion", cuadro: "decoracion", espejo: "decoracion",
  lampara: "decoracion", figura: "decoracion", adorno: "decoracion",
  guirnalda: "decoracion", reloj: "decoracion", jarra_: "menaje",
  juego: "menaje", silla: "menaje", sillon: "menaje", mesa: "menaje",
  plancha: "electrodomesticos", microondas: "electrodomesticos",
  cafetera: "electrodomesticos", sierra: "bricolaje", parrilla: "menaje",
  // Vistas en el pasillo de oportunidades de aldi. Van en cabeza y no en
  // cualquier posición porque son palabras que de modificador cambian de
  // sentido ("huevos vestidos", "arroz de la arrocera").
  vestido: "textil", vestidos: "textil", sandalias: "textil",
  sandalia: "textil", chandal: "textil", sello: "papeleria",
  sellos: "papeleria", estampador: "papeleria", maletin: "papeleria",
  arrocera: "electrodomesticos",
  cable: "tecnologia", pintura: "bricolaje", brocha: "bricolaje",
  pegamento: "bricolaje", cinta: "bricolaje", silicona: "bricolaje",
  tierra: "jardin", abono: "jardin", libro: "libros",
  libreta: "papeleria", agenda: "papeleria", calendario: "papeleria",
  lapiz: "papeleria", goma: "papeleria",
  sobre: null, // "sobre" también es unidad de medida: nunca decide
  pack: null, kit: "menaje",
};

// Discutibles: no se descartan, se marcan para que decida una persona. Las pilas
// y las bombillas son consumibles de hogar aunque no sean comida ni limpieza; un
// vaso puede ser de plástico desechable (entra) o de cristal (no entra).
const DUDOSOS = new Set([
  // Menaje que se cruza con el desechable de cocina: un plato puede ser de loza
  // (fuera) o de cartón (dentro), así que decide una persona.
  "plato", "platos", "bol", "bandeja", "recipiente", "molde", "moldes",
  "cubo", 
  "tabla",
  "pila", "pilas", "bombilla", "bombillas", "vela", "velas", "linterna",
  "vaso", "vasos", "cubiertos", "pajitas", "mechero", "encendedor",
  "cepillo", "esponja", "peine", "cortauñas", "pinzas", "termometro",
  "coche", "carrito", "cuna", "bañera", "orinal", "guantes", 
  "palillos", "velas", "papel", "bolsa", "bolsas",
]);

// --- Especificaciones técnicas --------------------------------------------
//
// Un producto de supermercado no se describe por pulgadas, vatios ni escalas de
// maqueta.
const ESPECIFICACIONES = [
  [/\b\d+([.,]\d+)?\s*(pulgadas?|")\B/, "pulgadas"],
  [/\b\d+\s*w\b/, "vatios"],
  [/\b\d+\s*mah\b/, "mAh"],
  [/\b\d+\s*rpm\b/, "rpm"],
  [/\b\d+\s*lumenes\b/, "lúmenes"],
  [/\bescala 1[:.]\d+/, "escala de maqueta"],
  [/\b1[:.]\d{2}\b/, "escala de maqueta"],
  [/\bkm\/h\b/, "velocidad"],
  [/\b(usb|hdmi|wifi)\b/, "conectividad"],
  [/\bg\s*\/\s*m2?\b/, "gramaje textil"],
  [/\bantiadherente\b/, "utensilio de cocina"],
  [/\bapta? para (induccion|vitro|lavavajillas|horno y microondas)\b/, "utensilio de cocina"],
];

// --- Frases inequívocas ---------------------------------------------------
const FRASES = [
  [/\bfunda nordica\b/, "textil"],
  [/\bjuego de (sabanas|toallas|fundas|copas|platos|cubiertos|vasos|maletas)\b/, "menaje"],
  [/\bgorro de (natacion|ducha|lana)\b/, "textil"],
  [/\bacumulador(es)? de frio\b/, "menaje"],
  [/\baceite (de motor|lubricante|para motor)\b/, "automovil"],
  [/\b(motores? gasolina|catalizador gasolina|aditivo limpiador)\b/, "automovil"],
  [/\bpapel (de regalo|pintado|de lija|continuo)\b/, "papeleria"],
  [/\bbolsa de (viaje|deporte|aseo|playa)\b/, "textil"],
  [/\bcopa de (vino|cristal|champan|cava|balon)\b/, "menaje"],
  [/\bvaso de (cristal|tubo|sidra|vidrio)\b/, "menaje"],
  [/\bcinta (adhesiva|aislante|de embalar|elastica|metrica|termoadhesiva)\b/, "bricolaje"],
  [/\bbateria (externa|de coche|recargable)\b/, "tecnologia"],
  [/\bcubo de (basura|fregar)\b/, "menaje"],
  [/\btabla de (planchar|cortar|surf)\b/, "menaje"],
  // Un taper es menaje; las bolsas de basura y congelación ya están protegidas
  // antes, así que una "bolsa" que llega hasta acá es una bolsa isotérmica.
  [/\b(recipiente|recipientes|taper|tapers|tupper)\b[^]*\bhermetic/, "menaje"],
  [/\bhermetic\w*[^]*\b(recipiente|recipientes|taper|tapers|tupper)\b/, "menaje"],
  [/\bbolsa\w*\b[^]*\b(termica|isotermica|porta alimentos|de compra)\b/, "menaje"],
  [/\bbolsa\w*\b[^]*\bnevera\b/, "menaje"],
  [/\bkit de costura\b/, "bricolaje"],
  [/\bcarro de (compra|la compra)\b/, "menaje"],
  [/\bclase energetica\b/, "electrodomesticos"],
  [/\bluz solar\b/, "jardin"],
  [/\bdobladillo\b/, "bricolaje"],
];

// --- Material + dimensión -------------------------------------------------
//
// Un objeto se describe por el material Y su tamaño ("Taza de porcelana de
// 72cl", "Sartén de aluminio de 32cm"). Un alimento o un cosmético no: por eso
// la regla exige las dos señales juntas. El material solo daba falsos positivos
// ("Lima fibra de vidrio" es cosmética, "Estropajo acero inoxidable" es
// limpieza), y la dimensión sola se cruza con el papel de horno y las bolsas.
const MATERIALES = /\b(porcelana|gres|vidrio|borosilicato|cristal|acero|inoxidable|nylon|poliester|microfibra|resina|mimbre|melamina|ceramica|bambu|carton|hierro fundido|aluminio fundido|laton|pvc|poliuretano|terciopelo|acrilico|loza|estano|peltre|madera)\b/;
const DIMENSIONES = /(\d+[.,]?\d*\s*x\s*\d+[.,]?\d*|\b\d+[.,]?\d*\s*(cm|mm|cl|ml|litros?)\b\.?)/;

function tokens(normalized) {
  return normalized.split(" ").map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean);
}

// Arranques que no dicen qué es el producto: hay que mirar más allá para
// encontrar el sustantivo ("Set de 24 piezas de cubiertos", "Pack de 6 vasos").
const ARRANQUES_VACIOS = new Set([
  "pack", "lote", "surtido", "caja", "set", "juego", "kit", "estuche",
  "de", "del", "la", "el", "los", "las", "y", "con", "para", "en", "a",
  "piezas", "pieza", "unidades", "uds", "ud",
]);

function cabezaDeNombre(lista) {
  for (const token of lista) {
    // Los números tampoco son la cabeza: "10 vasos de carton" es un vaso.
    if (!ARRANQUES_VACIOS.has(token) && !/^\d+$/.test(token)) return token;
  }
  return lista[0];
}

// Marcas propias que siempre son de alcance: Deliplus es la de cosmética e
// higiene de mercadona y Bosque Verde la de limpieza, así que todo lo que las
// lleva entra por definición, aunque el nombre hable de cubos o de platos.
const MARCAS_DE_ALCANCE = {
  mercadona: /\b(deliplus|bosque verde)\b/,
  // P&H: verificado, sus 16 productos son vajilla desechable de fiesta. El & se
  // pierde al normalizar el nombre, así que llega como "p h".
  alcampo: /\bp h\b/,
};

function marcaDeAlcance(supermercado) {
  return MARCAS_DE_ALCANCE[String(supermercado || "").toLowerCase()] || null;
}

function marcasNoAlimentarias(supermercado) {
  // Por cadena a propósito: "ESSENTIAL" es menaje en alcampo pero "Carrefour
  // Essential" es comida, y "Power Essential" es un lavavajillas de mercadona.
  if (String(supermercado || "").toLowerCase() !== "alcampo") return null;
  return /\b(actuel|versa|quid|gardenstar|one two fun|liragram|stonewear|qilive|in extenso|essential|essentiel|tatay|monix|mondex|metaltex|pikolin|belmarti|misipa|sodastream|3 claveles)\b/;
}

// Devuelve { decision, motivo, familia }. No toca la base ni borra nada.
function classify(product) {
  const normalized = normalizeName(product.name);
  const lista = tokens(normalized);
  if (!lista.length) return { decision: MANTENER, motivo: null, familia: null };

  // 0. Lo irrefutable gana incluso a las protecciones.
  for (const token of lista) {
    if (IRREFUTABLES.has(token)) {
      const familia = INEQUIVOCOS[token] || "bazar";
      return { decision: DESCARTAR, motivo: `palabra irrefutable: "${token}"`, familia };
    }
  }

  // 1. Protecciones: ganan a todo lo que venga después.
  const deAlcance = marcaDeAlcance(product.supermercado);
  if (deAlcance) {
    const hit = normalized.match(deAlcance);
    if (hit) {
      return {
        decision: MANTENER,
        motivo: `protegido: marca de alcance "${hit[0]}"`,
        familia: null,
        nivel: FUERTE,
      };
    }
  }
  const noEsVajilla = NO_ES_VAJILLA.test(normalized);
  for (const [re, nivel, esVajilla] of PROTECCIONES) {
    if (esVajilla && noEsVajilla) continue;
    const hit = normalized.match(re);
    if (hit) {
      return { decision: MANTENER, motivo: `protegido: "${hit[0].trim()}"`, familia: null, nivel };
    }
  }
  // Un kilo o un litro es consumible; el bazar se vende por unidades.
  const unidad = (product.measure_unit || "").toLowerCase().trim();
  if (unidad === "kg" || unidad === "l") {
    // El envase no dice qué es el producto: la pintura y el sustrato también se
    // venden por litro. Nunca puede contradecir a una categoría.
    return {
      decision: MANTENER,
      motivo: `protegido: se vende por ${unidad}`,
      familia: null,
      nivel: CONTEXTUAL,
    };
  }

  // 2. Frases y especificaciones técnicas.
  for (const [re, familia] of FRASES) {
    const hit = normalized.match(re);
    if (hit) return { decision: DESCARTAR, motivo: `frase inequívoca: "${hit[0].trim()}"`, familia };
  }
  for (const [re, etiqueta] of ESPECIFICACIONES) {
    const hit = normalized.match(re);
    if (hit) {
      return { decision: DESCARTAR, motivo: `especificación de objeto (${etiqueta}): "${hit[0].trim()}"`, familia: "bazar" };
    }
  }

  // 3. Palabras imposibles en un supermercado, en cualquier posición.
  for (const token of lista) {
    // Se prueba también sin la -s final: los nombres alternan singular y plural
    // ("puzzle"/"puzzles") y no vale la pena duplicar cada entrada.
    const familia = INEQUIVOCOS[token] || (token.endsWith("s") ? INEQUIVOCOS[token.slice(0, -1)] : undefined);
    if (familia) return { decision: DESCARTAR, motivo: `palabra inequívoca: "${token}"`, familia };
  }

  // 4. Marca propia no alimentaria de la cadena.
  const marcas = marcasNoAlimentarias(product.supermercado);
  if (marcas) {
    const hit = normalized.match(marcas);
    if (hit) {
      return { decision: DESCARTAR, motivo: `marca no alimentaria de la cadena: "${hit[0]}"`, familia: "bazar" };
    }
  }

  // 5. Material + dimensión: describe un objeto, no un consumible.
  const material = normalized.match(MATERIALES);
  if (material) {
    const dimension = normalized.match(DIMENSIONES);
    if (dimension) {
      return {
        decision: DESCARTAR,
        motivo: `material + dimensión: "${material[0]}" + "${dimension[0].trim()}"`,
        familia: "bazar",
      };
    }
  }

  // 6. Vendido por metros: cintas, velcro, tela.
  if (unidad === "m" || unidad === "metro") {
    return { decision: DESCARTAR, motivo: "se vende por metros", familia: "bricolaje" };
  }

  // 7. Sustantivo inicial.
  const cabeza = cabezaDeNombre(lista);
  const cabezaSingular = cabeza.endsWith("s") ? cabeza.slice(0, -1) : cabeza;
  if (DUDOSOS.has(cabeza) || DUDOSOS.has(cabezaSingular)) {
    return { decision: DUDOSO, motivo: `cabeza ambigua: "${cabeza}"`, familia: null };
  }
  if (Object.prototype.hasOwnProperty.call(CABEZA, cabeza)) {
    const familia = CABEZA[cabeza];
    if (familia === null) return { decision: MANTENER, motivo: null, familia: null };
    return { decision: DESCARTAR, motivo: `cabeza de nombre: "${cabeza}"`, familia };
  }

  return { decision: MANTENER, motivo: null, familia: null };
}


// --- Categorías fuera de alcance -------------------------------------------
//
// Donde la categoría de la cadena SÍ es fiable, decide ella y no hace falta
// mirar el nombre: es determinista y se audita de un vistazo (diez líneas en vez
// de ocho mil nombres). Salió de revisar las 1.388 categorías reales.
//
// Ojo con lo que NO está: "Mascotas" entra (el usuario las incluyó), "Limpieza y
// hogar" de dia y aldi entra, "Decoración para repostería" de ahorramás es comida,
// y los estropajos y detergentes de mercadona son limpieza. Casi todas las
// categorías que suenan a bazar en las cadenas limpias son de alcance.
const CATEGORIAS_FUERA_DE_ALCANCE = {
  alcampo: new Set([
    "Bricolaje", "Tecnología", "Papelería", "Electrodomésticos", "Juguetes",
    "Libros", "Jardín y terraza", "Automóvil", "Textil", "Deportes y Maletas",
  ]),
  ahorramas: new Set([
    "Cordones y plantillas para zapatos", "Papelería", "Herramientas de jardinería",
    "Utensilios de cocina", "Tablas de planchar y cuidado de la ropa",
  ]),
  bm: new Set(["Bazar", "Resto artículos bazar", "Bricolaje y jardinería", "Papelería y pintura"]),
};

// lidl guarda la ruta completa separada por "/", así que se corta por prefijo.
const PREFIJOS_FUERA_DE_ALCANCE = {
  lidl: [
    "Tienda de bricolaje y jardín/",
    "Moda y accesorios/",
    "Bebés, niños y juguetes/Juguetes",
    "Deporte y ocio/Bicicleta",
  ],
};

// Categorías que mezclan bazar y compra, así que su etiqueta no decide nada y
// hay que mirar el nombre producto a producto. Es la corrección al error de
// purgar por etiqueta: "Hogar y Decoración" tiene sartenes y también papel de
// aluminio y bolsas de basura.
const CATEGORIAS_NO_FIABLES = {
  alcampo: new Set(["Folletos y Promociones", "Campañas", "Hogar y Decoración"]),
};

function categoriaFueraDeAlcance(supermercado, category) {
  const cadena = String(supermercado || "").toLowerCase();
  if (!category) return false;
  const exactas = CATEGORIAS_FUERA_DE_ALCANCE[cadena];
  if (exactas && exactas.has(category)) return true;
  const prefijos = PREFIJOS_FUERA_DE_ALCANCE[cadena] || [];
  return prefijos.some((prefijo) => category.startsWith(prefijo));
}

function categoriaNoFiable(supermercado, category) {
  // Sin categoría no hay etiqueta en la que confiar, así que hay que mirar el
  // nombre. Es lo que pasa con las 103 filas sin categoría de aldi, que son su
  // pasillo de oportunidades: sartenes, destornilladores, pijamas y freidoras.
  // Tratarlas como fiables las dejaba dentro del catálogo sin revisar.
  if (!category || !String(category).trim()) return true;
  const set = CATEGORIAS_NO_FIABLES[String(supermercado || "").toLowerCase()];
  return Boolean(set && set.has(category));
}

// Decisión completa.
//
// El orden importa y costó tres rondas acertarlo. Lo que manda es esto: una
// protección es evidencia POSITIVA de que el producto es de alcance, y eso tiene
// que ganarle a la etiqueta que le puso el retailer. Si no, una decisión explícita
// del usuario acaba dependiendo de en qué pasillo metió la cadena el producto:
// 197 packs de pilas alcalinas se borraban por estar catalogados en "Bricolaje",
// aunque el usuario había dicho que las pilas se quedan.
//
// Pero sólo cruza esa frontera la evidencia positiva, no toda la clasificación por
// nombre. Un DESCARTAR por nombre NO puede ganarle a una categoría fiable y de
// alcance, porque el clasificador de nombres tiene falsos positivos y ahí es donde
// harían daño: sobre las 54.000 filas que hoy están protegidas por tener una
// etiqueta buena. Medido, invertir la cascada del todo mete un falso positivo en
// las cadenas limpias ("Bolsa isotérmica" de mercadona, catalogada en "Menaje y
// conservación de alimentos"), y con la cascada así hay cero.
//
// Resumen: la protección gana siempre; el resto del nombre sólo decide donde la
// etiqueta no es de fiar.
function decide(product) {
  const porNombre = classify(product);

  // Evidencia positiva de que es de alcance (pilas, velas, desechables, comida,
  // limpieza, higiene...): gana a cualquier categoría.
  if (porNombre.decision === MANTENER && porNombre.nivel === FUERTE) {
    return { ...porNombre, via: "proteccion" };
  }

  if (categoriaFueraDeAlcance(product.supermercado, product.category)) {
    return {
      decision: DESCARTAR,
      motivo: `categoría fuera de alcance: "${product.category}"`,
      familia: "categoria",
      via: "categoria",
    };
  }
  if (categoriaNoFiable(product.supermercado, product.category)) {
    return { ...porNombre, via: "nombre" };
  }
  // Categoría fiable y de alcance: se queda, sin dejar que el nombre la contradiga.
  return { decision: MANTENER, motivo: null, familia: null, via: "categoria" };
}

module.exports = {
  classify,
  decide,
  categoriaFueraDeAlcance,
  categoriaNoFiable,
  CATEGORIAS_FUERA_DE_ALCANCE,
  CATEGORIAS_NO_FIABLES,
  MANTENER,
  DESCARTAR,
  DUDOSO,
  FUERTE,
  CONTEXTUAL,
  PROTECCIONES,
  INEQUIVOCOS,
  CABEZA,
};
