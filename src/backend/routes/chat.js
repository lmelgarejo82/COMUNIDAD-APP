const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

router.post('/query', authenticate, authorize('admin', 'residente'), chatController.query);

module.exports = router;
