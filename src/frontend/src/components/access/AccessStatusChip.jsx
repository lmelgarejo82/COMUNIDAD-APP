import t from '../../theme';

const statusCopy = {
  inside: 'Dentro',
  exited: 'Salió',
  cancelled: 'Cancelado',
  observed: 'Observado',
  delayed: 'Demorado',
};

const statusStyle = {
  inside: { color: t.colors.info, bg: t.colors.primarySoft },
  exited: { color: t.colors.success, bg: t.colors.successSoft },
  cancelled: { color: t.colors.textSecondary, bg: t.colors.border },
  observed: { color: t.colors.accentHover, bg: t.colors.accentSoft },
  delayed: { color: t.colors.danger, bg: t.colors.dangerSoft },
};

export default function AccessStatusChip({ status }) {
  const s = statusStyle[status] || statusStyle.inside;
  return <span style={t.badge(s.color, s.bg)}>{statusCopy[status] || status}</span>;
}
