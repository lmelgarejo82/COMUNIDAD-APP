import api from './api';

export const bookingService = {
  getAmenities() {
    return api.get('/bookings/amenities');
  },
  listBookings(page = 1) {
    return api.get('/bookings', { params: { page, limit: 200 } });
  },
  listMy() {
    return api.get('/bookings/my');
  },
  create(data) {
    return api.post('/bookings', data);
  },
  updateStatus(id, status) {
    return api.put(`/bookings/${id}/status`, { status });
  },
};
