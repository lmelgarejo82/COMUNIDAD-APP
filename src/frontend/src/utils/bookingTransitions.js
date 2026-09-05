export function getBookingActions(status) {
  if (status === 'pending') return ['active', 'cancelled'];
  if (status === 'active') return ['finished', 'cancelled'];
  return [];
}

export const bookingStatusLabels = {
  pending: 'Pendiente', active: 'Aprobada', finished: 'Finalizada', cancelled: 'Cancelada',
};
