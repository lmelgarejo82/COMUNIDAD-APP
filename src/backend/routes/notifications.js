const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, notificationController.list);
router.get('/count', authenticate, notificationController.count);
router.put('/:id/read', authenticate, notificationController.markRead);
router.put('/read-all', authenticate, notificationController.markAllRead);

module.exports = router;
