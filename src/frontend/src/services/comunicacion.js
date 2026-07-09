import api from './api';

export const announcementService = {
  listAll(page = 1) {
    return api.get('/announcements/admin', { params: { page, limit: 10 } });
  },
  listResident(page = 1) {
    return api.get('/announcements', { params: { page, limit: 10 } });
  },
  markAsRead(id) {
    return api.put(`/announcements/${id}/read`);
  },
  delete(id) {
    return api.delete(`/announcements/${id}`);
  },
  create(data) {
    return api.post('/announcements', data);
  },
};

export const ticketService = {
  listAll(page = 1) {
    return api.get('/tickets', { params: { page, limit: 10 } });
  },
  listMy(page = 1) {
    return api.get('/tickets/my', { params: { page, limit: 10 } });
  },
  create(data) {
    return api.post('/tickets', data);
  },
  updateStatus(id, status) {
    return api.put(`/tickets/${id}/status`, { status });
  },
  addReply(id, message) {
    return api.post(`/tickets/${id}/reply`, { message });
  },
};

export const notificationService = {
  list() {
    return api.get('/notifications');
  },
  count() {
    return api.get('/notifications/count');
  },
  markRead(id) {
    return api.put(`/notifications/${id}/read`);
  },
  markAllRead() {
    return api.put('/notifications/read-all');
  },
};
