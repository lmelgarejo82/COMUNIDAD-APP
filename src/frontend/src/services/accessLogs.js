import api from './api';

export const accessLogService = {
  list(params = {}) {
    return api.get('/access-logs', { params });
  },
  get(id) {
    return api.get(`/access-logs/${id}`);
  },
  checkIn(data) {
    return api.post('/access-logs/check-in', data);
  },
  checkOut(id) {
    return api.post(`/access-logs/${id}/check-out`);
  },
  cancel(id) {
    return api.post(`/access-logs/${id}/cancel`);
  },
  observe(id, observation_note) {
    return api.post(`/access-logs/${id}/observe`, { observation_note });
  },
  unobserve(id) {
    return api.post(`/access-logs/${id}/unobserve`);
  },
};
