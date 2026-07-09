const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');
const { sanitize } = require('../middleware/sanitize');
const ctrl = require('../controllers/masterTicketController');

router.post('/',
  authenticate, authorize('admin'), setCommunity,
  sanitize('title', 'description'),
  ctrl.create
);

router.get('/',
  authenticate, setCommunity,
  ctrl.list
);

router.get('/:id',
  authenticate, setCommunity,
  ctrl.getById
);

router.put('/:id',
  authenticate, authorize('admin'), setCommunity,
  sanitize('title', 'description'),
  ctrl.update
);

router.put('/:id/sub-tickets/:ticketId/resolve',
  authenticate, authorize('admin'), setCommunity,
  ctrl.resolveSubTicket
);

router.post('/:id/notify',
  authenticate, authorize('admin'), setCommunity,
  ctrl.notify
);

module.exports = router;
