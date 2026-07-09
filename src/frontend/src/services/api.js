import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const userStr = localStorage.getItem('user');
  if (userStr) {
    const user = JSON.parse(userStr);
    if (user.role === 'admin') {
      const complexId = localStorage.getItem('selectedComplex');
      const params = config.params || {};
      const hasOwnId = typeof params === 'object' && (params.complex || params.complexId || params.complex_id);
      if (complexId && !hasOwnId) {
        config.params = { ...params, complex: complexId };
      }
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('selectedComplex');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
