const { Router } = require("express");
const productController = require("../controllers/product.controller");
const comparisonController = require("../controllers/comparison.controller");
const { requireToken } = require("../middleware/auth.middleware");

const router = Router();

router.get("/products", requireToken, productController.list);
router.get("/supermercados", requireToken, productController.supermercados);
router.post("/comparar-bolsa", requireToken, comparisonController.compareBasket);

module.exports = router;
