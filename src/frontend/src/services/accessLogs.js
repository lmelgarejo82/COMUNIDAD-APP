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

export const accessPreauthorizationService = {
  list(params = {}) {
    return api.get('/access-preauthorizations', { params });
  },
  create(data) {
    return api.post('/access-preauthorizations', data);
  },
  cancel(id) {
    return api.post(`/access-preauthorizations/${id}/cancel`);
  },
  search(params = {}) {
    return api.get('/access-preauthorizations/search', { params });
  },
  use(id) {
    return api.post(`/access-preauthorizations/${id}/use`);
  },
  listInvitations(id) {
    return api.get(`/access-preauthorizations/${id}/invitations`);
  },
  generateInvitation(id, data = {}) {
    return api.post(`/access-preauthorizations/${id}/invitations`, data);
  },
  revokeInvitation(id, invitationId) {
    return api.post(`/access-preauthorizations/${id}/invitations/${invitationId}/revoke`);
  },
};
