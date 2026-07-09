import api from './api';

export const expenseService = {
  create(data) {
    return api.post('/expenses', data);
  },

  listAll(page = 1) {
    return api.get('/expenses', { params: { page, limit: 10 } });
  },

  listMy() {
    return api.get('/expenses/my');
  },

  getUnitExpenses(expenseId, status) {
    const params = status ? { status } : {};
    return api.get(`/expenses/${expenseId}/units`, { params });
  },

  listAllUnits(status) {
    const params = status ? { status } : {};
    return api.get('/expenses/units', { params });
  },

  update(id, data) {
    return api.put(`/expenses/${id}`, data);
  },

  uploadFile(expenseId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/expenses/${expenseId}/upload-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  submitPayment(unitExpenseId, file) {
    const formData = new FormData();
    if (file) formData.append('proof', file);
    return api.put(`/expenses/unit/${unitExpenseId}/pay`, formData, {
      headers: file ? { 'Content-Type': 'multipart/form-data' } : {},
    });
  },

  confirmPayment(unitExpenseId) {
    return api.put(`/expenses/unit/${unitExpenseId}/confirm`);
  },
};
