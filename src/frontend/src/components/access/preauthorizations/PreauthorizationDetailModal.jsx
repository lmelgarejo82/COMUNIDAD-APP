import t from '../../../theme';
import DigitalInvitationPanel from './DigitalInvitationPanel';
import PreauthorizationStatusChip from './PreauthorizationStatusChip';
import { formatDateTime, getEffectiveStatus } from './preauthorizationUtils';

export default function PreauthorizationDetailModal({ item, saving, onClose, onCancel }) {
  if (!item) return null;
  const effectiveStatus = getEffectiveStatus(item);

  return (
    <div style={styles.detailOverlay}>
      <div style={styles.detailBox}>
        <div style={styles.detailHeader}>
          <div>
            <h2 style={styles.detailTitle}>{item.visitor_name}</h2>
            <PreauthorizationStatusChip status={effectiveStatus} />
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        <div style={styles.detailGrid}>
          <span><strong>Destino</strong>{item.destination_label || item.unit_code || 'Destino manual'}</span>
          <span><strong>Documento</strong>{item.visitor_document || 'Sin dato'}</span>
          <span><strong>Teléfono</strong>{item.visitor_phone || 'Sin dato'}</span>
          <span><strong>Vehículo</strong>{item.vehicle_plate || 'Sin dato'}</span>
          <span><strong>Tipo</strong>{item.visit_type}</span>
          <span><strong>Autorizado por</strong>{item.authorized_by || 'Sin dato'}</span>
          <span><strong>Desde</strong>{formatDateTime(item.expected_from)}</span>
          <span><strong>Hasta</strong>{formatDateTime(item.expected_until)}</span>
          <span><strong>Creada por</strong>{item.created_by_email || 'Sin dato'}</span>
          <span><strong>Usada en ingreso</strong>{item.used_access_log_id || 'No usada'}</span>
        </div>
        {item.notes && (
          <div style={styles.noteBox}>
            <strong>Notas</strong>
            <span>{item.notes}</span>
          </div>
        )}
        <DigitalInvitationPanel preauthorization={item} />
        <div style={styles.formActions}>
          {effectiveStatus === 'pending' && (
            <button type="button" onClick={() => onCancel(item)} disabled={saving} style={t.secondaryBtn}>
              Cancelar pendiente
            </button>
          )}
          <button type="button" onClick={onClose} style={t.primaryBtn}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  detailOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,59,94,0.18)',
    zIndex: 230,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '1rem',
  },
  detailBox: {
    width: 'min(620px, 100%)',
    background: t.colors.white,
    borderRadius: t.radius.card,
    boxShadow: t.shadow.modal,
    padding: '1rem',
    display: 'grid',
    gap: '0.8rem',
  },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' },
  detailTitle: { ...t.font.title, margin: '0 0 0.3rem' },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: t.colors.textSecondary },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' },
  noteBox: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.65rem', display: 'grid', gap: '0.25rem', fontSize: '0.84rem' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' },
};
