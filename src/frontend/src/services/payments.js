import api from './api';

export const paymentService = {
  createPreference(unitExpenseId) {
    return api.post('/payments/create-preference', { unitExpenseId });
  },
};
