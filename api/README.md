# market-api

API REST del catálogo de supermercados. Express (MVC) + SQLite, sin
dependencias externas (nada de Postgres/Supabase).

## Endpoints

Auth: header `Authorization: Bearer <MARKET_API_TOKEN>`.

- `GET /products?supermercado=&category=&q=&ean13=&measure_unit=&is_offer=&is_new=&sort=&limit=&offset=`
  — `is_offer`/`is_new` aceptan `true|false|1|0|si|no`; cualquier otro valor no filtra.
  Ver abajo cómo funcionan `q` y `sort`.
- `GET /supermercados?is_offer=&is_new=` — conteo de productos por cadena. Con
  `is_new`/`is_offer` devuelve **sólo las cadenas que tienen algo**, para no
  ofrecer un filtro de novedades en una cadena que no trae ninguna.
- `GET /products/:id` — un producto por id (404 si no existe). Hace falta para que
  un enlace directo a un producto funcione sin haber pasado por el listado.
- `GET /categorias?supermercado=&is_offer=&is_new=` — los cajones canónicos, comunes
  a las nueve cadenas
- `GET /pasillos?supermercado=&categoria_canonica=&min_total=&limit=&is_offer=&is_new=`
  — los pasillos, filtrables por cajón
- `GET /unidades?supermercado=&is_offer=&is_new=` — las unidades del catálogo con su
  conteo, para poder ofrecer el filtro `measure_unit` sin adivinarlas
- `POST /comparar-bolsa` — cuánto costaría la misma bolsa en otra cadena
- `GET /healthz` — sin auth

### Taxonomía canónica

Las 1.371 categorías del catálogo están capturadas a niveles y con calidades
distintas: alcampo da raíces gruesas (`Alimentación`, 3.332 productos), mercadona
hojas descriptivas, bm hojas que no se describen solas (`Seco`, `Envasado`, `Al
corte`) y ahorramás mezcla pasillos con campañas (`Black Friday`, `Día del Padre`,
`Mondelez`). Comparar `Alimentación` con `Sazonadores` es un error de categoría.

`src/lib/categories.js` traduce todo eso a **24 cajones canónicos** en cuatro pasadas
—ruta por prefijo más largo, etiqueta exacta, **nombre del producto dentro de un
departamento**, palabra clave sobre la etiqueta— y con tres salidas: un cajón,
`FUERA_DE_ALCANCE`, o `NO_FIABLE` (la etiqueta miente y hay que mirar el nombre). Lo
que no resuelve ninguna pasada queda **sin cajón**, que es honesto y visible.

#### Departamentos: cuando la etiqueta no es un pasillo

`Frescos` de alcampo son 2.810 productos e incluye la frutería, la carnicería, la
pescadería, la charcutería, la quesería y el horno. Mapearla a un solo cajón metía
**716 quesos dentro de frutas y verduras**; lo mismo con `Frescos` de ahorramás (62,
mezcla de todo) y de bm (17, que es queso fresco al 100%).

Esas etiquetas se declaran en `DEPARTAMENTOS` con un cajón **por defecto**, y el cajón
real lo decide `POR_NOMBRE` sobre el nombre del producto (`category_source = "name"`).
El defecto es el cajón que ya tenían, así que la pasada es **segura por construcción**:
lo que las reglas no reconocen se queda donde estaba. Reparto medido de los 2.889:

```
charcuteria_quesos 1387   pescado_marisco    315   dulces_chocolate  10
carne               552   panaderia_bolleria 136   lacteos_huevos     5
frutas_verduras     469   platos_preparados   12   despensa           3
```

`POR_NOMBRE` **no** es `POR_PALABRA` y no se puede reutilizar: aplicada a nombres de
producto, la tabla de etiquetas manda "Chipirones" a bebidas alcohólicas (por "ron"),
"Sandía de carne naranja" a carne y "Aguacate" a bebidas — 1.654 de 2.810 mal. Las
reglas de nombre van con `\b`, sin palabras polisémicas sueltas, y se compilan con el
plural (`\b(croissant)\b` no encuentra "croissants").

```
GET /categorias
{ "categorias": [ { "id": "lacteos_huevos", "nombre": "Lácteos y huevos",
                    "alimentacion": true, "total": 2347, "supermercados": 6 } ],
  "sin_clasificar": 2846,
  "etiqueta_no_fiable": 5802 }
```

El orden es el del mapa (el de los pasillos de un supermercado real), no alfabético
ni por volumen. **`alimentacion`** separa comida de lo que se compra en el súper sin
serlo, para que la UI agrupe sin saber de taxonomías.

**No hay `en_alcance`, y es a propósito**: todo cajón que devuelve este endpoint es
de alcance por construcción, porque lo que queda fuera nunca recibe cajón. Un campo
siempre `true` no informa de nada. El flag que sirve para agrupar es `alimentacion`.

Los dos conteos de abajo son cosas distintas y por eso van separados:
`sin_clasificar` es "ninguna pasada del mapa la resolvió" y `etiqueta_no_fiable` es
"la etiqueta de la cadena miente (campañas, categorías mixtas) y el cajón tiene que
salir del nombre del producto". Sumarlos triplica el problema aparente.

El flujo que habilita es el que pidió el usuario: **categoría → pasillo de cada
cadena → productos**.

```
GET /categorias                                        -> los 24 cajones
GET /pasillos?categoria_canonica=lacteos_huevos        -> los pasillos de ese cajón, por cadena
GET /products?categoria_canonica=lacteos_huevos&...    -> los productos
```

Cobertura medida sobre las 54.646 filas: **83,8% con cajón**, 10,6% con etiqueta no
fiable, 5,2% sin resolver (342 categorías, la mayor con 53 productos). Las que no se
resuelven son en su mayoría hojas de bm que no se describen solas y **necesitan que
el scraper emita `category_path`**.

`npm run recategorize` reasigna el catálogo con el mapa actual y lista lo no resuelto
por volumen: el mapa vive en código, así que cambiar de opinión es una pasada de
UPDATE y no un re-scrape.

### GET /pasillos

Para poder navegar una cadena sin escribir nada en el buscador.

```json
{ "total": 149, "limit": null, "min_total": 0,
  "pasillos": [ { "supermercado": "mercadona", "aisle": "Fruta", "total": 54,
                  "aisle_key": "fruta y verdura", "aisle_canonical": "Frutas y verduras" } ] }
```

**`aisle_key` y `aisle_canonical`: el mismo pasillo escrito distinto.** Las nueve
cadenas nombran igual pasillo de nueve formas: `Fruta` (mercadona, 54), `Frutas` (dia
86 + aldi 3) y `Fruta y verdura` (mercadona, 59) eran cuatro filas para el mismo
pasillo. Dos filas con el mismo `aisle_key` **son el mismo pasillo** y se pintan con
`aisle_canonical`. Se resuelve en dos niveles: una clave mecánica (sin acentos,
minúsculas, singular/plural palabra por palabra, que no puede equivocarse) y una tabla
de sinónimos escrita a mano (`PASILLOS_SINONIMOS`) para los nombres que significan lo
mismo sin parecerse. No hay jerarquía: `Tomate` y `Naranja` siguen siendo pasillos
propios, porque esa granularidad es lo que aporta el nivel de pasillo sobre el de cajón.

Los dos campos son **aditivos**: `aisle` sigue siendo el nombre crudo de la cadena y es
el que hay que mandar a `/products?category=`.

`total` son los pasillos que existen, no los que se devuelven: `limit` sólo recorta
la lista, igual que en `/products`. `min_total` sí cambia el `total`, porque ahí lo
que cambia es el conjunto.

El `aisle` sirve tal cual para `GET /products?category=<aisle>&supermercado=<cadena>`,
que es la otra mitad del caso: entrar en el pasillo y ver sus productos.

Vienen **ordenados por número de productos**, no alfabéticamente, porque la
granularidad es muy desigual entre cadenas: mercadona tiene 149 pasillos con una
mediana de 27 productos, pero ahorramás tiene 537 con mediana 6 y 73 de un solo
producto. Con `min_total` se recorta esa cola (`min_total=20` deja ahorramás en 76
pasillos). Los empates desempatan por nombre, así que el orden es estable.

Sin `supermercado` devuelve los pasillos de todas las cadenas; cada fila lleva
siempre la suya, así que la forma de la respuesta no cambia según los parámetros.
Las filas sin `category` no se listan (aldi tiene 103).

Ojo, **muestra los pasillos tal como los da cada cadena**: carrefour tiene un solo
"pasillo" (`Bebidas`) para todo su catálogo, y alcampo lista `Folletos y
Promociones` y `Campañas` como si lo fueran. Es la verdad de los datos de hoy; se
arregla cuando exista la capa canónica de categorías, y entonces este endpoint
puede crecer con `categoria` y `category_path` sin romper lo que ya consuma la app.

### Ordenación (`?sort=`)

| valor | orden |
|---|---|
| `relevance` | coincidencia con `q` (bm25). Es el default cuando hay `q`. |
| `price_asc` / `price_desc` | precio absoluto |
| `unit_price_asc` / `unit_price_desc` | precio por unidad (€/l, €/kg, €/ud) |

Sin `sort` y sin `q` el orden es por `id`. La respuesta devuelve el `sort`
aplicado. Un valor desconocido da **400** con la lista de válidos, en vez de
devolver el catálogo en un orden que nadie pidió.

`price_asc` responde "qué es lo más barato de comprar" y `unit_price_asc` "qué
conviene", que no es lo mismo: la garrafa de aceite de oliva de 5 l es de lo más
caro del catálogo en absoluto (17,75 €) y de lo más barato por litro (3,55 €/l).
Para decidir una compra suele importar el segundo.

**`unit_price_asc` sólo tiene sentido con `measure_unit` fijado.** Las unidades del
catálogo no son convertibles entre sí (`kg`, `l`, `ud`, y una cola de `lavado`,
`docena`, `capsula`, `kg.peso esc`), así que ordenar por €/unidad sin filtrar mezcla
€/kg con €/lavado y devuelve los detergentes primero por costar céntimos por lavado.
La API no lo impone —ordenar no debería cambiar el conjunto devuelto— pero el
cliente debería ofrecer el criterio sólo junto a una unidad elegida. `GET /unidades`
da la lista. La cola sucia deja de ser ruido y se vuelve consultable a propósito:
`?measure_unit=lavado&sort=unit_price_asc` es "el detergente más barato por lavado",
que es justo la comparación que quiere quien compra.

Los productos sin precio quedan **siempre al final**, en las dos direcciones
(sqlite por defecto ordena los `NULL` primero, así que "los más baratos" abriría
con los que no tienen precio). No es un caso raro: a `price_per_unit_eur` le
falta el dato en ~1/3 de lidl.

Todos los criterios desempatan por `id`, para que paginar sea estable: hay
cientos de productos con el mismo precio exacto y sin desempate dos páginas
seguidas podrían repetir o saltear filas.

### POST /comparar-bolsa

```json
{ "items": [{ "product_id": 19, "quantity": 2 }], "target_supermercado": "mercadona" }
```

Devuelve `origen_total`, `target_total`, `ahorro` (negativo si sale más caro),
`matches` y `sin_equivalente`. Los productos sin equivalente van con
`match: null` y **no** se suman a `target_total`, así que cuando
`sin_equivalente > 0` el total es parcial y conviene avisarlo en la UI.

Cada match trae `confidence` (0-1), `metodo` (`ean13`, `name` o
`mismo_supermercado`) y `size_ratio`, la proporción entre los formatos: un
`size_ratio` de 0.66 quiere decir que el equivalente viene en un envase más
chico y que el precio, aunque real, no compara la misma cantidad.

Acepta `min_confidence` en el body para mover el umbral por request; el valor
por defecto sale de `MARKET_MATCH_THRESHOLD` (0.6 si no está).

### Búsqueda (`?q=`)

La query se parte en tokens y se exigen **todos**, en cualquier orden y posición,
contra un índice FTS5 (`src/lib/search.js`). Así `agua bronchales` encuentra
"Agua mineral grande Bronchales", que con el `LIKE '%...%'` de antes daba 0
porque exigía subcadena contigua. Los acentos son indiferentes en los dos
sentidos (`higienico` encuentra "higiénico" y al revés), que es algo que `LIKE`
no da: sólo ignora mayúsculas en ASCII.

Los resultados se ordenan por relevancia con `bm25()`, así que un producto que
coincide en un término raro sale antes que uno que sólo coincide en el genérico.
Sin `q` el orden sigue siendo por `id`, como antes.

Se busca por token completo y sólo se cae a prefijo si así no hay nada, para que
`agua` no devuelva aguacates pero `choco` sí encuentre "chocolate". El efecto
lateral es que una palabra escrita a medias no encuentra sus otras flexiones
mientras existan coincidencias exactas: `catalan` trae "Vichy Catalán" pero no
"Crema catalana".

**Búsqueda por formato**: si la query trae una cantidad (`agua 50cl`,
`leche 1,5l`, `arroz 2kg`, `papel 4 rollos`) se saca del texto y se filtra por
tamaño con un margen del 10%. Hace falta porque el formato no está en el nombre:
mercadona los llama "pequeña/mediana/grande". El tamaño sale de
`price_eur / price_per_unit_eur`, igual que en el comparador. Ojo: es el tamaño
**total** del envase, así que `agua 50cl` encuentra la botella de 50 cl pero no
el pack de 6x50 cl (que mide 3 l).

### Cómo se emparejan los productos

Casi ningún producto trae `ean13` (mercadona 0%, carrefour ~40%), así que el
match es difuso por nombre y **aproximado por naturaleza**; ver
`src/lib/matching.js`. En resumen: se comparan los tokens del nombre
ponderados por IDF (la marca pesa, "agua mineral" no), el tamaño real se saca
de `price_eur / price_per_unit_eur` y por debajo del umbral se devuelve
`match: null` en vez de forzar un match malo.

## Ingesta

Los scrapers (ver proyecto scraper por cadena) escriben `.jsonl` con un
producto por línea (`name`, `price_eur`, `price_per_unit_eur`, `ean13`,
`brand`, `image`, `url`, `category`, `is_offer`, `price_before`, `is_new`).
Se cargan con:

```
node src/scripts/ingest.js --file=productos.jsonl --supermercado=carrefour
```

## Migraciones

`src/config/db.js` corre al abrir la base: crea la tabla si no existe y añade
las columnas que falten con `ALTER TABLE` (aditivo e idempotente). Sobre una
base ya poblada el `CREATE TABLE IF NOT EXISTS` no alcanza, porque no toca una
tabla que ya está creada. No recrea la tabla ni reescribe filas.

También crea el índice FTS5 de búsqueda y lo rellena con lo que ya hubiera en la
tabla (la tabla virtual nace vacía). Eso pasa una sola vez; después lo mantienen
tres triggers sobre `products`, así que el ingest no tiene que hacer nada.

## Desarrollo local

```
npm install
MARKET_API_TOKEN=dev-token node src/server.js
npm test   # lógica de matching, sin base ni server
```
