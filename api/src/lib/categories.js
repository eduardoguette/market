// Taxonomía canónica: traduce la categoría propia de cada cadena a un cajón común
// para poder navegar el catálogo igual en las nueve.
//
// El problema que resuelve: las 1.371 categorías del catálogo están capturadas a
// niveles distintos y con calidades distintas. Alcampo da raíces gruesas
// ("Alimentación", 3.332 productos), mercadona hojas descriptivas ("Leche y bebidas
// vegetales"), bm hojas que no se describen solas ("Seco", "Húmedo", "Envasado") y
// ahorramás mezcla pasillos con campañas comerciales ("Black Friday", "Día del
// Padre", "Mondelez"). Comparar "Alimentación" con "Sazonadores" es un error de
// categoría, no una diferencia de nombres.
//
// Se resuelve en tres pasadas, de más fiable a menos:
//
//   1. ruta (`category_path`): prefijo más largo. Es lo mejor porque la raíz de la
//      cadena ya es un cajón, y las raíces envejecen mucho menos que las hojas.
//   2. etiqueta exacta: para las cadenas cuya `category` ya es utilizable.
//   3. palabra clave sobre la etiqueta: cubre la cola larga sin escribir mil
//      entradas a mano.
//
// Y tres salidas posibles, que es lo que hace que el mapa sirva también de filtro
// de alcance:
//
//   - un cajón canónico
//   - FUERA_DE_ALCANCE: bazar, se guarda pero no se navega
//   - NO_FIABLE: la etiqueta miente y hay que mirar el nombre del producto
//     (las campañas de ahorramás, los "Folletos y Promociones" de alcampo)
//
// Lo que no resuelve ninguna pasada queda sin cajón (`null`), que es honesto y
// visible: `npm run categorias:cobertura` lista lo no mapeado por volumen para que
// el trabajo manual vaya siempre a lo que más pesa.

const FUERA_DE_ALCANCE = "__fuera_de_alcance__";
const NO_FIABLE = "__no_fiable__";

// Los cajones. `alimentacion` distingue comida de lo que se compra en el súper sin
// ser comida, para que la UI pueda agrupar o esconder sin saber de taxonomías.
const CANONICAS = [
  { id: "frutas_verduras", nombre: "Frutas y verduras", alimentacion: true },
  { id: "carne", nombre: "Carne", alimentacion: true },
  { id: "pescado_marisco", nombre: "Pescado y marisco", alimentacion: true },
  { id: "charcuteria_quesos", nombre: "Charcutería y quesos", alimentacion: true },
  { id: "lacteos_huevos", nombre: "Lácteos y huevos", alimentacion: true },
  { id: "panaderia_bolleria", nombre: "Panadería y bollería", alimentacion: true },
  { id: "despensa", nombre: "Despensa", alimentacion: true },
  { id: "pasta_arroz_legumbres", nombre: "Pasta, arroz y legumbres", alimentacion: true },
  { id: "cereales_galletas", nombre: "Cereales y galletas", alimentacion: true },
  { id: "dulces_chocolate", nombre: "Dulces y chocolate", alimentacion: true },
  { id: "snacks", nombre: "Aperitivos y snacks", alimentacion: true },
  { id: "congelados", nombre: "Congelados", alimentacion: true },
  { id: "platos_preparados", nombre: "Platos preparados", alimentacion: true },
  { id: "bebidas", nombre: "Bebidas", alimentacion: true },
  { id: "bebidas_alcohol", nombre: "Cerveza, vino y licores", alimentacion: true },
  { id: "cafe_te", nombre: "Café, té e infusiones", alimentacion: true },
  { id: "bebe", nombre: "Bebé", alimentacion: false },
  { id: "mascotas", nombre: "Mascotas", alimentacion: false },
  { id: "higiene_personal", nombre: "Higiene personal", alimentacion: false },
  { id: "cosmetica_perfumeria", nombre: "Cosmética y perfumería", alimentacion: false },
  { id: "parafarmacia", nombre: "Parafarmacia", alimentacion: false },
  { id: "limpieza_drogueria", nombre: "Limpieza y droguería", alimentacion: false },
  { id: "papel_desechables", nombre: "Papel y desechables", alimentacion: false },
  { id: "pilas_iluminacion", nombre: "Pilas e iluminación", alimentacion: false },
];

const ID_CANONICAS = new Set(CANONICAS.map((c) => c.id));

// Etiquetas exactas, por cadena. Sólo para las cadenas cuya `category` ya sirve:
// alcampo y dia dan raíces, mercadona y lasirena hojas descriptivas, aldi una
// mezcla. Se escribe la etiqueta tal cual la emite la cadena.
const POR_ETIQUETA = {
  alcampo: {
    // Las siete raíces gruesas de alcampo NO van aquí, por el mismo motivo que
    // "Frescos": son departamentos enteros, no pasillos. "Alimentación" (3.332
    // productos) es la despensa MÁS la pasta, el arroz, las legumbres, los
    // aperitivos, las conservas y el pan de molde; "Bebidas" (2.333) mete 1.100
    // botellas de vino, cerveza y whisky en el mismo cajón que el agua mineral.
    // Están en DEPARTAMENTOS, que las resuelve por el nombre del producto.
    "Leche, Huevos, Lácteos, Yogures y Bebidas vegetales": "lacteos_huevos",
    "Congelados": "congelados",
    "Bebé": "bebe",
    "Parafarmacia": "parafarmacia",
    "Mascotas": "mascotas",
    "Comida Preparada": "platos_preparados",
    // Mezclan bazar y compra: la etiqueta no decide, decide el nombre.
    "Folletos y Promociones": NO_FIABLE,
    "Campañas": NO_FIABLE,
    "Hogar y Decoración": NO_FIABLE,
    // Los productos que quedan en estas categorías tras la limpieza son pilas y
    // bombillas rescatadas, así que la etiqueta miente sobre lo que queda dentro.
    "Bricolaje": NO_FIABLE,
    "Automóvil": NO_FIABLE,
    "Electrodomésticos": NO_FIABLE,
    "Jardín y terraza": NO_FIABLE,
    "Tecnología": NO_FIABLE,
    "Libros": FUERA_DE_ALCANCE,
    "Juguetes": FUERA_DE_ALCANCE,
    "Papelería": FUERA_DE_ALCANCE,
    "Deportes y Maletas": FUERA_DE_ALCANCE,
  },
  dia: {
    "Cervezas, vinos y licores": "bebidas_alcohol",
    "Chocolates y golosinas": "dulces_chocolate",
    "Conservas, caldos y cremas": "despensa",
    "Aceites, salsas y especias": "despensa",
    "Aperitivos y frutos secos": "snacks",
    "Agua y refrescos": "bebidas",
    "Congelados y helados": "congelados",
    "Café, cacao e infusiones": "cafe_te",
    "Arroz, pastas y legumbres": "pasta_arroz_legumbres",
    "Charcutería": "charcuteria_quesos",
    "Yogures y postres": "lacteos_huevos",
    "Mascotas": "mascotas",
    "Huevos, leche y mantequilla": "lacteos_huevos",
    "Infantil": "bebe",
    "Panadería": "panaderia_bolleria",
    "Quesos": "charcuteria_quesos",
    "Zumos y smoothies": "bebidas",
    "Platos preparados y pizzas": "platos_preparados",
    "Verduras": "frutas_verduras",
    "Pescados y mariscos": "pescado_marisco",
    "Carnes": "carne",
    "Salud y parafarmacia": "parafarmacia",
    "Frutas": "frutas_verduras",
    "Congelados": "congelados",
    "Charcutería y quesos": "charcuteria_quesos",
    "Azúcar, chocolates y caramelos": "dulces_chocolate",
    "Perfumería, higiene, salud": "cosmetica_perfumeria",
  },
  aldi: {
    "Despensa": "despensa",
    "Congelados": "congelados",
    "Charcutería": "charcuteria_quesos",
    "Chocolates y dulces": "dulces_chocolate",
    "Platos preparados y pizzas": "platos_preparados",
    "Aperitivos": "snacks",
    "Quesos": "charcuteria_quesos",
    "Panadería y bollería": "panaderia_bolleria",
    "Bebidas alcohólicas": "bebidas_alcohol",
    "Desayuno": "cereales_galletas",
    "Mascotas": "mascotas",
    "Café, cacao e infusiones": "cafe_te",
    "Bebidas": "bebidas",
    "Bebé e infantil": "bebe",
    "Lácteos y huevos": "lacteos_huevos",
    "Yogures y postres lacteos": "lacteos_huevos",
    "Carnes empanadas y preparados": "platos_preparados",
    "Frutas": "frutas_verduras",
    "Verduras y hortalizas": "frutas_verduras",
    "Agua": "bebidas",
    "Ternera": "carne",
    "Cerdo": "carne",
    "Hamburguesas y carne picada": "carne",
    "Lechugas y ensaladas": "frutas_verduras",
    "Mariscos": "pescado_marisco",
    "Pollo y pavo": "carne",
    // "Verano" y "Marcas" son secciones comerciales, no pasillos.
    "Verano": NO_FIABLE,
    "Marcas": NO_FIABLE,
  },
  lasirena: {
    "Helados": "congelados",
    "Platos preparados": "platos_preparados",
    "No congelados": NO_FIABLE,
    "Verdura": "frutas_verduras",
    "Pescado": "pescado_marisco",
    "Precocinados": "platos_preparados",
    "Marisco": "pescado_marisco",
    "Pizzas": "platos_preparados",
    "Pasteleria": "panaderia_bolleria",
    "100 vegetal": "despensa",
    "Carne": "carne",
    "Comida para mascotas": "mascotas",
  },
  carrefour: {
    // Un único valor para todo el catálogo, pizzas incluidas: es un bug del
    // scraper, no una taxonomía.
    "Bebidas": NO_FIABLE,
  },
};

// Palabras clave sobre la etiqueta, en orden: gana la primera que coincide, así que
// van de más específica a más general. Cubren la cola larga de bm (542 hojas) y
// ahorramás (532) sin escribir mil entradas, y valen para cualquier cadena nueva.
//
// Las campañas van primero porque "Feria del chocolate" no es el pasillo del
// chocolate: es una promoción con productos de cualquier pasillo.
// Ojo: estos patrones se comparan contra texto ya normalizado (sin acentos y con
// la ñ convertida en n), así que se escriben en ese alfabeto. Escribir "baño" o
// "pañal" aquí no coincide nunca: es un fallo que costó 43 productos de bm.
const POR_PALABRA = [
  [/black friday|navidad|nochevieja|nochebuena|semana santa|halloween|carnaval|san valentin|dia del padre|dia de la madre|vuelta al cole|especial |campana|feria |promocion|oferta|outlet|liquidacion|productos de carga|gourmet|gama premium/i, NO_FIABLE],
  // Marcas usadas como sección.
  [/^(mondelez|pepsico|nestle|danone|coca.?cola|unilever|procter|henkel|loreal|l.oreal)$/i, NO_FIABLE],
  // Etiquetas que son un atributo y no un pasillo.
  [/^(sin gluten|sin lactosa|bio|eco|ecologico|integral|light|zero|envasado|al corte|granel|seco|humedo|marcas|varios|otros|resto|surtido|novedades|destacados)$/i, NO_FIABLE],

  // `tarrito` va con `potito`: las seis etiquetas del catálogo que lo usan son
  // comida de bebé ("Tarritos de fruta y postre", "de verduras", "de carne", "de
  // pescado", "salados"). Sin esto se repartían entre frutas, carne y pescado según
  // el relleno, y ninguna de esas tres es lo que hay dentro del tarro.
  [/panal|bebe|infantil|potito|tarrito|papilla|chupete|biberon|puericultura/i, "bebe"],
  [/mascota|perro|gato|pienso|felino|canino|roedor|pajaro|acuario/i, "mascotas"],

  [/cerveza|vino|licor|whisky|ginebra|ron|vodka|sidra|cava|champan|vermut|espumoso|alcohol|destilado|aperitivo con alcohol/i, "bebidas_alcohol"],
  [/cafe|cacao|infusion|te e |^te$|capsula|molido|soluble|descafeinado/i, "cafe_te"],
  [/refresco|agua|zumo|smoothie|isotonic|energetic|bebida vegetal|nectar|horchata|gaseosa|cola\b|tonica|limonada|^bebidas?$|bebidas sin/i, "bebidas"],

  [/helado|congelad|ultracongelad/i, "congelados"],
  [/platos? preparados?|precocinad|pizza|lasana|canelon|croqueta|empanad|rebozad|tortilla|sushi|kebab|comida preparada|listo para|quinta gama/i, "platos_preparados"],

  // Lo que se hace CON un ingrediente va antes que el ingrediente, en TODOS los
  // cajones y no sólo en el de frutas: es la misma regla de precedencia que ya
  // aplican los frutos secos y el chocolate con leche. Sin esto, "Caldo de pescado"
  // es pescadería, "Sopas de aves y carne" es carnicería y "Pan de hamburguesas" es
  // carne, y además cada una añade una fila de pasillo de 3-12 productos al cajón
  // equivocado, que es lo que el usuario ve como subdivisión absurda.
  [palabras("pan de hamburguesa", "pan de perrito", "pan de burger"), "panaderia_bolleria"],
  // Ojo con el plural DENTRO de una frase: `palabras()` sólo lo añade al final, así
  // que "sopa de ave" no encuentra "Sopas de aves y carne" y hay que escribir las dos
  // formas. Es el precio de que el compilador sea una línea.
  [palabras("caldo de pescado", "caldos de pescado", "crema de marisco", "cremas de marisco", "sopa de ave", "sopas de ave", "sopa de carne", "para carne", "salsa barbacoa", "salsas barbacoa"), "despensa"],
  // "repollo" lleva "pollo" dentro: eran 7 productos de verdura en la carnicería.
  [palabras("brocoli", "coliflor", "repollo", "lombarda"), "frutas_verduras"],

  [/pescad|marisco|merluza|atun|salmon|bacalao|gamba|langostino|calamar|mejillon|pulpo|sardina|anchoa|boqueron|almeja|sepia|rodaball|lubina|dorada|trucha|pescaderia/i, "pescado_marisco"],
  [/carne|ternera|cerdo|pollo|pavo|cordero|conejo|anojo|buey|vacuno|hamburguesa|salchich|chuleta|solomillo|filete|carniceria|casqueria|embutido fresco|picada/i, "carne"],
  [/charcuteria|jamon|chorizo|salchichon|fuet|lomo embuchado|mortadela|fiambre|paté|pate|foie|bacon|salazon|embutido|cecina|sobrasada/i, "charcuteria_quesos"],
  [/queso|mozzarella|parmesano|manchego|brie|camembert|roquefort|burgos|mascarpone|requeson/i, "charcuteria_quesos"],
  // El chocolate va antes que la leche: "Chocolate con leche" es chocolate, y con
  // el orden inverso caia en lacteos. Lo distintivo manda sobre lo generico.
  [/chocolate|bombon|caramelo|gominola|golosina|regaliz|chicle|turron|chocolatina|dulce|azucar|miel|mermelada|crema de cacao|snack dulce/i, "dulces_chocolate"],
  [/leche|yogur|yogurt|kefir|nata|mantequilla|margarina|huevo|lacte|cuajada|natilla|flan|postre lacteo|batido lacteo|quark/i, "lacteos_huevos"],

  // Los frutos secos van ANTES que la fruta por el mismo motivo que el chocolate va
  // antes que la leche: lo distintivo manda sobre lo genérico. La regla de snacks ya
  // contempla "fruto seco", pero nunca llegaba a ejecutarse, porque el `fruta` de
  // aquí abajo se lleva por delante "Frutos secos y fruta desecada" (mercadona, 65
  // productos: almendra, nuez, pistacho, cacahuete, pipas, palomitas). Eran 65
  // aperitivos escondidos en frutas y verduras, y además le daban al cajón una
  // tercera fila con "fruta" en el nombre que no se podía distinguir de las otras dos.
  [/frutos? secos?/i, "snacks"],

  // Y por el mismo motivo, todo lo que se hace CON fruta o verdura va antes que la
  // fruta y la verdura. Es la clase de error que más pesa en el cajón: "Conservas
  // de verdura y frutas" (mercadona, 52), "Tarritos de fruta y postre" (bm, 39),
  // "Patatas fritas y snacks" (mercadona, 42), "Tomate frito" (bm 15 + ahorramás
  // 9), "Fruta deshidratada" (bm, 22), "Cremas y purés de verdura" (10), "Sopa de
  // verdura" (3), "Caldo de verdura" (2), "Fruta en almíbar" (11). Eran ~230
  // productos de despensa, snacks y potitos dentro de la frutería, y además ~15
  // filas de pasillo de 1 sola cadena que el usuario ve como subdivisión absurda.
  //
  // Las reglas genéricas de despensa y snacks de más abajo ya dicen "conserva",
  // "caldo", "sopa" y "patatas fritas": el problema nunca fue que faltaran, es que
  // el `fruta|verdura|tomate|patata` de la regla siguiente se ejecutaba primero.
  // Van con `\b` porque sin anclar "frito" encuentra "friTOs" pero también
  // "reFRITO", y "col" encontraría "chocolate".
  // Los tarritos y las bolsitas de fruta son potitos, no fruta: mismo caso.
  [palabras("tarrito", "potito", "bolsita de fruta", "bolsitas de fruta"), "bebe"],
  [palabras("patatas frita", "patata frita", "patatas de bolsa", "fruta deshidratada", "fruta desecada", "verdura deshidratada"), "snacks"],
  [palabras("sal de fruta"), "parafarmacia"],
  // Acotadas al contexto de fruta y verdura, no genéricas: la regla de despensa de
  // más abajo ya dice "sopa", "caldo", "salsa" y "vinagre", y sólo hace falta
  // adelantarse en los casos donde la palabra de verdura se los llevaría antes. Con
  // "sopa" a secas acá arriba, "Fideos y pasta para sopas" (ahorramás) se iba de
  // pasta a despensa: medido, era la única regresión de este cambio.
  [palabras(
    "conserva", "almibar", "tomate frito", "tomate natural", "tomate triturado",
    "tomate entero", "sopa de verdura", "caldo de verdura", "crema de verdura",
    "cremas y pure", "pure de patata", "pure de verdura", "salsa para ensalada",
    "salsas para ensalada", "vinagre de manzana", "gazpacho", "salmorejo"
  ), "despensa"],

  // Sin `^frescos$`: "Frescos" es un departamento, no un pasillo, y lo resuelve
  // DEPARTAMENTOS por el nombre del producto. Si una cadena nueva trae "Frescos",
  // queda sin cajón (visible en la cobertura) en vez de irse en bloque a frutas.
  [/fruta|verdura|hortaliza|ensalada|lechuga|tomate|patata|cebolla|pimiento|zanahoria|platano|manzana|naranja|aguacate|champinon|seta|fruteria|verduleria|fresco de|granja/i, "frutas_verduras"],

  [/pan\b|panaderia|bolleria|bizcocho|magdalena|croissant|donut|pasteleria|reposteria|tarta|coca|bolleria|barrita|tostad|biscote|molde|picos|rosquillet|picatoste|colines/i, "panaderia_bolleria"],
  [/galleta|cereal|muesli|copos|barritas de cereal|desayuno|almuerzo|merienda/i, "cereales_galletas"],
  [/snack|aperitivo|patatas fritas|fruto seco|frutos secos|cortez|nachos|palomitas|encurtido|aceituna|tortita|picoteo|picar/i, "snacks"],

  [/pasta|fideo|arroz|legumbre|lenteja|garbanzo|alubia|judia seca|cuscus|quinoa|noodle|espagueti|macarron/i, "pasta_arroz_legumbres"],
  [/aceite|vinagre|sal\b|especia|sazonador|salsa|conserva|caldo|sopa|crema de verdura|harina|levadura|tomate frito|mayonesa|ketchup|mostaza|condimento|despensa|alimentacion|cocina mejicana|cocina oriental|cocina italiana|sabores de|nutricion deportiva|proteina|dietetic|esparrago|palmito|alcachofa|pimiento|maiz dulce|guarnicion/i, "despensa"],

  [/papel higienic|papel de cocina|servilleta|panuelo|celulosa|film|aluminio|bolsa de basura|desechable|vajilla desechable/i, "papel_desechables"],
  // Los químicos de lavandería van ANTES que el textil: "Detergente ropa",
  // "Suavizante ropa" y "Perfumador ropa" se consumen, no se visten. Sin esta regla
  // la de abajo se los llevaba fuera del catálogo con la prenda.
  [/detergente|suavizante|quitamancha|perfumador ropa|blanqueante|percarbonato|antical/i, "limpieza_drogueria"],
  // \bropa\b y no `ropa`: sin anclar, el patrón se lleva por delante "estROPAjo", y
  // con él bayetas y guantes, que entran por su categoría ("Estropajo, bayeta y
  // guantes"). Eran 97 productos de limpieza tirados fuera del catálogo.
  [/calcetin|media\b|medias\b|\bropa\b|textil|prenda|complemento|accesorio(s)? y complemento/i, FUERA_DE_ALCANCE],
  [/pila|bombilla|iluminacion|linterna/i, "pilas_iluminacion"],
  [/limpieza|limpiador|detergente|lejia|suavizante|friegasuelo|lavavajilla|estropajo|fregona|bayeta|ambientador|insecticida|drogueri|quitamancha|abrillantador|hogar/i, "limpieza_drogueria"],

  [/parafarmacia|botiquin|farmacia|salud|vitamina|suplemento|tirita|termometro|preservativo|test de/i, "parafarmacia"],
  [/perfume|colonia|maquillaje|coloracion|tinte|labios|ojos|manicura|pedicura|esmalte|cosmetic|crema facial|crema corporal|serum|mascarilla facial|depilaci|afeitad|barba|mascarilla|locion|hidratante|colorete|polvos|solar|aftersun|uñas|unas\b|pelo/i, "cosmetica_perfumeria"],
  [/higiene|champu|acondicionador|gel de bano|gel de ducha|jabon|dentifric|bucal|desodorante|compresa|tampon|intima|panuelo|cuidado personal|cabello|capilar|corporal/i, "higiene_personal"],
];

function normaliza(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// El separador es sólo para guardar y mostrar: los scrapers emiten un array, que
// no tiene el problema de que un nombre de categoría contenga el separador (lidl
// usa "/" dentro de los suyos).
const SEPARADOR = " > ";

function pathToString(path) {
  if (!Array.isArray(path)) return null;
  const limpio = path.map((s) => String(s || "").trim()).filter(Boolean);
  return limpio.length ? limpio.join(SEPARADOR) : null;
}

function pathToArray(texto) {
  if (!texto) return [];
  return String(texto).split(SEPARADOR).map((s) => s.trim()).filter(Boolean);
}

// El pasillo es la hoja: el último tramo de la ruta, o la etiqueta plana si no hay.
function aisleFrom({ category_path, category }) {
  const path = Array.isArray(category_path) ? category_path : pathToArray(category_path);
  if (path.length) return path[path.length - 1];
  const plana = String(category || "").trim();
  return plana || null;
}

// --- Pasillo canónico -------------------------------------------------------
//
// El cajón canónico une el catálogo a 24 cajones, pero DENTRO de un cajón los
// pasillos siguen siendo el nombre que scrapeó cada cadena, y las nueve escriben
// el mismo pasillo distinto. Medido contra producción: "Frutas" (dia 86 + aldi 3)
// y "Fruta" (mercadona 54) son tres filas para 143 productos del mismo pasillo, y
// "Fruta y verdura" (mercadona 59) una cuarta. En la app eso se ve como categorías
// distintas, que es el segundo problema que reportó el usuario.
//
// Se resuelve en dos niveles, igual que el resto del mapa: primero lo mecánico,
// que no puede equivocarse, y sólo lo que quede se escribe a mano.
//
//   1. clave mecánica: sin acentos, minúsculas, y singular/plural palabra por
//      palabra. Une "Frutas"/"Fruta" y "Verduras"/"Verdura" sin decidir nada.
//   2. sinónimos escritos a mano: los nombres que significan lo mismo pero no se
//      parecen ("Fruta y verdura" con "Frutas", "Frutería" con "Fruta"). Esto NO
//      se puede adivinar con reglas sobre strings sin dar falsos positivos que
//      nadie puede auditar, así que se escribe y se revisa.
//
// Lo que NO hace: jerarquía. "Tomate" y "Naranja" siguen siendo pasillos propios y
// no se meten dentro de "Frutas y verduras", porque son más específicos y esa
// granularidad es justo lo que aporta el nivel de pasillo sobre el de cajón.
//
// Esta lógica estaba duplicada en el cliente (lib/pasillos.ts de market-app hacía
// el nivel 1 en el móvil). Vive acá porque es taxonomía, no presentación: el
// cliente no puede escribir los sinónimos del nivel 2 sin ver el catálogo entero.

// Clave morfológica de una palabra. No busca el singular correcto -- sólo que las
// dos formas caigan en la misma clave, que es un problema mucho más fácil: el
// español no forma el plural quitando una "s" ("arroz" -> "arroces", "yogur" ->
// "yogures"), pero sí se llega a una clave común desde las dos formas quitando la
// "s", luego la "e", y mapeando "z" -> "c".
//
//   fruta / frutas   -> "fruta"     yogur / yogures -> "yogur"
//   carne / carnes   -> "carn"      arroz / arroces -> "arroc"
//
// El corte en 4 letras protege las palabras cortas donde esto destruiría
// información ("mes", "gas", "pan", "te") y las partículas ("y", "de", "con"), que
// deben quedar intactas para que los nombres compuestos casen entre sí.
function claveMorfologica(palabra) {
  if (palabra.length < 4) return palabra;
  let p = palabra;
  if (p.endsWith("s")) p = p.slice(0, -1);
  if (p.endsWith("e")) p = p.slice(0, -1);
  if (p.endsWith("z")) p = `${p.slice(0, -1)}c`;
  return p;
}

// Sinónimos de pasillo: clave mecánica -> nombre canónico. Se escribe la clave y
// no el nombre crudo para no tener que repetir cada variante ortográfica: la
// entrada "fruta y verdura" ya cubre "Fruta y verdura", "Frutas y verduras" y
// "frutas y verdura".
//
// Sólo los pasillos MIXTOS, los que hablan de fruta y de verdura a la vez y por
// tanto no pueden caer en ninguno de los dos. Lo demás lo resuelve la pasada por
// palabra clave de más abajo, que no necesita una entrada por cadena.
// Las claves se escriben en el formato de `claveMecanica`: palabras sueltas,
// singularizadas, sin partículas y ORDENADAS alfabéticamente. Por eso una sola
// entrada cubre "Fruta y verdura", "Frutas y verduras" y "Verduras y frutas".
const PASILLOS_SINONIMOS = {
  "fruta verdura": "Frutas y verduras",
  "fruta hortaliza": "Frutas y verduras",
};

// Fusión de pasillos por palabra clave, DENTRO de un cajón. Es el tercer nivel, y
// hace falta porque el segundo no escala: la cola del catálogo son etiquetas
// hiperespecíficas de una sola cadena ("Maíz, guisantes y zanahoria" 13 productos,
// "Plátanos y uvas" 4, "Pimientos, calabacín y berenjenas" 3). Medido dentro de
// frutas y verduras: 46 de las 58 filas son de UNA cadena y 42 tienen 15 productos
// o menos. Escribirlas a mano en PASILLOS_SINONIMOS sería una lista infinita, una
// entrada por ocurrencia y por cadena nueva.
//
// ESTÁ ACOTADA POR CAJÓN A PROPÓSITO, y no es un detalle: la misma palabra
// significa otra cosa fuera del pasillo fresco. Medido sobre las etiquetas reales,
// una fusión global se llevaría "Refresco de naranja y de limón" (mercadona, 34),
// "Yogures con frutas y sabores" (ahorramás, 30), "Ajo, perejil y orégano" (10) y
// hasta "Estropajo, bayeta y guantes" (25, por "ajo" dentro de "estropAJO") al
// pasillo de las verduras. Por eso los patrones van con `\b` y la fusión sólo se
// aplica cuando quien pregunta declara el cajón.
//
// La tabla está indexada por cajón, así que ampliarla a otro (bebidas, limpieza)
// es añadir una clave, no rediseñar nada. Empieza donde está la evidencia.
const PASILLOS_POR_PALABRA = {
  frutas_verduras: [
    // GUARDAS, primero y sin fusionar: etiquetas que llevan una palabra de fruta o
    // verdura pero no son el pasillo fresco ("Conservas de fruta", "Tomate frito",
    // "Sopa de verdura", "Tarritos de verduras"). Su sitio es otro cajón -- lo
    // arregla POR_PALABRA más abajo -- y mientras tanto lo que NO hay que hacer es
    // renombrarlas "Verduras y hortalizas", que taparía el error.
    // Van con `palabras()` por lo mismo que POR_NOMBRE: `\bverdura\b` no encuentra
    // "Verduras", que es como lo escriben cuatro de las nueve cadenas.
    [palabras(
      "conserva", "almibar", "deshidratada", "deshidratado", "desecada", "desecado",
      "frito", "frita", "triturado", "triturada", "troceado", "troceada", "pure", "crema",
      "sopa", "caldo", "salsa", "vinagre", "tarrito", "potito", "bolsita", "snack",
      "congelado", "congelada", "zumo", "yogur"
    ), null],

    // Las hierbas frescas, antes que la verdura: "Perejil y tomillo" es el mismo
    // pasillo que "Hierbas aromáticas". NO entra "Ajo, perejil y orégano", que es el
    // pasillo de las especias secas de ahorramás -- lo dice el comentario de más
    // abajo y sigue valiendo: la hierba fresca y la especia molida no son la misma
    // compra.
    [palabras("hierba aromatica", "perejil y tomillo", "hierbas frescas"), "Hierbas aromáticas"],

    [palabras("ensalada", "ensaladilla", "lechuga", "hoja", "brote", "canonigo", "rucula", "escarola", "berro", "germinado"), "Lechugas y ensaladas"],

    // "Frescos" ya lo pliega el fold de departamentos de `nombrePasillo`; acá sólo
    // quedan los sinónimos de frutería, que no son un departamento declarado.
    [/\bfruteria\b|\bverduleria\b/, "Frutas y verduras"],

    [palabras(
      "fruta", "manzana", "pera", "uva", "platano", "banana", "naranja", "limon", "lima",
      "pomelo", "mandarina", "citrico", "melon", "sandia", "kiwi", "pina", "mango", "papaya",
      "aguacate", "fresa", "freson", "frambuesa", "arandano", "mora", "grosella", "cereza",
      "ciruela", "melocoton", "nectarina", "paraguaya", "albaricoque", "higo", "breva",
      "granada", "caqui", "chirimoya", "maracuya", "datil", "hueso", "tropical", "bosque",
      "rojo", "roja"
    ), "Frutas"],

    // "ajo" y "col" NO entran: sin plural son inofensivos, con plural se llevan
    // "estropAJOs" y "chocoLATE"... y aun con `\b`, "Ajo, perejil y orégano" es el
    // pasillo de las especias, no el de la verdura. Las cebollas y los ajos entran
    // por "cebolla", que sí es inequívoca.
    [palabras(
      "verdura", "hortaliza", "vegetal", "tomate", "pepino", "pimiento", "calabacin",
      "berenjena", "cebolla", "puerro", "patata", "boniato", "calabaza", "zanahoria",
      "remolacha", "nabo", "rabanito", "apio", "acelga", "espinaca", "esparrago",
      "alcachofa", "brocoli", "coliflor", "repollo", "lombarda", "judia", "guisante",
      "haba", "maiz", "raiz", "raices", "seta", "champinon", "boletus", "shiitake"
    ), "Verduras y hortalizas"],
  ],

  // La carnicería sólo necesita una entrada, y por un motivo concreto: la clave
  // mecánica ya es insensible al orden, así que "Hamburguesas y carne picada" (aldi)
  // y "Carne picada y hamburguesas" (bm + ahorramás) caen juntas sin escribir nada.
  // Lo que no puede resolver sola es que mercadona diga "Hamburguesas y picadas",
  // sin la palabra "carne": son las mismas palabras MENOS una, no permutadas, y
  // fusionar por subconjunto es la regla que se descartó arriba (metería "Ojos"
  // dentro de "Contorno de ojos"). Una línea escrita a mano y auditable lo arregla.
  //
  // Y NO hay entrada para el pescado a propósito, aunque la cola de pasillos de 3-12
  // productos ahí sea igual de larga: "Bacalao" (4), "Merluza" (10) y "Anchoas" (12)
  // son pasillos legítimamente distintos, no tres formas de escribir lo mismo. El
  // criterio de fusión es "el mismo concepto escrito distinto", nunca "tiene pocos
  // productos". Su permutación real -- "Sepia, pulpo y calamar" contra "Pulpo,
  // calamar y sepia" -- ya la resuelve la clave mecánica.
  carne: [
    // "Pan de hamburguesas y otros" es panadería y ya sale de este cajón por la
    // regla de arriba; la guarda queda por si otra cadena trae algo parecido.
    [palabras("pan"), null],
    [palabras("picada", "hamburguesa", "burger"), "Carne picada y hamburguesas"],
    // "Cerdo" (bm + mercadona + aldi, 46) y "Cerdo y cochinillo" (ahorramás, 41) son
    // el mismo pasillo con el nombre más largo en una cadena, no una subcategoría
    // legítima. Se comprobó contra los 41 nombres reales de ahorramás antes de
    // fusionar, porque el cochinillo SÍ podría ser un pasillo aparte (como "Bacalao"
    // y "Merluza" en la pescadería, que a propósito no se fusionan): no hay ni un
    // producto de cochinillo dentro. Son 41 cortes de cerdo -- lomo, solomillo,
    // carrillada, secreto, presa, magro --, o sea las mismas palabras MENOS una, que
    // es el caso de "Hamburguesas y picadas" de la línea de arriba y se arregla igual.
    //
    // Es seguro dentro de este cajón: de sus 54 nombres de pasillo, "cerdo" sólo
    // aparece en esos dos. No hay ningún pasillo mixto tipo "Cerdo y ternera" al que
    // la regla le pondría un nombre que miente.
    [palabras("cerdo"), "Cerdo"],
    // La casquería: "Arreglos" (mercadona, 10) y "Casquería y arreglos" (ahorramás, 6)
    // son el mismo pasillo. Verificado contra los nombres: los dos son despojos,
    // huesos y piezas de puchero, y "Manos de cerdo" aparece en los dos.
    [palabras("casqueria", "arreglo"), "Casquería y arreglos"],
    // GUARDA. "Carne y pollo" (ahorramás, 7) NO es la pollería: son empanados y
    // congelados de marca ("San jacobos", "Crunchy gouda" -- que ni es pollo,
    // "Tenders barbacoa"). Meterlos con las pechugas frescas sería juntar dos cosas
    // que el usuario no confunde. Sus 7 productos están además discutiblemente en
    // este cajón y no en platos_preparados; queda anotado, no se toca acá.
    [/^carne y pollo$/, null],
    // La pollería. Seis nombres para el mismo pasillo, verificados producto a
    // producto: "Aves de España" (ahorramás, 19) es 100% pollo, "Pollo airfryer" (6)
    // son cortes de pollo crudo con una etiqueta de campaña, y "Conejo, pavo y otras
    // aves" (15) son 13 de pavo y codorniz más 2 de conejo.
    //
    // Y NO entran "Conejo" (bm, 7) ni "Conejo y cordero" (mercadona, 9), que era la
    // hipótesis a comprobar: no son el caso de "Cerdo y cochinillo". Se miraron los 9
    // nombres y 6 son de CORDERO (chuletas de palo y riñonada, hígado, garretas,
    // burger al romero, trozos de guisar, chuletas de paletilla), no de conejo. Es un
    // pasillo MIXTO de dos especies distintas, como "Fruta y verdura": no cabe dentro
    // de "Conejo" ni dentro de "Cordero", y hay pasillos de cordero aparte (bm 2,
    // ahorramás 1). Fusionarlo esconderría seis productos de cordero en el pasillo del
    // conejo. Se quedan como dos filas porque son dos pasillos.
    [palabras("ave", "pollo", "pavo"), "Aves y pollo"],
  ],

  // La galleta y el cereal se escriben de trece formas entre seis cadenas. Se fusiona
  // lo que es la MISMA galleta con otro nombre y se respeta lo que es otra galleta:
  // "Galletas María", "Galletas rellenas" y "Galletas saladas" son productos
  // distintos -- el criterio de Bacalao/Merluza --, mientras que "Galletas",
  // "Galletas clásicas" y "Galletas y pastas" son la fila genérica escrita por tres
  // cadenas.
  cereales_galletas: [
    // El desayuno como pasillo es el cajón entero: se pliega a su nombre.
    [palabras("desayuno", "merienda", "almuerzo"), "Cereales y galletas"],
    // Las galletas van antes que los cereales: "Galletas de avena e integrales" es
    // una galleta, y la regla de integrales de abajo se la llevaría al muesli.
    [/galleta\w*[^]*(integral|avena|digestiv)|(integral|digestiv)\w*[^]*galleta/, "Galletas integrales"],
    [palabras("galleta rellena"), "Galletas rellenas"],
    [palabras("galleta salada"), "Galletas saladas"],
    [palabras("galleta maria"), "Galletas María"],
    [palabras("barquillo", "wafer"), "Barquillos y wafer"],
    [palabras("galleta"), "Galletas"],
    [/integral|muesli|dietetic|digestiv|granola/, "Cereales integrales y muesli"],
    [palabras("cereal", "corn flakes", "copos de maiz"), "Cereales"],
  ],

  // Panadería: 71 filas para 2.089 productos, y el reparto es el de siempre -- unas
  // pocas gordas y una cola de nombres de una sola cadena. El eje que SÍ se respeta
  // es el tipo de producto (pan / pan de molde / pan tostado / picos / bollería /
  // tartas / repostería), porque son compras distintas. El que NO se respeta es cómo
  // cada cadena redacta el mismo tipo.
  //
  // Dos decisiones que se tomaron mirando los datos y no por simetría:
  //
  //   - "Bollería envasada" se queda SEPARADA de "Bollería de horno" y "Bollería del
  //     día". mercadona tiene las dos como pasillos distintos, y es la misma clase de
  //     distinción real que "Agua con gas" / "Agua sin gas", que este archivo ya se
  //     niega a fusionar. La del día y la de horno sí se juntan: eso es lo mismo con
  //     dos nombres.
  //   - las cinco variantes de "Pan de molde" (blanco, integral, multicereales y
  //     semillas, artesano y rústico, "y otras especialidades") SÍ se juntan. Suenan a
  //     Bacalao/Merluza pero no lo son: mercadona tiene UNA fila genérica que cubre
  //     todas, así que las de bm y ahorramás son la misma compra troceada por la
  //     estantería de cada tienda, no productos que el usuario busque por separado.
  panaderia_bolleria: [
    // GUARDAS: llevan una palabra de panadería y no son el pasillo.
    [palabras("galleta"), null],            // "Galletas tostadas" es galleta, no pan tostado
    [palabras("maiz"), null],               // "Maíz tostado" es un aperitivo
    [palabras("molde y recipiente"), null], // moldes de horno, no pan de molde
    [palabras("barrita de cereal", "barritas cereales", "cereales y barritas"), null],

    [palabras("tarta", "pastel", "pasteleria", "contesa", "churro"), "Tartas y pasteles"],
    [palabras("decoracion"), "Decoración para repostería"],
    // La envasada antes que la bollería a secas, que si no se la lleva.
    [/\benvasad/, "Bollería envasada"],
    [palabras("bolleria", "croissant", "ensaimada", "napolitana"), "Bollería"],
    [palabras("bizcocho", "coca", "magdalena"), "Bizcochos, cocas y magdalenas"],
    [palabras("pico", "colin", "rosquilleta", "picatoste", "cracker"), "Picos, colines y picatostes"],
    // El molde antes que el tostado: "Pan de molde y tostado" es pan de molde.
    [palabras("molde"), "Pan de molde"],
    // Y el tostado antes que la repostería: "Pan tostado y rallado" es pan tostado,
    // aunque el pan rallado sea repostería.
    [palabras("tostada", "tostado", "biscote"), "Pan tostado y biscotes"],
    [palabras("harina", "levadura", "reposteria", "pan rallado", "masa", "hojaldre"), "Harinas y repostería"],
    // Y lo genérico al final: lo que no reconoció ninguna regla de tipo.
    [palabras("pan", "baguette", "hogaza", "barra"), "Pan"],
    [palabras("panaderia", "panificacion"), "Panadería y bollería"],
  ],
};

// El nombre canónico por palabra clave, dentro de un cajón. `null` significa
// "reconocida como guarda: no fusionar", distinto de "ninguna regla la vio".
// lidl no manda la hoja sino la ruta entera separada por "/", y las reglas de pasillo
// tienen que mirar SÓLO la hoja: el tramo padre habla del departamento y arrastra al
// hijo. Medido: "Comida y cerca de la comida/Carne y aves/Embutidos y fiambres" y
// ".../Carne y aves/Carne de vacuno" caían en la pollería por el "aves" del PADRE.
//
// Va acá y no en `claveMecanica` a propósito: acá decide qué regla se aplica, que es
// donde está el error. La clave de agrupación sigue siendo la ruta completa, que es lo
// que identifica la fila cuando ninguna regla la reconoce.
function hojaDePasillo(nombre) {
  const tramos = String(nombre || "").split("/").map((t) => t.trim()).filter(Boolean);
  return tramos.length ? tramos[tramos.length - 1] : String(nombre || "");
}

function pasilloPorPalabra(nombre, canonical) {
  const reglas = PASILLOS_POR_PALABRA[canonical];
  if (!reglas) return undefined;
  const texto = normaliza(hojaDePasillo(nombre));
  for (const [re, destino] of reglas) {
    if (re.test(texto)) return destino;
  }
  return undefined;
}

// Partículas que no distinguen un pasillo de otro. "otras" entra porque es un
// prefijo de relleno que usan bm y ahorramás para el cajón de sobras de un pasillo
// ("Especias" / "Otras especias", "Ambientadores" / "Otros ambientadores",
// "Insecticidas" / "Otros insecticidas": seis familias del catálogo).
//
// "con", "sin" y "para" NO están, y es la parte importante de esta lista: sí
// distinguen. Sin ellas, "Agua con gas" (17) y "Agua sin gas" (35) tendrían la misma
// clave y se fusionarían en una fila, que es exactamente lo contrario de lo que
// quiere quien busca agua con gas. Igual con "Para carne" (6, adobos y especias) y
// "Carnes" (176).
const PARTICULAS = new Set([
  "y", "e", "o", "u", "de", "del", "la", "el", "los", "las", "un", "una", "al", "a", "en",
  "otro", "otra", "otros", "otras",
]);

// La clave mecánica: la que no puede equivocarse porque no decide nada, sólo
// normaliza la ESCRITURA. Tres cosas, en este orden:
//
//   1. acentos y mayúsculas    "Bollería envasada" = "Bolleria Envasada"
//   2. singular/plural         "Yogur líquido" = "Yogures líquidos"
//   3. ORDEN de las palabras   "Ahumados y salazones" = "Salazones y ahumados"
//
// (3) es una bolsa de palabras: se ordenan alfabéticamente y se quitan las
// partículas. Hace falta porque cada cadena elige un orden distinto para el mismo
// pasillo, y es una diferencia puramente de redacción -- no hay ninguna cadena para
// la que "Ahumados y salazones" signifique algo distinto de "Salazones y ahumados".
// Medido sobre el catálogo entero: 20 familias de pasillos, 1.186 productos, en 13
// cajones distintos. Entre ellas "Champiñones y setas"/"Setas y champiñones",
// "Barritas cereales"/"Barritas de cereales"/"Cereales y barritas",
// "Caldos y sopas"/"Sopa y caldo" y "Embutido curado"/"Curados y embutidos".
//
// Lo que NO hace, y se probó y se descartó con datos: fusionar cuando las palabras
// de una etiqueta son un SUBCONJUNTO de las de otra. Suena parecido y es otra cosa:
// sobre el catálogo real da 392 pares, y entre ellos "Alimentación" (3.546 productos)
// dentro de "Alimentación saludable" (5), "Ojos" (74) dentro de "Contorno de ojos"
// (4), "Aceite" dentro de "Crema y aceite corporal" y "Desayuno" (100) dentro de
// "Desayuno y Merienda" (2.682). Es la clase de regla que no se puede auditar: cada
// pasillo genérico se traga al específico que lo menciona.
function claveMecanica(nombre) {
  const palabrasDelNombre = normaliza(nombre)
    .replace(/[,;]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(claveMorfologica)
    .filter((p) => !PARTICULAS.has(p));
  // Si el nombre era todo partículas no queda nada útil: se cae al texto normalizado
  // entero, que al menos sigue identificando la fila.
  if (!palabrasDelNombre.length) return normaliza(nombre) || null;
  return [...new Set(palabrasDelNombre)].sort().join(" ");
}

// El nombre canónico de un pasillo, o null si no hay ninguno escrito y el que
// llama tiene que elegir la ortografía (la del pasillo con más productos detrás),
// que es lo único honesto: entre "Frutas" y "Fruta" no hay una correcta, hay una
// mayoritaria.
//
// `canonical` es el cajón, y es opcional: sin él sólo se aplican los sinónimos
// exactos, que son seguros en todo el catálogo. La fusión por palabra clave
// necesita el cajón para no confundir un refresco de naranja con la frutería, así
// que sin cajón no se aplica. Es el caso real: la app abre un cajón a la vez y pide
// `/pasillos?categoria_canonica=<cajón>`.
// Los nombres de DEPARTAMENTO no son nombres de pasillo, y desde que el mapa los
// resuelve por el nombre del producto aparecen como fila en CADA cajón donde cae
// alguno de sus productos: "Frescos" es una fila en frutas y verduras, otra en
// carne, otra en pescadería, otra en panadería... y en todas quiere decir lo mismo
// que la fila genérica del cajón. Medido: "Desayuno y Merienda" (224), "Alimentación"
// (215) y "Frescos" (137) son tres de las cinco filas más grandes de panadería, y
// ninguna de las tres le dice al usuario qué hay dentro.
//
// Se pliegan al nombre del cajón, que es lo que de verdad son. No hace falta declarar
// nada nuevo: DEPARTAMENTOS ya dice "esta etiqueta es un departamento y no un
// pasillo", así que se reutiliza esa misma lista y no hay una segunda que se pueda
// desincronizar. Antes esto estaba escrito a mano y sólo para un cajón
// (`/^frescos$/` dentro de frutas_verduras), que es la versión que no escala a nueve
// departamentos por veinticuatro cajones.
//
// Se calcula la primera vez que se pregunta y no al cargar el módulo, porque
// DEPARTAMENTOS se declara más abajo: un `const` en el cuerpo del módulo se
// evaluaría antes de que exista y rompería el `require`.
let etiquetasDeDepartamento = null;

function esEtiquetaDeDepartamento(nombre) {
  if (!etiquetasDeDepartamento) {
    etiquetasDeDepartamento = new Set(
      Object.values(DEPARTAMENTOS).flatMap((tabla) => Object.keys(tabla)).map(normaliza)
    );
  }
  return etiquetasDeDepartamento.has(normaliza(nombre));
}

function nombrePasillo(nombre, canonical) {
  const base = claveMecanica(nombre);
  if (!base) return null;
  // El departamento va primero: su nombre no puede competir con las reglas de
  // pasillo, porque no es uno.
  if (canonical && esEtiquetaDeDepartamento(nombre)) {
    const cajon = canonicaPorId(canonical);
    if (cajon) return cajon.nombre;
  }
  if (PASILLOS_SINONIMOS[base]) return PASILLOS_SINONIMOS[base];
  const porPalabra = pasilloPorPalabra(nombre, canonical);
  return porPalabra || null;
}

// La clave de agrupación de un nombre de pasillo. Dos pasillos con la misma clave
// son el mismo pasillo.
function clavePasillo(nombre, canonical) {
  const base = claveMecanica(nombre);
  if (!base) return null;
  const canonico = nombrePasillo(nombre, canonical);
  // El nombre canónico se resuelve a la clave de SÍ MISMO, para que las doce
  // variantes de fruta y verdura acaben en una única clave y no en doce que
  // comparten etiqueta.
  return canonico ? claveMecanica(canonico) : base;
}

// Prefijos de ruta, con la regla del prefijo más largo. Una raíz limpia es una
// entrada; una raíz gruesa se parte en varias de segundo nivel sin rediseñar nada.
const POR_PREFIJO = {
  lidl: [
    [["Tienda de bricolaje y jardín"], FUERA_DE_ALCANCE],
    [["Moda y accesorios"], FUERA_DE_ALCANCE],
    [["Bebés, niños y juguetes", "Juguetes"], FUERA_DE_ALCANCE],
    [["Deporte y ocio"], FUERA_DE_ALCANCE],
    [["Vivir y amueblar", "Belleza y cuidado corporal"], "cosmetica_perfumeria"],
    [["Vivir y amueblar"], FUERA_DE_ALCANCE],
    [["Cocina y hogar", "Limpieza del hogar"], "limpieza_drogueria"],
    [["Cocina y hogar"], FUERA_DE_ALCANCE],
    [["Vino, cerveza y licores"], "bebidas_alcohol"],
    [["Comida y cerca de la comida", "Bebidas"], "bebidas"],
    [["Comida y cerca de la comida", "Presupuesto"], NO_FIABLE],
    [["Comida y cerca de la comida", "Flores y plantas"], FUERA_DE_ALCANCE],
  ],
};

function porPrefijo(supermercado, path) {
  const reglas = POR_PREFIJO[normaliza(supermercado)];
  if (!reglas || !path.length) return null;
  let mejor = null;
  let largo = 0;
  for (const [prefijo, destino] of reglas) {
    if (prefijo.length > path.length || prefijo.length <= largo) continue;
    const coincide = prefijo.every((tramo, i) => normaliza(tramo) === normaliza(path[i]));
    if (coincide) {
      mejor = destino;
      largo = prefijo.length;
    }
  }
  return mejor;
}

function porEtiqueta(supermercado, category) {
  const tabla = POR_ETIQUETA[normaliza(supermercado)];
  if (!tabla || !category) return null;
  if (Object.prototype.hasOwnProperty.call(tabla, category)) return tabla[category];
  // Segundo intento sin acentos ni mayúsculas, que las cadenas no son consistentes.
  const buscado = normaliza(category);
  for (const clave of Object.keys(tabla)) {
    if (normaliza(clave) === buscado) return tabla[clave];
  }
  return null;
}

function porPalabra(etiqueta) {
  if (!etiqueta) return null;
  const texto = normaliza(etiqueta);
  for (const [re, destino] of POR_PALABRA) {
    if (re.test(texto)) return destino;
  }
  return null;
}

// --- Cuarta pasada: el NOMBRE del producto, dentro de un departamento --------
//
// Hay etiquetas que no son un pasillo sino un DEPARTAMENTO entero. "Frescos" de
// alcampo son 2.810 productos que incluyen la frutería, la carnicería, la
// pescadería, la charcutería, la quesería y el horno: mapearla a un solo cajón es
// un error de categoría, no un matiz. Medido contra producción: 716 de esos 2.810
// llevan "queso" en el nombre y estaban catalogados como frutas y verduras. Lo
// mismo con "Frescos" de ahorramás (62, mezcla de todo) y de bm (17, que son
// queso fresco al 100%).
//
// Estas etiquetas no pueden ir a NO_FIABLE (dejarían 2.889 productos sin cajón,
// que es peor que hoy) ni a un cajón fijo (es el bug). Se declaran como
// departamento con un cajón POR DEFECTO, y el cajón real se decide por el nombre
// del producto.
//
// Por qué el defecto es el cajón que ya tenían: hace la pasada segura por
// construcción. Cualquier producto que las reglas de nombre NO reconozcan queda
// exactamente donde está hoy, así que el cambio sólo puede mover productos que
// hemos identificado positivamente. Y como el defecto es `frutas_verduras`, toda
// la frutería y verdulería acierta sin escribir una sola regla de fruta -- que es
// justo la lista que no conviene escribir, porque los nombres de fruta aparecen
// también en la bollería ("Tarta de manzana") y en la charcutería ("Jamón con
// melón").
//
// El mismo bug lo tienen las OTRAS raíces de alcampo, y pesan mucho más que
// "Frescos". Medido contra producción: "Alimentación" son 3.332 productos, todos en
// `despensa`, y ahí dentro hay pasta (171 nombres con la palabra), arroz (98),
// legumbres, aceitunas y encurtidos (116), frutos secos, patatas fritas (68),
// conservas de pescado (119 con "atún") y pan de molde. "Bebidas" son 2.333 y ~1.100
// llevan vino (565), cerveza (387), whisky (78), licor (64), cava (60), ginebra (53)
// o vodka (36): mil botellas de alcohol en el cajón del agua mineral. "Desayuno y
// Merienda" son 2.682 con 708 chocolates y 384 cafés dentro de `cereales_galletas`.
//
// Se arreglan igual y con la misma garantía: cajón por defecto = el que tenían, así
// que un producto que las reglas de nombre no reconozcan se queda donde está hoy y
// el cambio sólo puede mover lo que se ha identificado positivamente.
//
// dia y aldi entran sólo con las raíces que mezclan dos cajones declarados: el papel
// higiénico de "Limpieza y hogar" es `papel_desechables` y el champú de "Cabello y
// perfumería" es `higiene_personal`, y las dos cosas las dice POR_PALABRA. El resto
// de sus etiquetas son pasillos de verdad y se quedan en POR_ETIQUETA.
const DEPARTAMENTOS = {
  alcampo: {
    "Frescos": "frutas_verduras",
    "Alimentación": "despensa",
    "Bebidas": "bebidas",
    "Desayuno y Merienda": "cereales_galletas",
    "Perfumeria": "cosmetica_perfumeria",
    "Droguería": "limpieza_drogueria",
    "Sin Gluten / Sin Lactosa, Nutrición deportiva y Funcional": "despensa",
    "Supermercado Ecológico": "despensa",
    "Veganos": "despensa",
  },
  ahorramas: { "Frescos": "frutas_verduras" },
  bm: { "Frescos": "frutas_verduras" },
  dia: {
    // Las dos raíces de dia que mezclan cajones declarados: en "Bollería, repostería y
    // azúcar" (234) conviven ensaimadas con azúcar, edulcorante y harina, y en
    // "Galletas, cereales y mermeladas" (372) las mermeladas son dulces. Igual que en
    // alcampo: el defecto es el cajón que ya tenían, así que sólo se mueve lo
    // identificado.
    "Bollería, repostería y azúcar": "panaderia_bolleria",
    "Galletas, cereales y mermeladas": "cereales_galletas",
    "Limpieza y hogar": "limpieza_drogueria",
    "Higiene y cuidado del cuerpo": "higiene_personal",
    "Cabello y perfumería": "cosmetica_perfumeria",
  },
  aldi: {
    "Limpieza y hogar": "limpieza_drogueria",
    "Cuidado personal": "higiene_personal",
  },
};

// Reglas sobre el NOMBRE del producto. NO son las mismas que POR_PALABRA y no se
// pueden reutilizar: POR_PALABRA está escrita para etiquetas de pasillo, donde una
// subcadena suelta basta. Aplicada a nombres de producto se rompe, medido sobre
// los 2.810 nombres reales de alcampo: "Chipirones" -> bebidas_alcohol (por "ron"),
// "Sandía de carne naranja" -> carne, "Melocotones rojos" -> cosmética (por "ojos"
// dentro de "rojos"), "Aguacate" -> bebidas (por "agua"). 1.654 de 2.810
// clasificados mal.
//
// De ahí las dos reglas de escritura de esta tabla:
//   1. `\b` en todo: el nombre de producto es prosa, no una etiqueta corta, y una
//      subcadena suelta encuentra cualquier cosa.
//   2. nada de palabras polisémicas sueltas. "carne" sola la usa la sandía; sólo
//      entra en frases ("carne picada", "carne de vacuno"). Ante la duda se deja
//      sin regla, que cae al defecto del departamento.
//
// El orden es de más distintivo a más genérico, igual que POR_PALABRA.
//
// Se escriben como listas de palabras y no como expresiones a mano por el plural:
// `\b(croissant)\b` no encuentra "Mini croissants", y escribir cada palabra dos
// veces multiplica la tabla y se olvida la mitad (pasó con `croissant`, `burrata`
// y `vieira` en la primera versión). `palabras()` añade el plural español (-s/-es)
// una sola vez y para todas.
function palabras(...lista) {
  // El plural va en las DOS puntas de la frase, y no sólo al final. En español el
  // plural de un nombre compuesto cae en la primera palabra tanto o más que en la
  // última: "Pañuelos de papel", "Pastas almendradas", "Bolsas de basura", "Hojas
  // de afeitar". Con el plural sólo al final, `palabras("panuelo de papel")` no
  // encuentra "Pañuelos de papel", y el producto se va al cajón de otra regla --
  // silenciosamente, porque hay reglas de sobra que lo recogen mal.
  //
  // Es el mismo fallo que ya se pagó tres veces por escribir las reglas a mano
  // ("croissant", "burrata", "vieira") y dos más con esta función ("pastas
  // almendradas" acabó en el pasillo de los macarrones, "pañuelos de papel" en
  // droguería). Se arregla una vez acá en vez de recordar escribir cada frase en
  // sus dos formas, que es justo lo que esta función existe para evitar.
  const conPlural = lista.map((frase) => frase.replace(/^(\S+)(?=\s)/, "$1(?:es|s)?"));
  return new RegExp(`\\b(?:${conPlural.join("|")})(?:es|s)?\\b`);
}

const POR_NOMBRE = [
  // ===========================================================================
  // Limpieza, papel e higiene van PRIMERO, antes que toda la comida.
  // ===========================================================================
  //
  // Que un producto sea lejía, detergente, papel higiénico o pasta de dientes es
  // tan distintivo como que sea un helado, y tiene que decidirse antes que
  // cualquier regla de alimentación. El motivo es concreto y medido: las marcas de
  // droguería se llaman como la comida, y en cuanto "Droguería" y "Perfumeria"
  // pasaron a ser departamentos resueltos por nombre, esas marcas se llevaron sus
  // productos al lineal de alimentación.
  //
  //   "CONEJO Lejía amarilla"                        -> carnicería (marca)
  //   "PATO Limpiador WC"                            -> carnicería (marca)
  //   "LICOR DEL POLO Pasta de dientes"              -> congelados ("polo")
  //   "LA ANTIGUA LAVANDERA Detergente ... secreto"  -> carnicería ("secreto")
  //   "DOVE Desodorante ... axilas, pecho, muslos"   -> carnicería ("muslo")
  //   "OGX Champú con leche y aceite de coco"        -> lácteos
  //   "SCOTTEX Papel higiénico con toque de loción"  -> lácteos
  //   "Gel de baño con aroma a caramelo y café"      -> dulces / café
  //   "DR. BECKMANN Quitamanchas de mantequilla"     -> lácteos
  //
  // Medido sobre el catálogo entero: subir estos cuatro bloques mueve 134 productos
  // y los 134 son correcciones. NO hay ni un alimento que se llame "detergente",
  // "lejía" o "papel higiénico", que es lo que hace la inversión segura -- y es la
  // diferencia con `parafarmacia` y `pilas_iluminacion`, que se quedan abajo porque
  // sí colisionan de verdad ("Leche enriquecida con omega 3", "Chorizo vela").
  //
  // Única guarda necesaria: el limpiador FACIAL es cosmética, no droguería.
  [palabras("limpiador facial", "limpiadora facial", "espuma limpiadora"), "cosmetica_perfumeria"],

  // --- Papel y desechables. Antes que droguería porque las cadenas los mezclan en
  // el mismo pasillo y POR_PALABRA ya declara que son cajones distintos.
  [palabras(
    "papel higienico", "papel de cocina", "rollo de cocina", "servilleta",
    "panuelo de papel", "papel de aluminio", "papel de horno", "papel vegetal",
    "papel de secar", "film transparente", "film de cocina", "bolsa de basura",
    "bolsa de congelacion", "bolsa congelacion", "bolsa de conservacion", "saco de basura",
    "mantel de papel", "molde de papel", "plato de carton", "vaso de carton",
    "plato de plastico", "vaso de plastico", "bolsa para cubitos", "papel de plata"
  ), "papel_desechables"],

  // --- Limpieza y droguería. Va antes que higiene porque "jabón" y "gel" los usan
  // los dos, y acá están acotados a su sentido de limpieza ("jabón para lavadora",
  // "gel WC"), mientras que el bloque de higiene los coge genéricos.
  [palabras(
    "detergente", "suavizante", "perfumador de ropa", "perfumador liquido",
    "perlas perfumadas", "quitamanchas", "blanqueador", "blanqueante", "lejia",
    "amoniaco", "salfuman", "sosa caustica", "percarbonato", "antical",
    "lavavajillas", "friegasuelos", "limpiador", "limpiacristales", "limpiahogar",
    "limpiamuebles", "limpiametales", "limpiasuelos", "quitagrasas",
    "desengrasante", "desincrustante", "desatascador", "desinfectante",
    "ambientador", "insecticida", "antipolillas", "raticida", "abrillantador",
    "estropajo", "fregona", "bayeta", "mopa", "escoba", "recogedor", "cepillo de barrer",
    "guante de latex", "guante de fregar", "guante de limpieza", "guante latex",
    "gel wc", "disco wc", "disco para wc", "tinte para ropa", "aditivo para",
    "deshumidificador", "betun", "crema para calzado", "jabon para lavadora",
    "jabon de lavadora", "oxigeno activo", "toallita limpia", "recambio de fregona"
  ), "limpieza_drogueria"],

  // --- Higiene: boca. POR_PALABRA declara `dentifric|bucal` en higiene_personal,
  // así que la pasta de dientes es higiene y no cosmética. También hace de guarda
  // de la regla de pasta alimenticia de más abajo: sin ella, "Pasta de dientes"
  // acaba en el pasillo de los macarrones.
  [palabras(
    "pasta de dientes", "pasta dentifrica", "dentifrico", "cepillo de dientes",
    "cepillo dental", "kit dental", "seda dental", "hilo dental", "cinta dental",
    "colutorio", "enjuague bucal", "irrigador", "limpieza dental"
  ), "higiene_personal"],

  // --- Higiene personal. Champú y acondicionador van acá y no en cosmética porque
  // es lo que declara POR_PALABRA. Hoy 312 champús están en cosmética, pero no por
  // una decisión: es el arrastre de las raíces gruesas ("Perfumeria" de alcampo,
  // "Cabello y perfumería" de dia), que es justo el bug que este cambio corrige.
  [palabras(
    "champu", "acondicionador", "gel de ducha", "gel de bano", "gel de higiene",
    "gel intimo", "jabon de manos", "jabon intimo", "jabon liquido",
    "jabon de glicerina", "pastilla de jabon", "desodorante", "antitranspirante",
    "compresa", "tampon", "salvaslip", "protegeslip", "copa menstrual",
    "higiene intima", "bastoncillo", "polvos de talco", "agua de colonia infantil"
  ), "higiene_personal"],

  // La ensalada de bolsa va PRIMERO: se llama por sus ingredientes ("Ensalada de
  // queso de cabra, nueces y manzana"), así que cualquier regla de queso, pollo o
  // atún se la lleva antes. Es verdura preparada, igual que el pasillo "Lechuga y
  // ensalada preparada" de mercadona.
  // Fruta y verdura fresca cuyo nombre lleva la palabra del producto elaborado:
  // "Naranjas de zumo" son naranjas y "Pepinos snack" son pepinos, pero las reglas
  // de bebidas y de aperitivos de más abajo se los llevan. Van acá arriba porque
  // son la excepción exacta, no una categoría entera.
  [palabras("naranja de zumo", "pepino snack"), "frutas_verduras"],

  [palabras("ensalada", "ensaladilla", "brotes tiernos", "canonigo", "rucula", "escarola", "radicchio", "mezclum"), "frutas_verduras"],

  // --- Guardas que tienen que ganarle a la charcutería y a la carnicería -----
  //
  // Estas cinco reglas van tan arriba porque las palabras de charcutería, carne y
  // pescado aparecen dentro del nombre de productos que NO son de esos cajones, y
  // ahí la regla de más abajo se los lleva. Medido contra el catálogo real:
  // "Patatas fritas onduladas sabor jamón" -> charcutería, "Helado de nata bloque"
  // -> lácteos, "Caldo de pollo 24 pastillas" -> carnicería, "Aceitunas rellenas de
  // anchoas" -> pescadería.
  //
  // Cada una se verificó contra los 2.889 nombres de "Frescos", que es el
  // departamento que ya dependía de esta tabla, para no romper lo que ya acertaba:
  // "helado", "café", "patatas fritas", "pipas", "té", "infusión" y "tortita" no
  // aparecen NI UNA vez ahí, así que subirlas no puede mover nada de frescos. Las
  // dos únicas coincidencias son "Sopa Juliana deshidratada" y "Preparado para
  // caldo", y las dos son despensa: la guarda las arregla, no las rompe.
  [palabras("esmalte de unas", "esmalte en gel", "maquillaje infantil"), "cosmetica_perfumeria"],
  [palabras("vela aromatica"), "pilas_iluminacion"],
  [palabras("helado", "polo", "sorbete", "granizado"), "congelados"],
  [palabras(
    "cafe", "cappuccino", "capuchino", "espresso", "ristretto", "macchiato",
    "latte", "te verde", "te rojo", "te negro", "te blanco", "rooibos",
    "infusion", "achicoria", "cacao soluble", "cacao en polvo"
  ), "cafe_te"],
  // Aperitivos sólo con los nombres que NO comparte la charcutería. "aceituna",
  // "snack", "aperitivo", "almendra" y "pistacho" NO están: los usa el embutido
  // ("Mortadela con aceitunas", "Fiambre de pavo con pistachos", "Mini fuet ideal
  // como snack", 28 productos de Frescos), así que van en el bloque de abajo, ya
  // pasada la charcutería. Las excepciones acotadas -- "aceitunas rellenas" y los
  // frutos secos "tostados" -- sí suben, porque ésas no las usa ningún embutido y
  // sin ellas caen en pescadería (por la anchoa del relleno) y en panadería (por
  // la palabra "tostada").
  [palabras(
    "patatas frita", "patata frita", "patatas ondulada", "cortez", "gusanito",
    "nachos", "dorito", "kikos", "palomita", "torrezno", "pipa",
    "tortita", "pretzel", "aceituna rellena", "rellena de anchoa", "avellana tostada", "almendra tostada",
    "cacahuete tostado", "almendra frita", "maiz frito"
  ), "snacks"],
  [palabras("caldo", "sopa", "consome", "sopinstant", "pastilla de caldo"), "despensa"],
  [palabras(
    "leche infantil", "leche de continuacion", "leche de inicio", "papilla",
    "potito", "tarrito", "biberon", "chupete", "tetina", "cereales infantiles"
  ), "bebe"],

  // La hamburguesa va ANTES que el queso: el queso aparece en su nombre como
  // ingrediente ("Burger meat de vaca madurada con cheddar inglés"), igual que en
  // la ensalada. Es carne picada, no queso.
  [palabras("hamburguesa", "burger meat", "burguer meat", "burger", "burguer"), "carne"],

  // Quesos. El caso que reportó el usuario. Van antes que la charcutería porque
  // "Queso" + un embutido en el mismo nombre es un lote de queso ("Lote: 250gr
  // Lacón + 250gr Queso Brie") y porque el queso es lo que hay que sacar de aquí.
  [palabras(
    "queso", "quesito", "mozzarella", "mozarella", "burrata", "burratina", "parmesano", "parmigiano",
    "mascarpone", "requeson", "ricotta", "cottage", "manchego", "brie", "camembert", "roquefort",
    "gorgonzola", "cheddar", "emmental", "emmentaler", "gouda", "edam", "havarti", "feta",
    "provolone", "gruyere", "idiazabal", "torta del casar", "rulo de cabra", "tetilla", "mahon",
    "tronchon", "grana padano", "raclette", "fondue", "tete de moine", "babybel", "philadelphia",
    "tranchete", "tranchette"
  ), "charcuteria_quesos"],

  // Charcutería: curados y cocidos. En frases donde la palabra es ambigua
  // ("lomo" solo es también un corte de carne y un lomo de salmón).
  [palabras(
    "jamon", "chorizo", "salchichon", "fuet", "mortadela", "salami", "cecina", "sobrasada",
    "lacon", "chopped", "pate", "foie", "bacon", "panceta ahumada", "lomo embuchado",
    "cana de lomo", "de bellota", "paleta iberica", "paleta de cebo", "paleta curada",
    "paleta serrana", "paleta de bodega", "lomo de cebo", "lomo iberico", "panceta curada",
    "tocino iberico", "guanciale", "espetec", "embutido", "compango", "fiambre",
    "galantina", "pastrami", "coppa", "bresaola"
  ), "charcuteria_quesos"],

  // Embutido FRESCO: se cocina, no se lonchea. Va al mismo cajón que el resto de
  // la carnicería, como ya hace la regla de etiqueta ("embutido fresco" -> carne).
  [palabras("morcilla", "longaniza", "chistorra", "butifarra", "salchicha", "choricillo", "criollo"), "carne"],


  // Pescadería. Antes que la carnicería: "Lomo de salmón" y "Filete de sardina"
  // llevan las dos palabras de un corte de carne.
  [palabras(
    "salmon", "salmun", "merluza", "atun", "bacalao", "gamba", "langostino", "cigala", "calamar",
    "chipiron", "pota", "poton", "pulpo", "pulpito", "sardina", "anchoa", "boqueron", "almeja",
    "mejillon", "berberecho", "navaja", "sepia", "rodaballo", "lubina", "dorada", "trucha",
    "lenguado", "rape", "cazon", "emperador", "panga", "tilapia", "caballa", "jurel", "bonito",
    "palometa", "gallo del norte", "pez espada", "surimi", "kanikama", "mojama", "vieira",
    "centollo", "necora", "buey de mar", "percebe", "salazon", "gula", "marisco", "pescado",
    "pescaderia", "krissia", "aguinamar"
  ), "pescado_marisco"],

  // Que el producto es una BEBIDA ALCOHOLICA es tan distintivo como que es un helado,
  // asi que se decide antes que la pescaderia, la carniceria y la panaderia. Hace
  // falta porque las tres tienen palabras que las cerveceras usan en su nombre:
  // "Cerveza tostada" se iba a panaderia por "tostada" (42 productos) y "CERDOS
  // VOLADORES Cerveza" a carniceria por la marca. Medido sobre los 54.646 nombres, la
  // dos colisiones en el otro sentido son "Queso mezcla curado afinado en cavas" y
  // "Filetes de boqueron en vinagre de VINO blanco", y por eso el bloque va detras del
  // queso y de la pescaderia y no delante: las dos reglas que las protegen ya se han
  // ejecutado. Delante de la pescaderia el boqueron acababa en el lineal de licores.
  //
  // "ron" es seguro con \b: "macarrones" no tiene frontera de palabra antes de "ron",
  // que es el falso positivo que documenta la cabecera de POR_NOMBRE. NO entran
  // "anis" (el anis estrellado es una especia), "manzanilla" ni "fino" (infusiones),
  // ni "reserva"/"crianza", que son modificadores y no dicen que es el producto.
  [palabras(
    "vino", "cerveza", "whisky", "whiskey", "bourbon", "licor", "ginebra", "gin",
    "vodka", "ron", "tequila", "mezcal", "sidra", "cava", "champagne", "champan",
    "vermut", "vermouth", "sangria", "tinto de verano", "brandy", "cognac", "conac",
    "orujo", "pacharan", "absenta", "moscatel", "oporto", "jerez", "espumoso",
    "hidromiel"
  ), "bebidas_alcohol"],

  // Carnicería: cortes y aves. Sin "carne" a secas (ver regla 2 de arriba).
  // Sin `buey` a secas: "Tomate corazón de buey" es un tomate, y "buey de mar" ya
  // lo coge la pescadería de arriba. Mismo criterio que con "carne".
  [palabras(
    "pollo", "pavo", "cerdo", "ternera", "vacuno", "anojo", "cordero", "conejo", "lechazo",
    "cochinillo", "magret", "confit de pato", "pato entero",
    "pato pekin", "pato mulard", "muslo de pato", "pechuga de pato", "codorniz", "pechuga", "muslo", "contramuslo", "jamoncito", "alita",
    "alas adobadas", "chuleta", "chuleton", "entrecot", "solomillo", "costilla", "costillar",
    "secreto iberico", "secreto de cerdo", "presa iberica", "magro", "jarrete", "morcillo", "rabo", "callos", "higado",
    "molleja", "paletilla", "carne picada", "carne de vacuno", "carne de ternera",
    "carne de cerdo", "carne de buey", "carne mechada", "adobado", "adobada", "duroc", "angus",
    "churrasco"
  ), "carne"],

  // Horno, bollería y pastelería. Es el obrador de la tienda y en alcampo pesa:
  // sin este vocabulario quedaban ~200 productos de horno dentro de frutas y
  // verduras por el defecto del departamento.
  [palabras(
    "pan", "barra de pan", "hogaza", "chapata", "chapatina", "baguette", "panecillo", "bollo", "bollito",
    "bolleria", "croissant", "croisant", "napolitana", "ensaimada", "magdalena", "bizcocho", "bizcochada",
    "palmera", "palmerita", "rosquilla", "berlina", "donut", "dona", "tarta", "tartaleta",
    "pastel", "pasta almendrada", "banda de fruta", "hojaldre", "hojaldrito", "brioche", "empanada", "panaderia",
    "pasteleria", "reposteria", "tostada", "biscote", "colines", "picos", "caracola", "trenza",
    "roscon", "muffin", "brownie", "bocatin", "mollete", "gofre", "pepito",
    "cana rellena", "flauta", "candeal", "masa madre", "levadura fresca", "obrador"
  ), "panaderia_bolleria"],

  // Guarda: las bebidas vegetales se nombran por el cereal del que salen, así que
  // tienen que decidirse antes que el pasillo del muesli. Son 115 productos.
  [palabras("bebida vegetal", "bebida de avena", "bebida de soja", "bebida de almendra", "bebida de arroz", "bebida de coco", "bebida de anacardo"), "bebidas"],

  // --- Cereales y galletas. La galleta cae acá y no en panadería porque es lo que
  // declara POR_PALABRA (`galleta` -> cereales_galletas), y el bloque de panadería
  // de arriba ya se llevó lo que sí es obrador ("Tarta de galleta", 3 productos de
  // Frescos, medido).
  [palabras(
    "galleta", "cereal", "muesli", "granola", "copos de avena", "copos de maiz",
    "barrita de cereal", "barrita energetica", "salvado", "germen de trigo"
  ), "cereales_galletas"],

  // --- Dulces: lo distintivo. Va antes que los frutos secos por el mismo motivo
  // por el que va antes que la leche en el bloque de frescos: "Chocolate con
  // avellanas" es chocolate, no un aperitivo.
  [palabras(
    "chocolate", "bombon", "chocolatina", "tableta de chocolate", "turron",
    "mazapan", "polvoron", "caramelo", "gominola", "golosina", "regaliz", "chicle",
    "nube", "marshmallow", "crema de cacao", "sirope", "nata montada en spray",
    "cobertura de chocolate", "grageas"
  ), "dulces_chocolate"],

  // Guarda de cosmética: "leche" y "manteca" también nombran cosméticos, y sin
  // esto la regla de lácteos de la línea siguiente manda 91 protectores solares a
  // la nevera ("Leche solar protectora", "Leche corporal", "Leche desmaquillante").
  // Va pegada a la regla que corrige, y no en el bloque de cosmética del final,
  // porque tiene que adelantarse a "leche" y ahí ya sería tarde.
  [palabras(
    "leche solar", "leche corporal", "leche protectora", "leche desmaquillante",
    "leche limpiadora", "leche hidratante", "leche de belleza", "leche aftersun",
    "leche after sun", "manteca corporal", "mantequilla corporal"
  ), "cosmetica_perfumeria"],

  // Huevos y lácteos frescos. Después del queso a propósito: el queso también es
  // un lácteo, pero en esta taxonomía tiene su propio cajón con la charcutería.
  [palabras("huevo", "leche", "yogur", "nata", "mantequilla", "margarina", "cuajada", "kefir", "natilla", "flan", "arroz con leche", "crema catalana", "crema pastelera", "gelatina"), "lacteos_huevos"],

  // Cocina de la tienda: lo que ya viene hecho.
  [palabras(
    "pizza", "sushi", "tortilla", "croqueta", "empanadilla", "lasana", "canelon", "hummus",
    "tabule", "guacamole", "listo para", "precocinado", "wok", "poke", "falafel", "kebab",
    "sandwich", "bocadillo", "wrap", "paella", "fideua", "tortellini", "ravioli", "pasta fresca",
    "masa de"
  ), "platos_preparados"],

  // El membrillo del lineal de frescos es dulce de fruta, no fruta: mismo criterio
  // que "Frutos secos y fruta desecada" -> snacks, lo distintivo manda.
  [palabras("membrillo"), "dulces_chocolate"],

  // Las salsas y aliños del lineal de frescos (César, vinagreta, mostaza y miel)
  // son despensa, igual que los manda la regla de etiqueta `salsa`. No son un
  // plato preparado.
  // "alino" y no "aliño": estos patrones se comparan contra texto ya normalizado,
  // donde la ñ es una n. Es el mismo fallo que documenta POR_PALABRA más arriba.
  [palabras("salsa", "vinagreta", "alino", "mostaza", "mayonesa", "ketchup", "alioli"), "despensa"],

  // ===========================================================================
  // La otra mitad del súper: todo lo que no es el lineal de frescos.
  // ===========================================================================
  //
  // Hasta acá la tabla sólo sabía de frescos, porque se escribió para un único
  // departamento ("Frescos" de alcampo). Ahora la usan dos cosas más -- los
  // departamentos gruesos de alcampo y la pasada de respaldo de `resolve` -- y las
  // dos ven el catálogo entero: bebidas, droguería, perfumería, desayuno.
  //
  // Todo lo que sigue va DESPUÉS del bloque de frescos, y no es casualidad: es lo
  // que hace que ampliar la tabla no pueda romper lo que ya acertaba. Las reglas
  // de frescos ya se ejecutaron, así que ningún nombre de queso, pescado, carne o
  // bollería llega hasta acá. Sólo se sube algo cuando hay evidencia medida de que
  // tiene que ganarle a una regla de frescos, y entonces se documenta arriba.
  //
  // El criterio para elegir el cajón NO es la opinión de quien escribe: es el que
  // ya declara POR_PALABRA para ese tipo de producto. Así el mapa no inventa una
  // convención nueva por debajo. Ejemplos que salieron de aplicarlo: el champú es
  // higiene y no cosmética (POR_PALABRA lo dice), el papel higiénico es
  // papel_desechables y no droguería, y el vino es bebidas_alcohol y no bebidas.
  // Donde POR_PALABRA es ambiguo se deja sin regla, no se decide acá.

  // --- Mascotas y bebé, primero: son un cajón por destinatario, no por producto,
  // así que un champú de perro es mascotas y no higiene.
  // El pañal va acá abajo y no en la guarda de bebé de arriba: "Panales de cabello
  // de ángel" es un dulce de obrador, y la panadería tiene que decidir antes.
  [palabras("panal", "toallita humeda"), "bebe"],
  [palabras("para perro", "para gato", "pienso", "arena de gato", "arena para gato", "lecho para gato", "snack para perro", "comida para perro", "comida para gato", "collar antiparasitario"), "mascotas"],



  // --- Pilas e iluminación. Las velas entran acá por la misma razón por la que
  // `scope.js` las mantiene en el catálogo: mercadona tiene su propio pasillo
  // ("Velas y decoración", 19 productos) y es lo más cerca de "iluminación" que
  // hay entre los cajones.
  [palabras("pila alcalina", "pilas alcalinas", "bombilla", "linterna", "vela", "tealight", "candelita", "portapilas", "cargador de pilas"), "pilas_iluminacion"],

  // --- Parafarmacia. Sin "vitamina" a secas: la usan los champús ("Champú con
  // vitaminas frutales") y ahí la regla se lleva la cosmética entera. Sólo entran
  // las formas en que se nombra un COMPLEMENTO, que no son ambiguas.
  [palabras(
    "complemento alimenticio", "suplemento", "multivitaminico", "colageno",
    "vitaminas y minerales", "comprimido efervescente", "capsula blanda", "creatina", "magnesio", "omega 3",
    "probiotico", "jalea real", "ginseng", "valeriana", "melatonina",
    "tirita", "venda", "esparadrapo", "gasa esteril", "suero fisiologico",
    "alcohol sanitario", "agua oxigenada", "termometro", "preservativo",
    "lubricante intimo", "gel lubricante", "hoja afeitar", "test de embarazo", "jarabe",
    "ibuprofeno", "paracetamol", "aspirina", "solucion salina"
  ), "parafarmacia"],



  // --- Cosmética y perfumería: lo específico. Lo genérico ("crema", "loción")
  // espera al final del bloque, ya pasada toda la comida, porque "Crema de jamón"
  // y "Crema de puerros" también son cremas.
  //
  // Las tres primeras líneas son guardas de palabras de comida usadas en
  // cosmética: "Agua micelar" (no es agua de beber), "Aceite capilar" (no es
  // aceite de oliva). Sin ellas caen en bebidas y en despensa: 43 y 213 productos
  // medidos.
  [palabras("agua micelar", "agua de perfume", "agua de colonia", "agua termal", "bruma facial"), "cosmetica_perfumeria"],
  [palabras("aceite capilar", "aceite corporal", "aceite esencial", "aceite desmaquillante", "aceite de labios", "aceite para el cuerpo"), "cosmetica_perfumeria"],
  [palabras(
    "perfume", "colonia", "eau de toilette", "eau de parfum", "after shave",
    "aftershave", "maquillaje", "base de maquillaje", "corrector de ojeras",
    "mascara de pestanas", "rimel", "pintalabios", "barra de labios",
    "brillo de labios", "colorete", "sombra de ojos", "delineador", "eyeliner",
    "lapiz de ojos", "lapiz de cejas", "lapiz de labios", "esmalte de unas",
    "quitaesmalte", "laca de unas", "laca", "espuma para el pelo", "gomina",
    "cera para el pelo", "tinte", "coloracion", "decolorante", "depilatoria",
    "depilatorio", "cera depilatoria", "banda depilatoria", "maquinilla", "maquina de afeitar",
    "cuchilla de afeitar", "hoja de afeitar", "sistema afeitado", "espuma de afeitar",
    "gel de afeitar", "brocha de afeitar", "cortaunas", "tijera de unas",
    "lima de unas", "pinza de unas", "alicate de unas", "alicate unas", "fijador", "disco desmaquillante", "toallita desmaquillante",
    "algodon desmaquillante", "autobronceador", "manicura", "pedicura"
  ), "cosmetica_perfumeria"],


  // --- Bebidas sin alcohol. "bebida vegetal" y "bebida de avena" van acá y hacen
  // de guarda de la regla de cereales de abajo: son 115 bricks de avena que sin
  // esto acaban en el pasillo del muesli.
  [palabras(
    "refresco", "zumo", "nectar", "smoothie", "bebida isotonica", "bebida energetica",
    "bebida vegetal", "bebida de avena", "bebida de soja", "bebida de almendra",
    "bebida de arroz", "bebida de coco", "agua mineral", "agua vitaminada",
    "agua con gas", "agua sin gas", "agua de mar", "te al limon", "te frio", "bebida de te", "tonica", "gaseosa", "limonada",
    "horchata", "kombucha", "mosto", "sifon", "granizado de limon", "agua"
  ), "bebidas"],



  // --- Guardas de despensa antes de la pasta y de los frutos secos: "nuez
  // moscada" es una especia (11 productos) y "pasta de azúcar" es repostería, no
  // pasta alimenticia.
  [palabras("crema de fruta", "almibar", "en conserva", "escabeche", "al natural"), "despensa"],
  [palabras(
    "nuez moscada", "pasta de azucar", "pasta de vainilla", "pasta de sesamo",
    "pasta de achiote", "pasta de curry", "pasta de tomate", "pasta de aceituna",
    "pasta de fijacion", "crema de verdura", "crema de puerro", "crema de calabaza",
    "crema de calabacin", "crema de champinon", "crema de guisante"
  ), "despensa"],

  // --- Pasta, arroz y legumbres. "pasta" a secas se puede usar porque las tres
  // formas en que NO es pasta alimenticia ya se fueron arriba: "pasta de dientes"
  // en el bloque de higiene, y "pasta de azúcar/sésamo/fijación" en la guarda de
  // la línea anterior. Medido: de los 256 nombres con "pasta de", los que quedan
  // son "Pasta de sémola de trigo duro", que sí es pasta.
  [palabras(
    "pasta", "macarron", "espagueti", "spaghetti", "tallarin", "fideo", "noodle",
    "ramen", "penne", "fusilli", "farfalle", "tagliatelle", "rigatoni", "helice",
    "arroz", "lenteja", "garbanzo", "alubia", "judia blanca", "judion", "fabe",
    "quinoa", "cuscus", "couscous", "bulgur", "mijo", "soja texturizada", "semola"
  ), "pasta_arroz_legumbres"],


  // --- Aperitivos y frutos secos: la parte que tuvo que esperar a la charcutería.
  // "aceituna", "snack", "aperitivo", "almendra" y "pistacho" están acá abajo y no
  // en la guarda de arriba porque los usa el embutido: "Mortadela con aceitunas",
  // "Fiambre de pavo con pistachos", "Mini fuet ideal como snack" (28 productos de
  // Frescos, medido). Acá ya no hay riesgo: la charcutería se los quedó antes.
  [palabras(
    "aceituna", "encurtido", "pepinillo", "banderilla", "altramuz", "alcaparra",
    "almendra", "avellana", "nuez", "pistacho", "anacardo", "cacahuete", "macadamia",
    "pecana", "pinon", "fruto seco", "frutos secos", "chicharron", "snack", "aperitivo",
    "coctel de frutos", "mezcla de frutos", "orejon", "pasa sultana"
  ), "snacks"],

  // --- Dulces: lo genérico. Al final del bloque de comida porque "miel" y
  // "azúcar" aparecen como ingrediente en cosas que no son dulces: "Cacahuetes
  // tostados con miel" (aperitivo), "Salsa barbacoa con miel" (despensa), "Pan con
  // miel" (panadería). Los tres cajones ya decidieron antes. Medido: 11 productos.
  [palabras(
    "miel", "mermelada", "confitura", "jalea", "edulcorante", "sacarina",
    "estevia", "panela", "melaza", "azucar blanco", "azucar moreno", "azucar glas",
    "azucar de cana", "azucar invertido", "azucarillo"
  ), "dulces_chocolate"],

  // --- Despensa: lo genérico. Es el cajón más ancho, así que va al final de la
  // comida: cualquier cosa que una regla más específica haya reconocido ya se fue.
  [palabras(
    "aceite", "vinagre", "especia", "sazonador", "condimento", "conserva",
    "harina", "levadura", "sal fina", "sal gruesa", "sal marina", "pimienta",
    "pimenton", "azafran", "oregano", "curry", "comino", "canela", "clavo en grano",
    "laurel", "palmito", "alcachofa en conserva", "maiz dulce",
    "fabada", "preparado para cocido", "preparado para fabada", "cocido en conserva",
    "callos en salsa", "tomate frito",
    "tomate triturado", "tomate natural", "leche de coco", "nata para cocinar",
    "caldo concentrado", "colorante alimentario", "gelatina en polvo", "cuajo",
    "pan rallado", "fecula", "maicena", "tahina", "hummus en conserva"
  ), "despensa"],

  // --- Fruta y verdura, y sólo acá al final. POR_NOMBRE no tiene vocabulario de
  // frutería por diseño, y el comentario de arriba explica por qué: en "Frescos" el
  // cajón por defecto YA es frutas_verduras, así que escribir la lista no aporta
  // nada y en cambio se lleva la "Tarta de manzana" del obrador y el "Jamón con
  // melón" de la charcutería. Acá abajo esa objeción no aplica: la panadería, la
  // charcutería, los lácteos, las bebidas y la despensa ya decidieron. Lo que llega
  // hasta este punto llamándose "Melón" es un melón, y hacía falta para las hojas
  // sin rama de bm ("Melones y sandías", "Guisantes, judías y habas").
  [palabras(
    "guisante", "judia verde", "haba", "melon", "sandia", "perejil", "cilantro",
    "hierbabuena", "albahaca", "hierba aromatica", "brote", "germinado"
  ), "frutas_verduras"],

  // --- Cosmética: lo genérico, y por eso lo último de todo. "crema", "loción" y
  // "mascarilla" las comparte media tienda ("Crema de jamón", "Crema de puerros",
  // "Mascarilla capilar"), así que sólo puede decidir cuando ya han hablado la
  // charcutería, la despensa y la higiene. Lo que llega hasta acá con la palabra
  // "crema" es un cosmético.
  [palabras(
    "crema facial", "crema corporal", "crema de manos", "crema de dia",
    "crema de noche", "crema antiarrugas", "contorno de ojos", "serum",
    "exfoliante", "tonico facial", "protector solar", "proteccion solar",
    "aftersun", "after sun", "mascarilla facial", "mascarilla capilar",
    "parche hidrocoloide", "hidratante corporal", "locion", "crema", "mascarilla"
  ), "cosmetica_perfumeria"],
];

// Alcampo pega el CORTE al final del nombre, detrás de un guion: "Queso azul -
// Trozo", "Queso Cheddar rojo MINSTREL - Taco ensalada 1 cm", "Pollo al horno
// relleno. - Loncha gruesa 3 a 4 mm". No es parte del producto y contamina el
// match: seis quesos se iban a frutas y verduras porque su corte se llama "taco
// ENSALADA". Se recorta sólo detrás de una palabra de corte conocida, no de
// cualquier guion, que en otros nombres sí separa información útil.
const CORTE = /\s-\s+(taco|loncha|lonchas|trozo|rodaja|rodajas|filete|filetes|pieza|entero|entera|entera limpia|media|medios|cuna|rallado|granel)\b.*$/;

function porNombre(name) {
  if (!name) return null;
  const texto = normaliza(name).replace(CORTE, "");
  for (const [re, destino] of POR_NOMBRE) {
    if (re.test(texto)) return destino;
  }
  return null;
}

function departamentoDe(supermercado, category) {
  const tabla = DEPARTAMENTOS[normaliza(supermercado)];
  if (!tabla || !category) return null;
  const buscado = normaliza(category);
  for (const clave of Object.keys(tabla)) {
    if (normaliza(clave) === buscado) return tabla[clave];
  }
  return null;
}

// Resuelve el cajón de un producto. Devuelve { canonical, aisle, source }, donde
// `canonical` puede ser un id, FUERA_DE_ALCANCE, NO_FIABLE o null (sin resolver).
function resolve(product) {
  const path = Array.isArray(product.category_path)
    ? product.category_path.map((s) => String(s || "").trim()).filter(Boolean)
    : pathToArray(product.category_path);

  const aisle = aisleFrom(product);

  const porRuta = porPrefijo(product.supermercado, path);
  if (porRuta) return { canonical: porRuta, aisle, source: "path" };

  // El departamento va antes que la etiqueta exacta: la etiqueta existe (es
  // "Frescos") pero no es un pasillo, así que resolverla por etiqueta es
  // precisamente el bug. Cuando el nombre no dice nada, cae al defecto declarado,
  // que es el mismo cajón que daba la etiqueta.
  const departamento = departamentoDe(product.supermercado, product.category);
  if (departamento) {
    const porElNombre = porNombre(product.name);
    if (porElNombre) return { canonical: porElNombre, aisle, source: "name" };
    return { canonical: departamento, aisle, source: "category" };
  }

  const etiqueta = porEtiqueta(product.supermercado, product.category);
  if (etiqueta) return { canonical: etiqueta, aisle, source: "category" };

  // La palabra clave se prueba sobre la hoja de la ruta si la hay, y si no sobre la
  // etiqueta plana: la hoja es más específica y por tanto más informativa.
  const palabra = porPalabra(aisle) || porPalabra(product.category);
  if (palabra) return { canonical: palabra, aisle, source: "keyword" };

  // Quinta pasada: el NOMBRE del producto, sin departamento declarado. Es el
  // último recurso y por eso va al final, pero cubre el agujero más grande del
  // mapa: bm captura la hoja SIN su rama ("Secas", "Lonchas", "Oveja", "Rostro",
  // "Máquina líquido"), y una hoja así no se puede resolver por su texto porque
  // no dice de qué habla. El nombre del producto sí ("Alubia blanca larga 1 kg",
  // "Queso en lonchas 8 unidades", "Detergente líquido ropa delicada").
  //
  // Es segura por construcción, y es la misma garantía que hace segura la pasada
  // de DEPARTAMENTOS: sólo se ejecuta sobre las filas que hoy NO tienen cajón, así
  // que no puede mover de sitio nada que ya esté clasificado. Un producto que
  // tampoco reconozca por el nombre sigue saliendo sin cajón, visible en la
  // cobertura, exactamente como hoy.
  //
  // Lo que NO es: un sustituto de POR_ETIQUETA. Cuando la etiqueta sirve, decide
  // ella, porque el retailer sabe en qué pasillo puso el producto y el nombre sólo
  // lo sugiere.
  const nombre = porNombre(product.name);
  if (nombre) return { canonical: nombre, aisle, source: "name" };

  return { canonical: null, aisle, source: null };
}

function esCanonica(valor) {
  return typeof valor === "string" && ID_CANONICAS.has(valor);
}

// Valores de `category_source`. Los tres primeros dicen de qué pasada salió el
// cajón; los dos últimos dicen por qué NO hay cajón, que es información distinta:
// "la etiqueta miente, decide el nombre" no es lo mismo que "no supe".
// Mezclarlos hacía que /categorias reportara 8.869 sin clasificar cuando los
// realmente sin resolver eran 2.846.
const FUENTE_NO_FIABLE = "no_fiable";
const FUENTE_FUERA_DE_ALCANCE = "fuera_de_alcance";

// Las cuatro columnas que se guardan, derivadas en un solo sitio. Antes esto
// estaba duplicado entre el ingest y el script de recategorización, que es
// justo la clase de duplicación que hace que las dos copias se separen.
function columnsFor(product) {
  const { canonical, aisle, source } = resolve(product);
  const cajon = esCanonica(canonical);

  let fuente = null;
  if (cajon) fuente = source;
  else if (canonical === NO_FIABLE) fuente = FUENTE_NO_FIABLE;
  else if (canonical === FUERA_DE_ALCANCE) fuente = FUENTE_FUERA_DE_ALCANCE;

  return {
    category_path: pathToString(
      Array.isArray(product.category_path) ? product.category_path : pathToArray(product.category_path)
    ),
    aisle: aisle || null,
    canonical_category: cajon ? canonical : null,
    category_source: fuente,
  };
}

function canonicaPorId(id) {
  return CANONICAS.find((c) => c.id === id) || null;
}

module.exports = {
  CANONICAS,
  DEPARTAMENTOS,
  POR_NOMBRE,
  PASILLOS_SINONIMOS,
  PASILLOS_POR_PALABRA,
  clavePasillo,
  nombrePasillo,
  FUERA_DE_ALCANCE,
  NO_FIABLE,
  FUENTE_NO_FIABLE,
  FUENTE_FUERA_DE_ALCANCE,
  columnsFor,
  SEPARADOR,
  resolve,
  aisleFrom,
  pathToString,
  pathToArray,
  esCanonica,
  canonicaPorId,
  POR_ETIQUETA,
  POR_PALABRA,
  POR_PREFIJO,
};
