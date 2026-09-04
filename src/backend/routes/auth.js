const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter, passwordRecoveryLimiter } = require('../middleware/rateLimiter');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/forgot-password', passwordRecoveryLimiter, authController.forgotPassword);
router.post('/reset-password/:token', passwordRecoveryLimiter, authController.resetPassword);

module.exports = router;
