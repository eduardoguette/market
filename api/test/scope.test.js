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

test("lo discutible sale como dudoso, no como descarte", () => {
  for (const caso of ["Pilas alcalinas AA 4 uds", "Bombilla LED E27", "Vela perfumada de vainilla"]) {
    ambiguo(caso);
  }
});

test("el menaje que se cruza con el desechable queda en dudoso", () => {
  // Un plato puede ser de loza (fuera) o de cartón (dentro), así que decide una
  // persona en vez de una regla.
  ambiguo("Platos de postre 19cm 10 unidades");
  ambiguo("Vasos de plástico 250ml 25 uds");
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
