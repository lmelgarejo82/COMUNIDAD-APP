import api from './api.js';

export function createExpenseService(client = api) {
  return {
    create(data) {
      return client.post('/expenses', data);
    },

    listAll(page = 1) {
      return client.get('/expenses', { params: { page, limit: 10 } });
    },

    listMy() {
      return client.get('/expenses/my');
    },

    getUnitExpenses(expenseId, status) {
      const params = status ? { status } : {};
      return client.get(`/expenses/${expenseId}/units`, { params });
    },

    listAllUnits(status) {
      const params = status ? { status } : {};
      return client.get('/expenses/units', { params });
    },

    update(id, data) {
      return client.put(`/expenses/${id}`, data);
    },

    uploadFile(expenseId, file) {
      const formData = new FormData();
      formData.append('file', file);
      return client.post(`/expenses/${expenseId}/upload-file`, formData);
    },

    submitPayment(unitExpenseId, file) {
      const formData = new FormData();
      formData.append('proof', file);
      return client.put(`/expenses/unit/${unitExpenseId}/pay`, formData);
    },

    confirmPayment(unitExpenseId) {
      return client.put(`/expenses/unit/${unitExpenseId}/confirm`);
    },

    rejectPayment(unitExpenseId) {
      return client.put(`/expenses/unit/${unitExpenseId}/reject`);
    },
  };
}

export const expenseService = createExpenseService();
