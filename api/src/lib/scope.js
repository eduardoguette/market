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
const PROTECCIONES = [
  // Productos de limpieza cuyo nombre menciona el objeto que limpian
  /\blimpia(dor|cristales|hogar|muebles|metales|suelos)?\b/,
  /\b(quitagrasas|desengrasante|abrillantador|desincrustante|antical|desatascador)\b/,
  /\b(detergente|lejia|suavizante|friegasuelos|lavavajillas|amoniaco|salfuman|sosa caustica)\b/,
  /\b(estropajo|fregona|bayeta|mopa|trapo|recambio de fregona|paño de cocina|panos? de cocina)\w*/,
  /\b(ambientador|insecticida|antipolillas|desinfectante|quitamanchas|blanqueador|raticida)\b/,
  /\bguantes? de (fregar|limpieza|latex|vinilo|nitrilo)\b/,

  // Comida y bebida donde la palabra base es ambigua
  /\baceite de (oliva|girasol|coco|semillas|colza|palma|orujo)\b/,
  /\baceite (virgen|refinado|de sabor)\b/,
  /\b(goma de mascar|chicle)/,
  /\bsemillas? de \w+/,
  /\bcopa de (helado|postre)\b/,
  /\bplatos? (preparado|combinado)/,
  /\bvasito/,
  /\bcaldo\b/,
  /\bpiña\b/,


  // Comida preparada: es comida y va en la lista de la compra. Necesita
  // protección propia porque sus nombres llevan justo las palabras de utensilio
  // y de técnica de cocina que sirven para detectar bazar ("hamburguesa a la
  // plancha", "bandeja de croquetas", "palomitas para microondas").
  /\b(tortilla|hamburguesa|croqueta|ensaladilla|pizza|canelon|lasaña|lasana|empanad|rebozad|precocinad|albondiga|nugget|flamenquin|san jacobo|paella|fideua|risotto|salchicha|escalope|brocheta|pincho|gazpacho|salmorejo|sopa|pure|guiso|estofado|cocido|fabada|callos|migas|salteado|wok|burrito|taco|falafel|hummus|sushi|tortellini|ravioli|noqui|ñoqui|arancini|samosa|quiche|tarta|bocadillo|sandwich|wrap|kebab|pollo asado|asado)\w*/,
  /\b(a la (plancha|sarten|parrilla|brasa|barbacoa|romana)|al horno|al vapor|frito|asad[oa])\b/,
  /\bpalomitas\b/,
  /\bpara (cafetera|microondas|freidora|sandwichera)\b/,


  // Vajilla desechable y velas: decisión de producto, entran en el catálogo.
  //
  // La vajilla desechable se compra en el súper junto a las servilletas y el papel
  // de aluminio, así que es consumible de hogar, la misma línea que el papel
  // higiénico. Va como protección (y no como excepción más abajo) porque tiene que
  // ganarle a la regla de marca: ACTUEL vende bazar Y desechables, y al mirarse la
  // marca antes que el tipo de producto los tenedores de cartón de ACTUEL
  // acababan en la lista de borrado mientras los vasos de cartón de NUPIK, misma
  // cosa, sólo llegaban a dudoso.
  //
  // "reutilizable" queda fuera a propósito: un vaso de plástico reutilizable es
  // menaje, y así lo deciden las reglas de más abajo en vez de esta protección.
  /\b(desechable|un solo uso|monouso)\w*(?![^]*reutilizab)/,
  /\b(plato|platos|vaso|vasos|copa|copas|cubierto|cubiertos|tenedor|tenedores|cuchara|cucharas|cuchillo|cuchillos|mantel|manteles|bandeja|bandejas|bol|boles|cuenco|servilleta|servilletas|pajita|pajitas|palillo|palillos)\b[^]*\b(carton|papel|plastico|poliestireno|celulosa|pla)\b/,
  /\b(carton|papel|plastico|poliestireno)\b[^]*\b(plato|platos|vaso|vasos|copa|copas|cubierto|cubiertos|tenedor|tenedores|cuchara|cucharas|cuchillo|cuchillos|mantel|manteles|bandeja|bandejas|bol|boles|cuenco|servilleta|servilletas|pajita|pajitas)\b/,
  // Las velas se venden en supermercado de verdad: mercadona tiene su propia
  // categoría "Velas y decoración". Sacarlas de alcampo y dejarlas en mercadona
  // sería incoherente entre cadenas.
  /\bvela\w*\b/,

  // Papel, film y desechables de cocina: entran
  /\bpapel (higienico|de cocina|de horno|film|de aluminio|aluminio|absorbente|vegetal|de secar)\b/,
  /\bservilletas?\b/,
  /\bfilm (transparente|de cocina|adherente)\b/,
  /\bbolsas? (de )?(basura|congelacion|conservacion|hielo|horno|sandwich|zip|fruta)\b/,
  /\brollo de cocina\b/,
  /\bmanteles? de papel\b/,

  // Cuidado personal y parafarmacia: entran
  /\b(champu|acondicionador|gel de baño|gel de ducha|gel de manos|jabon|pasta de dientes|dentifrico|colutorio|enjuague bucal)\b/,
  /\b(desodorante|antitranspirante|colonia|perfume|eau de (toilette|parfum)|after ?shave|espuma de afeitar)\b/,
  /\b(crema|serum|locion|mascarilla|exfoliante|tonico|contorno de ojos|protector solar|aftersun|fluido)\b/,
  /\b(maquillaje|rimel|mascara de pestañas|pintalabios|barra de labios|esmalte|laca de uñas|corrector|colorete|sombra de ojos|delineador)\b/,
  /\b(compresa|tampon|salvaslip|copa menstrual|protegeslip|higiene intima)\w*/,
  /\b(pañal|panal|toallita|bastoncillo|discos? desmaquillante|gasa)\w*/,
  /\balgodon (hidrofilo|magico)\b|\bdiscos? de algodon\b/,
  /\b(cepillo de dientes|cepillo dental|seda dental|hilo dental|cinta dental|irrigador|colutorio)\b/,
  /\bbrocha (de maquillaje|para polvos)\b/,
  /\bmolde de papel\b/,
  /\b(cuchillas?|maquinilla) de afeitar\b/,
  /\b(preservativo|lubricante intimo|test de embarazo|suero fisiologico|alcohol sanitario|agua oxigenada|tirita|venda|esparadrapo)\w*/,
  /\b(ibuprofeno|paracetamol|aspirina|jarabe|vitamina|complemento alimenticio|suplemento|probiotico)\b/,
  /\b(tinte|coloracion|decolorante|champu|mascarilla capilar)\b/,
  /\bmascarilla (ffp2|quirurgica|higienica)\b/,
  /\blima (de uñas|fibra)\b/,
  /\b(quitaesmalte|acetona)\b/,

  // Bebé consumible y mascotas: entran
  /\b(potito|papilla|leche infantil|cereales infantiles|tarrito)\w*/,
  /\b(pienso|snack para (perro|gato)|arena (para|de) gato|lecho para gato|comida (para|de) (perro|gato|ave|pez|roedor))\b/,
  /\b(tetina|chupete|biberon)\w*/,
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
    if (hit) return { decision: MANTENER, motivo: `protegido: marca de alcance "${hit[0]}"`, familia: null };
  }
  for (const re of PROTECCIONES) {
    const hit = normalized.match(re);
    if (hit) return { decision: MANTENER, motivo: `protegido: "${hit[0].trim()}"`, familia: null };
  }
  // Un kilo o un litro es consumible; el bazar se vende por unidades.
  const unidad = (product.measure_unit || "").toLowerCase().trim();
  if (unidad === "kg" || unidad === "l") {
    return { decision: MANTENER, motivo: `protegido: se vende por ${unidad}`, familia: null };
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
  const set = CATEGORIAS_NO_FIABLES[String(supermercado || "").toLowerCase()];
  return Boolean(set && category && set.has(category));
}

// Decisión completa: primero la categoría cuando es fiable, y sólo si no lo es se
// mira el nombre. Así la inferencia por nombre no se aplica donde ya hay una
// etiqueta buena, que sería cambiar un dato cierto por una conjetura.
function decide(product) {
  if (categoriaFueraDeAlcance(product.supermercado, product.category)) {
    return {
      decision: DESCARTAR,
      motivo: `categoría fuera de alcance: "${product.category}"`,
      familia: "categoria",
      via: "categoria",
    };
  }
  if (categoriaNoFiable(product.supermercado, product.category)) {
    return { ...classify(product), via: "nombre" };
  }
  // Categoría fiable y de alcance: se queda, sin mirar el nombre.
  return { decision: MANTENER, motivo: null, familia: null, via: "categoria" };
}

module.exports = {
  classify,
  decide,
  categoriaFueraDeAlcance,
  categoriaNoFiable,
  CATEGORIAS_FUERA_DE_ALCANCE,
  CATEGORIAS_NO_FIABLES, MANTENER, DESCARTAR, DUDOSO, PROTECCIONES, INEQUIVOCOS, CABEZA };
