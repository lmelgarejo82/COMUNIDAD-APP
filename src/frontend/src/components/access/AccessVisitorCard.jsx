import t from '../../theme';
import AccessStatusChip from './AccessStatusChip';

const typeCopy = {
  guest: 'Visita',
  delivery: 'Entrega',
  service: 'Servicio',
  provider: 'Proveedor',
  other: 'Otro',
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AccessVisitorCard({ visit, onSelect, compact = false }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(visit)}
      style={{
        ...t.card,
        width: '100%',
        textAlign: 'left',
        padding: compact ? '0.75rem' : '0.9rem',
        cursor: 'pointer',
        background: t.colors.white,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ display: 'block', fontSize: '0.95rem', color: t.colors.textPrimary }}>{visit.visitor_name}</strong>
          <span style={{ color: t.colors.textSecondary, fontSize: '0.78rem' }}>
            {typeCopy[visit.visit_type] || visit.visit_type} · {visit.destination_label || visit.unit_code || 'Destino sin especificar'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <AccessStatusChip status={visit.status} />
          {visit.is_observed && <AccessStatusChip status="observed" />}
          {visit.is_delayed && <AccessStatusChip status="delayed" />}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', marginTop: '0.7rem', fontSize: '0.78rem', color: t.colors.textSecondary }}>
        <span>Ingreso: {formatDate(visit.entry_at)}</span>
        <span>Salida: {formatDate(visit.exit_at)}</span>
        <span>Patente: {visit.vehicle_plate || '-'}</span>
      </div>
    </button>
  );
}
