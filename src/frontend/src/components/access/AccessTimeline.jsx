import t from '../../theme';

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AccessTimeline({ visit }) {
  const items = [
    { label: 'Ingreso registrado', date: visit.entry_at, by: visit.created_by_email },
    visit.observed_at && { label: 'Observación agregada', date: visit.observed_at, by: visit.observed_by_email },
    visit.exit_at && { label: 'Salida registrada', date: visit.exit_at, by: visit.exited_by_email },
    visit.cancelled_at && { label: 'Registro cancelado', date: visit.cancelled_at, by: visit.cancelled_by_email },
  ].filter(Boolean);

  return (
    <div style={{ display: 'grid', gap: '0.55rem' }}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: '0.55rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.colors.secondary, marginTop: 4 }} />
          <div>
            <strong style={{ display: 'block', fontSize: '0.82rem', color: t.colors.textPrimary }}>{item.label}</strong>
            <span style={{ fontSize: '0.76rem', color: t.colors.textSecondary }}>
              {formatDate(item.date)}{item.by ? ` · Registrado por ${item.by}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
