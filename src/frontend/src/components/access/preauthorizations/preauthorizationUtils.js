import t from '../../../theme';

export const preauthInitialForm = {
  visitor_name: '',
  visitor_document: '',
  visitor_phone: '',
  vehicle_plate: '',
  visit_type: 'guest',
  unit_id: null,
  destination_label: '',
  authorized_by: '',
  notes: '',
  expected_from: '',
  expected_until: '',
};

export const preauthInitialFilters = {
  search: '',
  status: '',
  date_from: '',
  date_to: '',
};

export const statusLabels = {
  pending: 'Pendiente',
  used: 'Usada',
  cancelled: 'Cancelada',
  expired: 'Vencida',
};

export const statusColors = {
  pending: { color: t.colors.accent, bg: t.colors.accentSoft },
  used: { color: t.colors.success, bg: t.colors.successSoft },
  cancelled: { color: t.colors.textSecondary, bg: t.colors.border },
  expired: { color: t.colors.danger, bg: t.colors.dangerSoft },
};

export function formatDateTime(value) {
  if (!value) return 'Sin horario definido';
  return new Date(value).toLocaleString('es-AR');
}

export function toApiDateTime(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function getEffectiveStatus(item) {
  return item?.effective_status || item?.status || 'pending';
}
