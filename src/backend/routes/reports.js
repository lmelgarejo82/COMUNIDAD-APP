const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

router.get('/delinquency', authenticate, authorize('admin'), setCommunity, reportsController.delinquency);
router.get('/cashflow', authenticate, authorize('admin'), setCommunity, reportsController.cashflow);

module.exports = router;
