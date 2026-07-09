const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/mercadopago', paymentController.webhook);

module.exports = router;
