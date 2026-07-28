const express = require("express");
const productRoutes = require("./routes/product.routes");

const app = express();

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.use("/", productRoutes);

module.exports = app;
