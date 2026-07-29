# market-api

API REST del catálogo de supermercados. Express (MVC) + SQLite, sin
dependencias externas (nada de Postgres/Supabase).

## Endpoints

Auth: header `Authorization: Bearer <MARKET_API_TOKEN>`.

- `GET /products?supermercado=&category=&q=&ean13=&is_offer=&is_new=&sort=&limit=&offset=`
  — `is_offer`/`is_new` aceptan `true|false|1|0|si|no`; cualquier otro valor no filtra.
  Ver abajo cómo funcionan `q` y `sort`.
- `GET /supermercados?is_offer=&is_new=` — conteo de productos por cadena. Con
  `is_new`/`is_offer` devuelve **sólo las cadenas que tienen algo**, para no
  ofrecer un filtro de novedades en una cadena que no trae ninguna.
- `GET /pasillos?supermercado=&min_total=&limit=&is_offer=&is_new=` — los pasillos
  de una cadena
- `POST /comparar-bolsa` — cuánto costaría la misma bolsa en otra cadena
- `GET /healthz` — sin auth

### GET /pasillos

Para poder navegar una cadena sin escribir nada en el buscador.

```json
{ "total": 149, "limit": null, "min_total": 0,
  "pasillos": [ { "supermercado": "mercadona", "aisle": "Leche y bebidas vegetales", "total": 118 } ] }
```

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
