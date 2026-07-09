const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

router.post('/create-preference', authenticate, authorize('residente'), setCommunity, paymentController.createPreference);

module.exports = router;
