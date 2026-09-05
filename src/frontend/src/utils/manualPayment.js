export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const STATUS = {
  pending: { label: 'Pendiente', color: '#dc3545', bg: '#f8d7da' },
  in_review: { label: 'En revisión', color: '#fd7e14', bg: '#fff3cd' },
  paid: { label: 'Pagado', color: '#198754', bg: '#d1e7dd' },
  rejected: { label: 'Rechazado', color: '#842029', bg: '#f8d7da' },
};

const UNKNOWN_STATUS = { label: 'Estado no disponible', color: '#495057', bg: '#e9ecef' };

export function validatePaymentProof(file) {
  if (!file) return 'Seleccioná un comprobante.';

  const name = typeof file.name === 'string' ? file.name : '';
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(extension) || (type && !ALLOWED_TYPES.has(type))) {
    return 'El comprobante debe ser PDF, JPG, JPEG o PNG.';
  }
  if (!Number.isFinite(file.size) || file.size > MAX_PAYMENT_PROOF_BYTES) {
    return 'El comprobante no puede superar 5 MiB.';
  }
  return null;
}

export function manualPaymentActions(status, role, hasProof) {
  if (role === 'residente' && (status === 'pending' || status === 'rejected')) {
    return ['submit'];
  }
  if (role === 'admin' && status === 'in_review') {
    return hasProof ? ['approve', 'reject'] : ['reject'];
  }
  return [];
}

export function manualPaymentStatus(status) {
  return STATUS[status] || UNKNOWN_STATUS;
}
