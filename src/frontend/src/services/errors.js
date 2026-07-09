export function getErrorMessage(err, fallback = 'Error inesperado') {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.response) return `Error del servidor (${err.response.status})`;
  if (err.request) return 'No se pudo conectar con el servidor. Verificá tu conexión.';
  return fallback;
}
