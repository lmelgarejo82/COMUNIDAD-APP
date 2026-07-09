import api from '../services/api';

export const chatService = {
  send(message) {
    return api.post('/chat/query', { message });
  },
};
