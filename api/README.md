# market-api

API REST del catálogo de supermercados. Express (MVC) + SQLite, sin
dependencias externas (nada de Postgres/Supabase).

## Endpoints

Auth: header `Authorization: Bearer <MARKET_API_TOKEN>`.

- `GET /products?supermercado=&category=&q=&ean13=&is_offer=&is_new=&limit=&offset=`
  — `is_offer`/`is_new` aceptan `true|false|1|0|si|no`; cualquier otro valor no filtra.
- `GET /supermercados` — conteo de productos por cadena
- `POST /comparar-bolsa` — cuánto costaría la misma bolsa en otra cadena
- `GET /healthz` — sin auth

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

## Desarrollo local

```
npm install
MARKET_API_TOKEN=dev-token node src/server.js
npm test   # lógica de matching, sin base ni server
```
