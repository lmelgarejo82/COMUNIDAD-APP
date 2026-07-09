const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');
const { sanitize } = require('../middleware/sanitize');
const controller = require('../controllers/accessInvitationValidationController');

router.post('/validate', authenticate, authorize('admin', 'access_operator'), setCommunity, sanitize('token'), controller.validate);
router.post('/use', authenticate, authorize('admin', 'access_operator'), setCommunity, sanitize('token'), controller.use);

module.exports = router;
