// Tests de la detección de bazar. La mayoría son casos que salieron de los datos
// reales o de trampas concretas: nombres donde una palabra de utensilio aparece
// dentro de un producto que sí es de la compra.
// Uso: npm test
const assert = require("assert");
const scope = require("../src/lib/scope");

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

const clasificar = (name, extra = {}) =>
  scope.classify({ name, supermercado: "alcampo", ...extra });

function dentro(name, extra) {
  const r = clasificar(name, extra);
  assert.strictEqual(r.decision, scope.MANTENER, `"${name}" salió como ${r.decision} (${r.motivo})`);
}
function fuera(name, extra) {
  const r = clasificar(name, extra);
  assert.strictEqual(r.decision, scope.DESCARTAR, `"${name}" salió como ${r.decision} (${r.motivo})`);
}
function ambiguo(name, extra) {
  const r = clasificar(name, extra);
  assert.strictEqual(r.decision, scope.DUDOSO, `"${name}" salió como ${r.decision} (${r.motivo})`);
}

// --- Comida preparada: entra toda ------------------------------------------
//
// Es la clase que un clasificador tira por error, porque sus nombres llevan
// palabras de utensilio y de técnica de cocina.

test("la comida preparada se queda aunque el nombre diga plancha u horno", () => {
  dentro("Hamburguesa de ternera a la plancha");
  dentro("Hamburguesa vegetal de garbanzos");
  dentro("Pollo asado al horno con especias");
  dentro("Lomo a la plancha adobado");
  dentro("Merluza a la romana congelada");
  dentro("Verduras al vapor listas para calentar");
});

test("la comida preparada se queda aunque el nombre diga bandeja o sartén", () => {
  dentro("Bandeja de croquetas de jamón");
  dentro("Sartén de pollo salteado con verduras");
});

test("los platos preparados típicos entran", () => {
  for (const plato of [
    "Tortilla de patatas refrigerada",
    "Ensaladilla rusa",
    "Croquetas de bacalao",
    "Canelones de carne",
    "Lasaña boloñesa",
    "Empanada de atún",
    "Rebozados de merluza",
    "Pizza cuatro quesos",
    "Albóndigas en salsa",
    "San Jacobo de jamón y queso",
    "Paella de marisco",
    "Gazpacho fresco",
    "Sopa de pollo con fideos",
  ]) dentro(plato);
});

test("los utensilios con los que se confunde la comida preparada salen", () => {
  fuera("Sartén de acero inoxidable 28cm, ACTUEL");
  fuera("Plancha de vapor QILIVE 2400W");
  fuera("Molde de repostería desmontable 24cm de acero");
  fuera("Parrilla de barbacoa de hierro fundido 45cm");
  fuera("Cafetera italiana de aluminio para 6 tazas");
  fuera("Microondas QILIVE 20 litros 700W");
});

test("los compuestos que parecen comida pero son utensilio salen", () => {
  // Salieron de los datos: no llevan la palabra suelta, la llevan pegada.
  fuera("Cortapizzas de acero inoxidable con mango de plástico, 20 cm ACTUEL");
  fuera("Portatortillas, varios colores, TATAY");
});

// --- Las trampas de nombre ------------------------------------------------

test("aceite de oliva se queda, aceite de motor sale", () => {
  dentro("Aceite de oliva virgen extra 5 l");
  fuera("Aceite de motor 5W30 sintético");
});

test("el papel de cocina y el higiénico se quedan, el de regalo sale", () => {
  dentro("Papel higiénico doble rollo");
  dentro("Papel de cocina absorbente");
  dentro("Papel de aluminio ALBAL 30 metros", { measure_unit: "m" });
  dentro("Papel de horno precortado");
  fuera("Papel de regalo estampado 2x0,7m");
});

test("las bolsas de basura se quedan, las de viaje salen", () => {
  dentro("Bolsas de basura 30L con autocierre");
  fuera("Bolsa de viaje plegable de poliéster 40x20cm");
});

test("la copa menstrual se queda, la copa de vino sale", () => {
  dentro("Copa menstrual talla S");
  fuera("Copa de vino de cristal 35cl");
});

test("las toallitas se quedan, las toallas salen", () => {
  dentro("Toallitas húmedas para bebé 60 uds");
  dentro("Toallitas lavadora anti-transferencia de color");
  fuera("Toalla de ducha 100% algodón 70x140cm");
});

test("el film y los desechables de cocina se quedan", () => {
  dentro("Film transparente de cocina 30m");
  dentro("Servilletas de papel 33x33cm 20 uds");
});

test("los limpiadores se quedan aunque nombren el objeto que limpian", () => {
  // Reales de mercadona: el nombre dice ollas, acero o cristales.
  dentro("Limpiador de Ollas y Cacerolas Bosque Verde", { supermercado: "mercadona" });
  dentro("Estropajo acero inoxidable limpieza muy fuerte", { supermercado: "mercadona" });
  dentro("Limpiacristales y multiusos");
  dentro("Detergente para lavadora 40 lavados");
});

test("la cosmética se queda aunque el nombre parezca de bazar", () => {
  dentro("Lima fibra de vidrio Deliplus", { supermercado: "mercadona" });
  dentro("Kit de brocha para polvos y estuche");
  dentro("Cinta dental con cera y sabor menta");
  dentro("Mascarilla capilar reparadora 300ml");
});

test("el bebé y las mascotas se quedan", () => {
  dentro("Chupete de silicona reversible +6 meses");
  dentro("Biberón 360 ml tetina silicona");
  dentro("Pienso para perro adulto de raza mediana");
  dentro("Arena para gato aglomerante 10L");
});

// --- Bazar que tiene que salir --------------------------------------------

test("los ejemplos que dio el usuario salen", () => {
  fuera("Bicicleta eléctrica YOUIN VIENA CREMA, 250W, vel max 25km/h, ruedas 28\"");
  fuera("Televisor LED 32 pulgadas HD");
  fuera("Juego de funda nórdica para cama 160cm");
  fuera("Gorro de natación de silicona");
  fuera("Depiladora facial Philips");
  fuera("Set de acumuladores de frío");
});

test("las especificaciones de objeto delatan el bazar", () => {
  fuera("Altavoz portátil 20W bluetooth");
  fuera("Batería externa 10000mAh USB-C");
  fuera("Vehículo mecanizado escala 1:43 ONE TWO FUN");
});

test("material más dimensión delata un objeto", () => {
  fuera("Plato hondo de loza decorada acabado brillo, 21cm");
  fuera("Taza jumbo de porcelana de 72cl");
  fuera("Recipiente de vidrio borosilicato 15x15x7 cm");
});

test("el material solo no basta: daba falsos positivos", () => {
  // "Lima fibra de vidrio" y "Estropajo acero" son de alcance, y no traen medida.
  const soloMaterial = clasificar("Producto con acero sin medidas");
  assert.notStrictEqual(soloMaterial.decision, scope.DESCARTAR);
});

test("lo que se vende por metros es bricolaje, salvo el papel de aluminio", () => {
  fuera("Cinta elástica flexible color blanco para costura", { measure_unit: "m" });
  dentro("Papel de aluminio 30 metros", { measure_unit: "m" });
});

test("el kilo y el litro protegen: el bazar se vende por unidades", () => {
  dentro("Cualquier cosa rara de nombre ambiguo", { measure_unit: "kg" });
  dentro("Otra cosa rara", { measure_unit: "l" });
});

// --- Marcas por cadena ----------------------------------------------------

test("las marcas de bazar de alcampo delatan, pero sólo en alcampo", () => {
  fuera("Cuchara de madera de haya, 35 cm, ACTUEL");
  // "Carrefour Essential" es comida y "Power Essential" un lavavajillas: la
  // misma palabra no puede decidir en otra cadena.
  dentro("Galletas María Carrefour Essential", { supermercado: "carrefour" });
  dentro("Lavavajillas Power Essential limón Finish", { supermercado: "mercadona" });
});

test("las marcas de alcance de mercadona protegen", () => {
  dentro("Plato llano Bosque Verde", { supermercado: "mercadona" });
  dentro("Toalla turbante seca pelo microfibra Deliplus", { supermercado: "mercadona" });
});

test("las marcas de comida de alcampo no se confunden con las de bazar", () => {
  dentro("AUCHAN Bacon cocido ahumado en lonchas 200 g", { measure_unit: "kg" });
  dentro("ALCAMPO CULTIVAMOS LO BUENO Sandía negra al peso", { measure_unit: "kg" });
});

// --- Lo ambiguo no se borra ------------------------------------------------

test("el plato y el vaso sin material siguen en dudoso: ahí hay mezcla real", () => {
  // Entre los dudosos reales conviven platos de cartón y platos de loza, así que
  // sin material en el nombre la cabeza sola no alcanza para decidir.
  ambiguo("Platos de 27 centímetros de diámetro, 5 unidades");
  ambiguo("Set de 4 vasos Sidra 520cc");
});

// --- pilas, bombillas y luces: criterio amplio de consumible de hogar -------

test("pilas, bombillas y cargadores de pilas se quedan", () => {
  for (const caso of [
    "Pilas alcalinas AA 4 uds",
    "Pila alcalina AAA LR03",
    "Bombilla Led E27, 8,5W=75W, luz fría 4000K, 1055lm, PHILIPS",
    "Pack de 2 bombillas Led E27, 7W=60W, PHILIPS",
    "Cargador de pilas AA y AAA, cable Usb",
    "Luz solar 11cm, GARDENSTAR",
    "luz solar colgante con bombilla para jardín, GARDEN STAR",
  ]) dentro(caso);
});

test("la bombilla de coche no se cuela con las de casa", () => {
  // Casquillo H7: es automóvil, no iluminación de hogar.
  fuera("Bombillas H7, 4000K, 55W, +130% visión, SUPERLITE WHITE PRO");
});

test("el cargador del móvil tampoco: sólo se protege el de pilas", () => {
  fuera("Cargador inalámbrico para móvil USB-C");
});

test("una palabra que sólo contiene 'pila' no activa la protección", () => {
  // "pilates" contiene "pila" pero no es una pila.
  fuera("Esterilla para yoga/pilates 140X50X0,5cm");
});

test("un juguete con luces no se salva por mencionar luces", () => {
  fuera("Pista tren del oeste, con sonidos y luces, ONE TWO FUN");
  fuera("Kit de luces para bicicleta, UMLED2 TNB");
});

// --- los huecos que encontró el auditor automático -------------------------

test("los sinónimos de vela entran, pero el soporte de vela no", () => {
  // Un tealight es una vela y no lleva la palabra: la lista estaba incompleta.
  for (const caso of [
    "Set 12 tealights perfumadas, aroma monoi, ACTUEL",
    "Set de 24 tealights con aroma Monoi, 3 colores, ACTUEL",
  ]) dentro(caso);
  // Un portavelas es un soporte de vidrio, no una vela.
  fuera("Portavelas de vidrio con doble uso, ACTUEL");
  fuera("Posavelas de cristal, 5x5x3,2cm, ACTUEL");
});

test("la errata de la fuente también se cubre", () => {
  // En los datos hay "Bobilla Led GU10", sin la m. Ninguna lista de términos lo
  // habría previsto; lo encontró el inventario de sustantivos del auditor.
  dentro("Bobilla Led GU10, 65W, luz fría, 4000K, 485lm, PHILIPS");
});

test("los envases desechables de comida entran", () => {
  dentro("Envases de cartón para alimentos, 10 unidades, Planet Friendly");
  dentro("Pack de 10 envases hechos de caña de azúcar");
});

test("P&H es marca de vajilla desechable, y sólo en alcampo", () => {
  for (const caso of [
    "20 platos P&H de cartón antigrasa",
    "Bol Kraft de 16 centímetros, serie Bali Kraft P&H pack de 10 u",
    "Moldes para magdalenas Nº8 P&H 50 unidades",
  ]) dentro(caso);
  assert.strictEqual(
    scope.classify({ name: "Algo P&H de loza 21cm", supermercado: "mercadona" }).decision,
    scope.DESCARTAR
  );
});

// --- decisiones de producto: desechables y velas entran --------------------

test("la vajilla desechable entra: se compra junto a las servilletas", () => {
  for (const caso of [
    "Tenedores desechables de caña, 10 unidades, Planet Friendly ACTUEL",
    "Set 36 cubiertos ACTUEL de madera desechables",
    "Cucharas desechables de caña, 10 unidades",
    "Cuchillos desechables de madera con mango decorado",
    "Platos desechables de cartón color amarillo, 23cm, 10 unidades, ACTUEL",
    "Vaso 23cl cartón 10unds decorados Limones ACTUEL",
    "50 vasos de cartón 25cl, color blanco, ACTUEL",
    "Mantel individual fibra de papel",
    "Vasos de plástico desechables de tubo 0,3 litros NUPIK",
  ]) dentro(caso);
});

test("el desechable gana a la regla de marca, que es lo que los partía en dos", () => {
  // ACTUEL vende bazar Y desechables. Al mirarse la marca antes que el tipo de
  // producto, los tenedores de cartón de ACTUEL acababan en la lista de borrado
  // mientras los vasos de cartón de NUPIK sólo llegaban a dudoso.
  const conMarca = clasificar("Tenedores desechables de cartón, 20 unidades, ACTUEL");
  assert.strictEqual(conMarca.decision, scope.MANTENER);
  assert.ok(/desechable/.test(conMarca.motivo), `ganó otra regla: ${conMarca.motivo}`);
});

test("pero el mismo utensilio reutilizable sigue fuera", () => {
  fuera("Cuchara de madera de haya, 35 cm, ACTUEL");
  fuera("Plato hondo de loza decorada acabado brillo, 21cm");
  fuera("Copa de vino de vidrio facetado de 28cl, ACTUEL");
});

test("las velas entran: mercadona tiene su propia categoría de velas", () => {
  for (const caso of [
    "Set de velas 100 unidades, PRODUCTO ECONOMICO ALCAMPO",
    "Vela perfumada frutos rojos en vaso pequeño de cristal",
    "Set de velas aromáticas 12 unidades jazmín",
    "VAHINÉ Velas dc comics superhéroes 15 uds",
    "Vela cementerio de color blanca con tapa",
  ]) dentro(caso);
});

test("los grupos que resultaron ser todos reutilizables ya no son dudosos", () => {
  // En estos grupos no había ni un producto desechable entre los dudosos reales.
  fuera("Cuchillo jamonero flexible de 24 centímetros, serie Mónaco ARCOS");
  fuera("Cuchara de helado de acero inoxidable, ALCAMPO");
  fuera("Tenedor de acero inoxidable oslo, ALCAMPO");
  fuera("Taza desayuno 42cl, TOGNANA Iris");
  fuera("Jarra para agua 1 litro LUMINARC");
  fuera("Cazo aluminio estampado 16cm, Savia MAGEFESA");
  fuera("Cesta de plástico para ropa, 33,5l");
  fuera("Tijeras de modista para costura, 17cm");
  fuera("Mantel vainica alg. 140x240cm beige");
});

test("un taper es menaje y una bolsa isotérmica también", () => {
  fuera("Recipiente hermético cuadrado de plástico, 0,25 litros");
  fuera("Set de 3 recipientes o tapers redondos, 0,5 L, ALCAMPO");
  fuera("Bolsa de compra térmica con capacidad de 28 litros");
  fuera("Bolsa porta alimentos color rojo más 2 tapers herméticos");
});

test("los consumibles de papel equivalentes siguen dentro", () => {
  dentro("Manteles de papel 100x100cm");
  dentro("Bolsas de basura 30L");
  dentro("Servilletas de papel 33x33cm");
  dentro("Papel de aluminio 30 metros", { measure_unit: "m" });
});

// --- La cascada: la categoría manda donde es fiable ------------------------

test("una categoría fuera de alcance descarta sin mirar el nombre", () => {
  const r = scope.decide({ supermercado: "alcampo", category: "Juguetes", name: "Cualquier cosa" });
  assert.strictEqual(r.decision, scope.DESCARTAR);
  assert.strictEqual(r.via, "categoria");
});

test("una categoría fiable y de alcance se queda sin mirar el nombre", () => {
  // Si la etiqueta es buena, no se cambia un dato cierto por una conjetura.
  const r = scope.decide({ supermercado: "alcampo", category: "Alimentación", name: "Sartén de acero 28cm" });
  assert.strictEqual(r.decision, scope.MANTENER);
  assert.strictEqual(r.via, "categoria");
});

test("sólo las categorías no fiables pasan por el nombre", () => {
  const r = scope.decide({
    supermercado: "alcampo", category: "Hogar y Decoración", name: "Sartén de acero 28cm",
  });
  assert.strictEqual(r.decision, scope.DESCARTAR);
  assert.strictEqual(r.via, "nombre");
});

test("Hogar y Decoración es no fiable: dentro hay consumibles que se quedan", () => {
  const r = scope.decide({
    supermercado: "alcampo", category: "Hogar y Decoración",
    name: "Papel de aluminio ALBAL 30 metros", measure_unit: "m",
  });
  assert.strictEqual(r.decision, scope.MANTENER);
});

test("sin categoría no hay etiqueta fiable: se mira el nombre", () => {
  // Las 103 filas sin categoría de aldi son su pasillo de oportunidades:
  // sartenes, destornilladores y pijamas. Tratarlas como fiables las dejaba
  // dentro del catálogo sin que nadie las revisara.
  assert.ok(scope.categoriaNoFiable("aldi", null));
  assert.ok(scope.categoriaNoFiable("aldi", "   "));
  assert.ok(!scope.categoriaNoFiable("aldi", "Limpieza y hogar"));

  const r = scope.decide({ supermercado: "aldi", category: null, name: "Sartén ø 28 cm" });
  assert.strictEqual(r.decision, scope.DESCARTAR);
  assert.strictEqual(r.via, "nombre");
  assert.strictEqual(
    scope.decide({ supermercado: "aldi", category: null, name: "Yogur natural" }).decision,
    scope.MANTENER
  );
});

test("el vocabulario corto de aldi también se pilla", () => {
  // Nombres de dos palabras, sin material ni medidas: hacen falta las palabras.
  for (const caso of ["Vestido de muselina", "Sandalias", "Arrocera", "Maletín de actividades", "Herramienta rotativa 4 V"]) {
    assert.strictEqual(
      scope.decide({ supermercado: "aldi", category: null, name: caso }).decision,
      scope.DESCARTAR,
      `"${caso}" no se descartó`
    );
  }
});

test("pero no a costa de la comida", () => {
  // "Globo de chocolate" hizo descartar una regla de "globo" que sólo servía para
  // un producto: se quitó. Y "ternera" acaba en -era sin ser un recipiente, así
  // que el patrón -era/-ero no se puede generalizar.
  for (const caso of ["Globo de chocolate", "Ternera picada", "Filete de ternera", "Huevos vestidos", "Arroz redondo"]) {
    assert.notStrictEqual(scope.classify({ name: caso }).decision, scope.DESCARTAR, `"${caso}" se descartó`);
  }
});

// --- el orden de la cascada -----------------------------------------------

test("una protección le gana a la categoría de la lista negra", () => {
  // 197 packs de pilas estaban catalogados en "Bricolaje" y se borraban, aunque el
  // usuario había decidido que las pilas se quedan. Una decisión de producto no
  // puede depender de en qué pasillo la metió el retailer.
  for (const caso of [
    "Pack de 8 pilas alcalinas AA, LR06, 1,5V, DURACELL",
    "Pack de 4 pilas recargables AA Ni-MH",
    "Pila alcalina de petaca 9V 6LR61",
    "Pack de 2 pilas de botón de litio CR2032",
    "Pack de 6 pilas especiales para audífonos",
  ]) {
    const r = scope.decide({ supermercado: "alcampo", category: "Bricolaje", name: caso });
    assert.strictEqual(r.decision, scope.MANTENER, `"${caso}" se borró por la categoría`);
    assert.strictEqual(r.via, "proteccion");
  }
  // Y en cualquier cadena y categoría de la lista negra.
  assert.strictEqual(
    scope.decide({ supermercado: "bm", category: "Bazar", name: "Pila alcalina LR-6 4 unidades" }).decision,
    scope.MANTENER
  );
  assert.strictEqual(
    scope.decide({ supermercado: "alcampo", category: "Tecnología", name: "Cargador de pilas AA/AAA + 4 pilas" }).decision,
    scope.MANTENER
  );
});

test("la categoría sigue mandando cuando el nombre no dice nada", () => {
  // La lista negra por categoría no se debilita: sin protección que la contradiga,
  // decide ella, que es lo que hace que 8.214 filas se auditen como 27 reglas.
  for (const caso of ["Taladro percutor 750W", "Juego de destornilladores 6 piezas", "Cemento rápido 5kg"]) {
    const r = scope.decide({ supermercado: "alcampo", category: "Bricolaje", name: caso });
    assert.strictEqual(r.decision, scope.DESCARTAR, `"${caso}" no se borró`);
    assert.strictEqual(r.via, "categoria");
  }
});

test("pero un DESCARTAR por nombre NO le gana a una categoría fiable y de alcance", () => {
  // Ésta es la razón de no invertir la cascada del todo: el clasificador de
  // nombres tiene falsos positivos, y sobre las 54.000 filas con etiqueta buena
  // harían daño. Medido: invertir del todo mete un falso positivo en mercadona.
  const r = scope.decide({
    supermercado: "mercadona", category: "Menaje y conservación de alimentos", name: "Bolsa isotérmica",
  });
  assert.strictEqual(r.decision, scope.MANTENER);
  assert.strictEqual(r.via, "categoria");
  assert.strictEqual(scope.classify({ name: "Bolsa isotérmica" }).decision, scope.DESCARTAR);
});

test("las demás protecciones también cruzan la frontera de la categoría", () => {
  // No es un parche para las pilas: es el orden, así que vale para todas.
  const casos = [
    ["Papelería", "Platos desechables de cartón, 20 unidades"],
    ["Juguetes", "Servilletas de papel 33x33cm 20 uds"],
    ["Textil", "Vela perfumada de vainilla"],
    ["Electrodomésticos", "Croquetas de jamón 500g"],
    ["Bricolaje", "Detergente para lavadora 40 lavados"],
  ];
  for (const [category, name] of casos) {
    const r = scope.decide({ supermercado: "alcampo", category, name });
    assert.strictEqual(r.decision, scope.MANTENER, `"${name}" en ${category} se borró`);
  }
});

test("las protecciones laxas se ajustaron para no rescatar bazar", () => {
  // Al ganar a la categoría, una protección de palabra suelta rescata textil:
  // "crema" y "gasa" son también un color y una tela.
  for (const [category, name] of [
    ["Textil", "Toalla de tocador color crema, 400g/m², ACTUEL"],
    ["Textil", "Manta polar color crema 130x170cm"],
    ["Textil", "Toalla de algodón gasa 50x100cm"],
    ["Juguetes", "Barco de vela de madera"],
    ["Bricolaje", "Pila de fregadero de acero inoxidable"],
  ]) {
    assert.strictEqual(
      scope.decide({ supermercado: "alcampo", category, name }).decision,
      scope.DESCARTAR,
      `"${name}" se rescató por una protección demasiado laxa`
    );
  }
  // Y lo de verdad sigue protegido.
  for (const [category, name] of [
    ["Perfumeria", "Crema hidratante corporal 400ml"],
    ["Hogar y Decoración", "Crema de manos reparadora"],
    ["Frescos", "Crema de calabaza fresca"],
    ["Parafarmacia", "Gasas esterilizadas de algodón hidrófilo"],
  ]) {
    assert.strictEqual(
      scope.decide({ supermercado: "alcampo", category, name }).decision,
      scope.MANTENER,
      `"${name}" dejó de estar protegido`
    );
  }
});

test("mascotas y limpieza NO están en la lista negra de categorías", () => {
  // Se incluyen en el alcance a propósito: el usuario las quiere dentro.
  assert.ok(!scope.categoriaFueraDeAlcance("alcampo", "Mascotas"));
  assert.ok(!scope.categoriaFueraDeAlcance("dia", "Limpieza y hogar"));
  assert.ok(!scope.categoriaFueraDeAlcance("ahorramas", "Decoración para repostería"));
  assert.ok(!scope.categoriaFueraDeAlcance("mercadona", "Detergente y suavizante ropa"));
});

test("lidl se corta por prefijo de ruta", () => {
  assert.ok(scope.categoriaFueraDeAlcance("lidl", "Tienda de bricolaje y jardín/Taller y ferretería"));
  assert.ok(!scope.categoriaFueraDeAlcance("lidl", "Comida y cerca de la comida/Bebidas/Refrescos"));
});

test("un nombre vacío no rompe nada", () => {
  assert.strictEqual(scope.classify({ name: "" }).decision, scope.MANTENER);
  assert.strictEqual(scope.classify({ name: "   " }).decision, scope.MANTENER);
});

console.log(`${passed} pruebas ok`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
