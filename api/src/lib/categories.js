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
    "Frescos": "frutas_verduras",
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

  [/fruta|verdura|hortaliza|ensalada|lechuga|tomate|patata|cebolla|pimiento|zanahoria|platano|manzana|naranja|aguacate|champinon|seta|fruteria|verduleria|^frescos$|fresco de|granja/i, "frutas_verduras"],

  [/pan\b|panaderia|bolleria|bizcocho|magdalena|croissant|donut|pasteleria|reposteria|tarta|coca|bolleria|barrita|tostad|biscote|molde|picos|rosquillet|picatoste|colines/i, "panaderia_bolleria"],
  [/galleta|cereal|muesli|copos|barritas de cereal|desayuno|almuerzo|merienda/i, "cereales_galletas"],
  [/snack|aperitivo|patatas fritas|fruto seco|frutos secos|cortez|nachos|palomitas|encurtido|aceituna|tortita|picoteo|picar/i, "snacks"],

  [/pasta|fideo|arroz|legumbre|lenteja|garbanzo|alubia|judia seca|cuscus|quinoa|noodle|espagueti|macarron/i, "pasta_arroz_legumbres"],
  [/aceite|vinagre|sal\b|especia|sazonador|salsa|conserva|caldo|sopa|crema de verdura|harina|levadura|tomate frito|mayonesa|ketchup|mostaza|condimento|despensa|alimentacion|cocina mejicana|cocina oriental|cocina italiana|sabores de|nutricion deportiva|proteina|dietetic|esparrago|palmito|alcachofa|pimiento|maiz dulce|guarnicion/i, "despensa"],

  [/papel higienic|papel de cocina|servilleta|panuelo|celulosa|film|aluminio|bolsa de basura|desechable|vajilla desechable/i, "papel_desechables"],
  [/calcetin|media\b|medias\b|ropa|textil|prenda|complemento|accesorio(s)? y complemento/i, FUERA_DE_ALCANCE],
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

// Resuelve el cajón de un producto. Devuelve { canonical, aisle, source }, donde
// `canonical` puede ser un id, FUERA_DE_ALCANCE, NO_FIABLE o null (sin resolver).
function resolve(product) {
  const path = Array.isArray(product.category_path)
    ? product.category_path.map((s) => String(s || "").trim()).filter(Boolean)
    : pathToArray(product.category_path);

  const aisle = aisleFrom(product);

  const porRuta = porPrefijo(product.supermercado, path);
  if (porRuta) return { canonical: porRuta, aisle, source: "path" };

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

function canonicaPorId(id) {
  return CANONICAS.find((c) => c.id === id) || null;
}

module.exports = {
  CANONICAS,
  FUERA_DE_ALCANCE,
  NO_FIABLE,
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
