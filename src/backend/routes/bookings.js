const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

router.get('/amenities', authenticate, authorize('admin', 'residente'), setCommunity, bookingController.getAmenities);
router.get('/my', authenticate, authorize('admin', 'residente'), bookingController.myBookings);
router.get('/', authenticate, authorize('admin'), setCommunity, bookingController.listBookings);
router.post('/', authenticate, authorize('residente'), setCommunity, bookingController.createBooking);
router.put('/:id/status', authenticate, authorize('admin'), setCommunity, bookingController.updateBookingStatus);

module.exports = router;
