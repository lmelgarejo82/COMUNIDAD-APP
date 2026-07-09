const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

router.get('/residente', authenticate, setCommunity, authorize('residente'), dashboardController.residente);
router.get('/admin', authenticate, authorize('admin'), setCommunity, dashboardController.admin);

module.exports = router;
