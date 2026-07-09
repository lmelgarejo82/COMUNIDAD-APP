const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.get('/', authenticate, authorize('admin', 'residente'), notificationController.list);
router.get('/count', authenticate, authorize('admin', 'residente'), notificationController.count);
router.put('/:id/read', authenticate, authorize('admin', 'residente'), notificationController.markRead);
router.put('/read-all', authenticate, authorize('admin', 'residente'), notificationController.markAllRead);

module.exports = router;
