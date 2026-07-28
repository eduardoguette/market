# market-api

API REST del catálogo de supermercados. Express (MVC) + SQLite, sin
dependencias externas (nada de Postgres/Supabase).

## Endpoints

Auth: header `Authorization: Bearer <MARKET_API_TOKEN>`.

- `GET /products?supermercado=&category=&q=&ean13=&limit=&offset=`
- `GET /supermercados` — conteo de productos por cadena
- `GET /healthz` — sin auth

## Ingesta

Los scrapers (ver proyecto scraper por cadena) escriben `.jsonl` con un
producto por línea (`name`, `price_eur`, `price_per_unit_eur`, `ean13`,
`brand`, `image`, `url`, `category`). Se cargan con:

```
node src/scripts/ingest.js --file=productos.jsonl --supermercado=carrefour
```

## Desarrollo local

```
npm install
MARKET_API_TOKEN=dev-token node src/server.js
```
