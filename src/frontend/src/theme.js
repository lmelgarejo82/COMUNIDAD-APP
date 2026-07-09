// ============================================================
// Comunidad App — Design System / Theme
// Paleta unificada para toda la aplicación.
// ============================================================

const colors = {
  // Primario (Azul Profundo)
  primary: '#0F3B5E',
  primaryHover: '#0A2A45',
  primaryLight: '#1A5276',
  primarySoft: '#D6EAF8',
  primaryGradient: 'linear-gradient(135deg, #0F3B5E 0%, #1A5276 100%)',

  // Secundario (Teal)
  secondary: '#1ABC9C',
  secondaryHover: '#16A085',
  secondarySoft: '#A3E4D7',

  // Acento (Naranja)
  accent: '#F39C12',
  accentHover: '#E67E22',
  accentSoft: '#FDEBD0',

  // Error
  danger: '#E74C3C',
  dangerHover: '#C0392B',
  dangerSoft: '#FADBD8',

  // Éxito
  success: '#28A745',
  successSoft: '#D4EDDA',

  // Información
  info: '#17A2B8',

  // Neutros
  bg: '#F8F9FA',
  white: '#FFFFFF',
  border: '#E9ECEF',
  textPrimary: '#212529',
  textSecondary: '#6C757D',
  textDisabled: '#ADB5BD',

  // Estados funcionales
  statusPaid: '#28A745',
  statusPending: '#F39C12',
  statusOverdue: '#E74C3C',
  statusActive: '#17A2B8',

  // Morosidad thresholds
  morosidadAlta: '#E74C3C',
  morosidadMedia: '#F39C12',
  morosidadBaja: '#28A745',
};

const spacing = {
  page: '1.5rem 1.25rem',
  section: '1.25rem 0',
  card: '1.1rem',
  element: '0.75rem',
  tight: '0.5rem',
};

const radius = {
  card: '10px',
  button: '8px',
  badge: '12px',
  input: '6px',
  small: '4px',
};

const font = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  title: { fontSize: '1.4rem', fontWeight: 700, color: colors.textPrimary, letterSpacing: '-0.01em' },
  subtitle: { fontSize: '0.8rem', color: colors.textSecondary, marginTop: '2px', display: 'block' },
  label: { fontSize: '0.72rem', color: colors.textSecondary, textTransform: 'uppercase', fontWeight: 600, margin: '0 0 0.3rem', letterSpacing: '0.03em' },
};

const shadow = {
  card: '0 1px 3px rgba(0,0,0,0.06)',
  modal: '0 12px 40px rgba(0,0,0,0.18)',
  elevated: '0 4px 12px rgba(0,0,0,0.1)',
};

// --- Shared style helpers ---
const card = {
  background: colors.white,
  borderRadius: radius.card,
  border: `1px solid ${colors.border}`,
  boxShadow: shadow.card,
};

const headerBar = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: spacing.element,
  flexWrap: 'wrap',
  gap: spacing.tight,
};

const page = {
  maxWidth: '1024px',
  margin: '0 auto',
  padding: spacing.page,
  fontFamily: font.family,
};

const kpiGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: spacing.tight,
  marginBottom: spacing.element,
};

const kpiCard = (borderColor) => ({
  ...card,
  padding: spacing.card,
  borderTop: `3px solid ${borderColor || colors.border}`,
});

const primaryBtn = {
  padding: '0.5rem 1.1rem',
  background: colors.primaryGradient,
  color: colors.white,
  border: 'none',
  borderRadius: radius.button,
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const secondaryBtn = {
  padding: '0.5rem 1.1rem',
  background: colors.white,
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const dangerBtn = {
  padding: '0.45rem 1rem',
  background: colors.danger,
  color: colors.white,
  border: 'none',
  borderRadius: radius.button,
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const toast = (type) => ({
  fontSize: '0.8rem',
  padding: '0.4rem 0.8rem',
  borderRadius: radius.input,
  border: '1px solid',
  fontWeight: 500,
  background: type === 'error' ? colors.dangerSoft : colors.successSoft,
  color: type === 'error' ? colors.dangerHover : '#155724',
  borderColor: type === 'error' ? '#F5B7B1' : '#C3E6CB',
});

const badge = (color, bg) => ({
  display: 'inline-block',
  padding: '1px 8px',
  borderRadius: radius.badge,
  fontSize: '0.68rem',
  fontWeight: 600,
  color: color || colors.textSecondary,
  background: bg || colors.border,
});

const statusBadge = (status) => {
  const map = {
    paid: { color: colors.statusPaid, bg: colors.successSoft },
    pending: { color: colors.statusPending, bg: colors.accentSoft },
    overdue: { color: colors.statusOverdue, bg: colors.dangerSoft },
    active: { color: colors.statusActive, bg: colors.primarySoft },
    in_review: { color: colors.accent, bg: colors.accentSoft },
    sent: { color: colors.danger, bg: colors.dangerSoft },
    in_progress: { color: colors.accent, bg: colors.accentSoft },
    resolved: { color: colors.success, bg: colors.successSoft },
    closed: { color: colors.textSecondary, bg: colors.border },
  };
  const s = map[status] || map.pending;
  return badge(s.color, s.bg);
};

const input = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  marginBottom: '0.3rem',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  fontSize: '0.85rem',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: font.family,
};

const modal = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200,
  },
  box: {
    background: colors.white,
    borderRadius: '12px',
    padding: '1.5rem',
    width: '90%',
    maxWidth: '420px',
    boxShadow: shadow.modal,
  },
  title: { margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: colors.textPrimary },
};

const table = {
  wrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  th: {
    textAlign: 'left', padding: '6px 8px',
    borderBottom: `2px solid ${colors.border}`,
    color: colors.textSecondary, fontWeight: 600,
    fontSize: '0.72rem', textTransform: 'uppercase',
  },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: '6px 8px', color: colors.textPrimary },
};

const sectionTitle = {
  margin: '0 0 0.6rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  color: colors.textPrimary,
};

export default {
  colors,
  spacing,
  radius,
  font,
  shadow,
  card,
  headerBar,
  page,
  kpiGrid,
  kpiCard,
  primaryBtn,
  secondaryBtn,
  dangerBtn,
  toast,
  badge,
  statusBadge,
  input,
  modal,
  table,
  sectionTitle,
};
