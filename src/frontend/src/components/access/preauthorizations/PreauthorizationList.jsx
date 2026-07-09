import t from '../../../theme';
import PreauthorizationStatusChip from './PreauthorizationStatusChip';
import { formatDateTime, getEffectiveStatus } from './preauthorizationUtils';

export default function PreauthorizationList({ items, loading, saving, onCancel, onDetail }) {
  return (
    <div style={styles.preauthList}>
      {loading && <div style={styles.emptyHint}>Cargando preautorizaciones...</div>}
      {!loading && items.length === 0 && (
        <div style={styles.emptyState}>
          <strong>No hay preautorizaciones para mostrar.</strong>
          <span>Ajustá los filtros o creá una nueva visita esperada.</span>
        </div>
      )}
      {!loading && items.map(item => {
        const effectiveStatus = getEffectiveStatus(item);
        return (
          <div key={item.id} style={styles.preauthRow}>
            <div>
              <div style={styles.rowTitle}>
                <strong>{item.visitor_name}</strong>
                <PreauthorizationStatusChip status={effectiveStatus} />
              </div>
              <span style={styles.itemMeta}>
                {item.destination_label || item.unit_code || 'Destino manual'} · {item.visit_type}
              </span>
              <span style={styles.itemMeta}>
                {formatDateTime(item.expected_from)}
                {item.authorized_by ? ` · Autorizado por ${item.authorized_by}` : ''}
              </span>
            </div>
            <div style={styles.rowActions}>
              <button type="button" onClick={() => onDetail(item)} style={t.secondaryBtn}>
                Ver
              </button>
              {effectiveStatus === 'pending' && (
                <button type="button" onClick={() => onCancel(item)} disabled={saving} style={t.secondaryBtn}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  preauthList: { display: 'grid', gap: '0.5rem' },
  preauthRow: {
    border: `1px solid ${t.colors.border}`,
    borderRadius: t.radius.input,
    padding: '0.6rem',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '0.55rem',
    alignItems: 'center',
  },
  rowTitle: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' },
  rowActions: { display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' },
  itemMeta: { display: 'block', fontSize: '0.75rem', color: t.colors.textSecondary, marginTop: '2px' },
  emptyHint: { fontSize: '0.8rem', color: t.colors.textSecondary, padding: '0.5rem 0' },
  emptyState: {
    border: `1px dashed ${t.colors.border}`,
    borderRadius: t.radius.input,
    padding: '0.85rem',
    display: 'grid',
    gap: '0.2rem',
    color: t.colors.textSecondary,
    fontSize: '0.82rem',
  },
};
