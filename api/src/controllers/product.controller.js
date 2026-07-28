const productModel = require("../models/product.model");

function list(req, res) {
  const { supermercado, category, ean13, q } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;

  const { total, items } = productModel.findAll(
    { supermercado, category, ean13, q },
    { limit, offset }
  );

  res.json({ total, limit, offset, items });
}

function supermercados(req, res) {
  res.json(productModel.countBySupermercado());
}

module.exports = { list, supermercados };
