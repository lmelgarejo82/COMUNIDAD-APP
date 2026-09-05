const express = require('express');
const authController = require('../controllers/authController');

function createAuthRoutes({ authLimiter, passwordRecoveryLimiter }) {
  const router = express.Router();
  router.post('/register', authLimiter, authController.register);
  router.post('/login', authLimiter, authController.login);
  router.post('/forgot-password', passwordRecoveryLimiter, authController.forgotPassword);
  router.post('/reset-password', passwordRecoveryLimiter, authController.resetPasswordFromBody);
  router.post('/reset-password/:token', passwordRecoveryLimiter, authController.resetPassword);
  return router;
}

module.exports = createAuthRoutes;
