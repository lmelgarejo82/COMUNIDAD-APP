import api from './api.js';

export function createAccountRecoveryService(client = api) {
  return {
    request(email) {
      return client.post('/auth/forgot-password', { email });
    },
    reset(token, password) {
      return client.post(`/auth/reset-password/${encodeURIComponent(token)}`, { password });
    },
  };
}

export default createAccountRecoveryService();
