const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, userController.me);
router.put('/me', authenticate, userController.updateMe);

module.exports = router;
