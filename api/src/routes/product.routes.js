const { Router } = require("express");
const productController = require("../controllers/product.controller");
const comparisonController = require("../controllers/comparison.controller");
const { requireToken } = require("../middleware/auth.middleware");

const router = Router();

router.get("/products", requireToken, productController.list);
// Después de /products para que la ruta literal gane al parámetro.
router.get("/products/:id", requireToken, productController.detail);
router.get("/supermercados", requireToken, productController.supermercados);
router.get("/pasillos", requireToken, productController.pasillos);
router.get("/unidades", requireToken, productController.unidades);
router.post("/comparar-bolsa", requireToken, comparisonController.compareBasket);

module.exports = router;
