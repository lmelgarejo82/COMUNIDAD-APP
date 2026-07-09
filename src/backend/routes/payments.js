const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { setCommunity } = require('../middleware/setCommunity');

router.post('/create-preference', authenticate, setCommunity, paymentController.createPreference);

module.exports = router;
