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
    "Alimentación": "despensa",
    // "Frescos" NO va aquí: es un departamento entero (frutería + carnicería +
    // pescadería + charcutería + quesería + horno), no un pasillo. Está en
    // DEPARTAMENTOS, que lo resuelve por el nombre del producto.
    "Desayuno y Merienda": "cereales_galletas",
    "Bebidas": "bebidas",
    "Perfumeria": "cosmetica_perfumeria",
    "Droguería": "limpieza_drogueria",
    "Leche, Huevos, Lácteos, Yogures y Bebidas vegetales": "lacteos_huevos",
    "Congelados": "congelados",
    "Bebé": "bebe",
    "Parafarmacia": "parafarmacia",
    "Mascotas": "mascotas",
    "Comida Preparada": "platos_preparados",
    "Sin Gluten / Sin Lactosa, Nutrición deportiva y Funcional": "despensa",
    "Supermercado Ecológico": "despensa",
    "Veganos": "despensa",
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
    "Higiene y cuidado del cuerpo": "higiene_personal",
    "Limpieza y hogar": "limpieza_drogueria",
    "Cervezas, vinos y licores": "bebidas_alcohol",
    "Cabello y perfumería": "cosmetica_perfumeria",
    "Chocolates y golosinas": "dulces_chocolate",
    "Galletas, cereales y mermeladas": "cereales_galletas",
    "Conservas, caldos y cremas": "despensa",
    "Aceites, salsas y especias": "despensa",
    "Aperitivos y frutos secos": "snacks",
    "Agua y refrescos": "bebidas",
    "Congelados y helados": "congelados",
    "Bollería, repostería y azúcar": "panaderia_bolleria",
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
    "Limpieza y hogar": "limpieza_drogueria",
    "Congelados": "congelados",
    "Charcutería": "charcuteria_quesos",
    "Chocolates y dulces": "dulces_chocolate",
    "Platos preparados y pizzas": "platos_preparados",
    "Cuidado personal": "higiene_personal",
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

  [/panal|bebe|infantil|potito|papilla|chupete|biberon|puericultura/i, "bebe"],
  [/mascota|perro|gato|pienso|felino|canino|roedor|pajaro|acuario/i, "mascotas"],

  [/cerveza|vino|licor|whisky|ginebra|ron|vodka|sidra|cava|champan|vermut|espumoso|alcohol|destilado|aperitivo con alcohol/i, "bebidas_alcohol"],
  [/cafe|cacao|infusion|te e |^te$|capsula|molido|soluble|descafeinado/i, "cafe_te"],
  [/refresco|agua|zumo|smoothie|isotonic|energetic|bebida vegetal|nectar|horchata|gaseosa|cola\b|tonica|limonada|^bebidas?$|bebidas sin/i, "bebidas"],

  [/helado|congelad|ultracongelad/i, "congelados"],
  [/platos? preparados?|precocinad|pizza|lasana|canelon|croqueta|empanad|rebozad|tortilla|sushi|kebab|comida preparada|listo para|quinta gama/i, "platos_preparados"],

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
// Sólo los pasillos GENÉRICOS de fruta y verdura, que es el caso reportado y el
// que más pesa (unas 550 filas repartidas en 12 nombres). Los específicos
// ("Tomate", "Naranja", "Lechuga y ensalada preparada") se quedan como están.
const PASILLOS_SINONIMOS = {
  "fruta": "Frutas y verduras",
  "verdura": "Frutas y verduras",
  "fruta y verdura": "Frutas y verduras",
  "verdura y hortaliza": "Frutas y verduras",
  "fruta y hortaliza": "Frutas y verduras",
  "fruta variada": "Frutas y verduras",
  "fruta de temporada": "Frutas y verduras",
  "otra verdura": "Frutas y verduras",
  "otra verdura y hortaliza": "Frutas y verduras",
  "mezcla de verdura": "Frutas y verduras",
  "verdura preparada": "Frutas y verduras",
  "fruteria": "Frutas y verduras",
};

// La clave de agrupación de un nombre de pasillo. Dos pasillos con la misma clave
// son el mismo pasillo.
function clavePasillo(nombre) {
  const base = normaliza(nombre).split(/\s+/).filter(Boolean).map(claveMorfologica).join(" ");
  if (!base) return null;
  const sinonimo = PASILLOS_SINONIMOS[base];
  // El sinónimo se resuelve a la clave de SU nombre canónico, para que las doce
  // variantes de fruta y verdura acaben en una única clave y no en doce que
  // comparten etiqueta.
  return sinonimo ? normaliza(sinonimo).split(/\s+/).map(claveMorfologica).join(" ") : base;
}

// El nombre canónico de un pasillo, si está escrito a mano. Cuando no lo está
// devuelve null y el que llama elige la ortografía (la del pasillo con más
// productos detrás), que es lo único honesto: entre "Frutas" y "Fruta" no hay una
// correcta, hay una mayoritaria.
function nombrePasillo(nombre) {
  const base = normaliza(nombre).split(/\s+/).filter(Boolean).map(claveMorfologica).join(" ");
  return PASILLOS_SINONIMOS[base] || null;
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
const DEPARTAMENTOS = {
  alcampo: { "Frescos": "frutas_verduras" },
  ahorramas: { "Frescos": "frutas_verduras" },
  bm: { "Frescos": "frutas_verduras" },
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
  return new RegExp(`\\b(?:${lista.join("|")})(?:es|s)?\\b`);
}

const POR_NOMBRE = [
  // La ensalada de bolsa va PRIMERO: se llama por sus ingredientes ("Ensalada de
  // queso de cabra, nueces y manzana"), así que cualquier regla de queso, pollo o
  // atún se la lleva antes. Es verdura preparada, igual que el pasillo "Lechuga y
  // ensalada preparada" de mercadona.
  [palabras("ensalada", "ensaladilla", "brotes tiernos", "canonigo", "rucula", "escarola", "radicchio", "mezclum"), "frutas_verduras"],

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
    "salmon", "merluza", "atun", "bacalao", "gamba", "langostino", "cigala", "calamar",
    "chipiron", "pota", "poton", "pulpo", "pulpito", "sardina", "anchoa", "boqueron", "almeja",
    "mejillon", "berberecho", "navaja", "sepia", "rodaballo", "lubina", "dorada", "trucha",
    "lenguado", "rape", "cazon", "emperador", "panga", "tilapia", "caballa", "jurel", "bonito",
    "palometa", "gallo del norte", "pez espada", "surimi", "kanikama", "mojama", "vieira",
    "centollo", "necora", "buey de mar", "percebe", "salazon", "gula", "marisco", "pescado",
    "pescaderia", "krissia", "aguinamar"
  ), "pescado_marisco"],

  // Carnicería: cortes y aves. Sin "carne" a secas (ver regla 2 de arriba).
  // Sin `buey` a secas: "Tomate corazón de buey" es un tomate, y "buey de mar" ya
  // lo coge la pescadería de arriba. Mismo criterio que con "carne".
  [palabras(
    "pollo", "pavo", "cerdo", "ternera", "vacuno", "anojo", "cordero", "conejo", "lechazo",
    "cochinillo", "pato", "codorniz", "pechuga", "muslo", "contramuslo", "jamoncito", "alita",
    "alas adobadas", "chuleta", "chuleton", "entrecot", "solomillo", "costilla", "costillar",
    "secreto", "presa iberica", "magro", "jarrete", "morcillo", "rabo", "callos", "higado",
    "molleja", "paletilla", "carne picada", "carne de vacuno", "carne de ternera",
    "carne de cerdo", "carne de buey", "carne mechada", "adobado", "adobada", "duroc", "angus",
    "churrasco"
  ), "carne"],

  // Horno, bollería y pastelería. Es el obrador de la tienda y en alcampo pesa:
  // sin este vocabulario quedaban ~200 productos de horno dentro de frutas y
  // verduras por el defecto del departamento.
  [palabras(
    "pan", "barra de pan", "hogaza", "chapata", "chapatina", "baguette", "panecillo", "bollo",
    "bolleria", "croissant", "napolitana", "ensaimada", "magdalena", "bizcocho", "bizcochada",
    "palmera", "palmerita", "rosquilla", "berlina", "donut", "dona", "tarta", "tartaleta",
    "pastel", "pasta almendrada", "hojaldre", "hojaldrito", "brioche", "empanada", "panaderia",
    "pasteleria", "reposteria", "tostada", "biscote", "colines", "picos", "caracola", "trenza",
    "roscon", "muffin", "brownie", "galleta", "bocatin", "mollete", "gofre", "pepito",
    "cana rellena", "flauta", "candeal", "masa madre", "levadura fresca", "obrador"
  ), "panaderia_bolleria"],

  // Huevos y lácteos frescos. Después del queso a propósito: el queso también es
  // un lácteo, pero en esta taxonomía tiene su propio cajón con la charcutería.
  [palabras("huevo", "leche", "yogur", "nata", "mantequilla", "margarina", "cuajada", "kefir", "natilla", "flan", "arroz con leche"), "lacteos_huevos"],

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
