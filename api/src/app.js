const express = require("express");
const cors = require("cors");
const productRoutes = require("./routes/product.routes");

const app = express();

// API de solo lectura consumida desde apps cliente (web/iOS) con su propio
// token Bearer -- el origen no aporta seguridad acá, así que se abre a todos.
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.use("/", productRoutes);

module.exports = app;
