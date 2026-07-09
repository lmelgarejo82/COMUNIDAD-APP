const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');
const { sanitize } = require('../middleware/sanitize');
const accessLogController = require('../controllers/accessLogController');

router.get('/', authenticate, authorize('admin', 'access_operator'), setCommunity, accessLogController.list);

router.post(
  '/check-in',
  authenticate,
  authorize('admin', 'access_operator'),
  setCommunity,
  sanitize('visitor_name', 'visitor_document', 'visitor_phone', 'vehicle_plate', 'destination_label', 'authorized_by', 'notes'),
  accessLogController.checkIn
);

router.get('/:id', authenticate, authorize('admin', 'access_operator'), setCommunity, accessLogController.detail);
router.post('/:id/check-out', authenticate, authorize('admin', 'access_operator'), setCommunity, accessLogController.checkOut);
router.post('/:id/cancel', authenticate, authorize('admin', 'access_operator'), setCommunity, accessLogController.cancel);

router.post(
  '/:id/observe',
  authenticate,
  authorize('admin', 'access_operator'),
  setCommunity,
  sanitize('observation_note', 'note'),
  accessLogController.observe
);

router.post('/:id/unobserve', authenticate, authorize('admin', 'access_operator'), setCommunity, accessLogController.unobserve);

module.exports = router;
