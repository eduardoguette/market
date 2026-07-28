const { Router } = require("express");
const productController = require("../controllers/product.controller");
const { requireToken } = require("../middleware/auth.middleware");

const router = Router();

router.get("/products", requireToken, productController.list);
router.get("/supermercados", requireToken, productController.supermercados);

module.exports = router;
