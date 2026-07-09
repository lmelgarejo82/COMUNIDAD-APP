import t from '../../theme';

export default function AccessKpiCard({ label, value, hint, color }) {
  return (
    <div style={t.kpiCard(color)}>
      <div style={{ fontSize: '0.72rem', color: t.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: t.colors.textPrimary, lineHeight: 1.1 }}>
        {value ?? 0}
      </div>
      {hint && <div style={{ fontSize: '0.78rem', color: t.colors.textSecondary }}>{hint}</div>}
    </div>
  );
}
