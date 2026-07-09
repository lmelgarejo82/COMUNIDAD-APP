const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

router.post('/invite', authenticate, authorize('admin'), setCommunity, adminController.invite);
router.get('/communities', authenticate, authorize('admin'), adminController.listCommunities);
router.get('/audit', authenticate, authorize('admin'), setCommunity, auditController.list);

module.exports = router;
