const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');
const { sanitize } = require('../middleware/sanitize');
const controller = require('../controllers/accessPreauthorizationController');
const invitationController = require('../controllers/accessInvitationController');

router.get('/search', authenticate, authorize('admin', 'access_operator'), setCommunity, controller.search);
router.post('/:id/use', authenticate, authorize('admin', 'access_operator'), setCommunity, controller.use);
router.get('/:id/invitations', authenticate, authorize('admin'), setCommunity, invitationController.list);
router.post('/:id/invitations', authenticate, authorize('admin'), setCommunity, invitationController.create);
router.post('/:id/invitations/:invitationId/revoke', authenticate, authorize('admin'), setCommunity, invitationController.revoke);

router.get('/', authenticate, authorize('admin'), setCommunity, controller.list);
router.post(
  '/',
  authenticate,
  authorize('admin'),
  setCommunity,
  sanitize('visitor_name', 'visitor_document', 'visitor_phone', 'vehicle_plate', 'destination_label', 'authorized_by', 'notes'),
  controller.create
);
router.get('/:id', authenticate, authorize('admin'), setCommunity, controller.detail);
router.post('/:id/cancel', authenticate, authorize('admin'), setCommunity, controller.cancel);

module.exports = router;
