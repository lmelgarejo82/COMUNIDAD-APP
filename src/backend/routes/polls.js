const express = require('express');
const router = express.Router();
const pollsController = require('../controllers/pollsController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

router.post('/', authenticate, authorize('admin'), setCommunity, pollsController.create);
router.get('/', authenticate, setCommunity, pollsController.list);
router.post('/:id/vote', authenticate, setCommunity, pollsController.vote);

module.exports = router;
