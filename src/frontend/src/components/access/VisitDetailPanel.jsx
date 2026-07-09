import { useState } from 'react';
import t from '../../theme';
import AccessStatusChip from './AccessStatusChip';
import AccessTimeline from './AccessTimeline';

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function VisitDetailPanel({ visit, onClose, onCheckout, onCancel, onObserve, onUnobserve }) {
  const [note, setNote] = useState('');
  if (!visit) return null;

  const canEdit = visit.status === 'inside';

  return (
    <div style={styles.overlay}>
      <aside style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Detalle de visita</h2>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
              <AccessStatusChip status={visit.status} />
              {visit.is_observed && <AccessStatusChip status="observed" />}
              {visit.is_delayed && <AccessStatusChip status="delayed" />}
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <section style={styles.block}>
          <strong style={styles.name}>{visit.visitor_name}</strong>
          <div style={styles.metaGrid}>
            <span>Documento: {visit.visitor_document || '-'}</span>
            <span>Teléfono: {visit.visitor_phone || '-'}</span>
            <span>Patente: {visit.vehicle_plate || '-'}</span>
            <span>Destino: {visit.destination_label || visit.unit_code || '-'}</span>
            <span>Autorizado por: {visit.authorized_by || '-'}</span>
            <span>Ingreso: {formatDate(visit.entry_at)}</span>
            <span>Salida: {formatDate(visit.exit_at)}</span>
            <span>Registrado por: {visit.created_by_email || '-'}</span>
          </div>
          {visit.notes && <p style={styles.note}>{visit.notes}</p>}
        </section>

        <section style={styles.block}>
          <h3 style={t.sectionTitle}>Timeline</h3>
          <AccessTimeline visit={visit} />
        </section>

        <section style={styles.block}>
          <h3 style={t.sectionTitle}>Observación</h3>
          {visit.observation_note && <p style={styles.note}>{visit.observation_note}</p>}
          {canEdit && (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Motivo de observación"
                rows={3}
                style={{ ...t.input, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onObserve(visit, note)} style={t.secondaryBtn}>Marcar observado</button>
                {visit.is_observed && <button type="button" onClick={() => onUnobserve(visit)} style={t.secondaryBtn}>Quitar observación</button>}
              </div>
            </>
          )}
        </section>

        <div style={styles.actions}>
          {canEdit && <button type="button" onClick={() => onCancel(visit)} style={t.secondaryBtn}>Cancelar registro</button>}
          {canEdit && <button type="button" onClick={() => onCheckout(visit)} style={t.primaryBtn}>Registrar salida</button>}
        </div>
      </aside>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,59,94,0.18)', zIndex: 170, display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 'min(500px, 100%)', height: '100%', background: t.colors.white, padding: '1.2rem', boxShadow: t.shadow.modal, overflowY: 'auto', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  title: { ...t.font.title, margin: 0 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: t.colors.textSecondary },
  block: { ...t.card, padding: '0.9rem', marginBottom: '0.75rem' },
  name: { fontSize: '1.05rem', color: t.colors.textPrimary },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem', marginTop: '0.75rem', fontSize: '0.8rem', color: t.colors.textSecondary },
  note: { margin: '0.7rem 0 0', fontSize: '0.82rem', color: t.colors.textPrimary, lineHeight: 1.45 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', flexWrap: 'wrap' },
};
