import { useState } from 'react';
import t from '../../theme';
import { accessInvitationService } from '../../services/accessLogs';

function formatDateTime(value) {
  if (!value) return 'Sin horario definido';
  return new Date(value).toLocaleString('es-AR');
}

export default function ValidateInvitationPanel({ open, onClose, onUsed }) {
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  async function validate() {
    if (!token.trim()) {
      setError('Ingresá el enlace o código de invitación.');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    setInvitation(null);
    try {
      const { data } = await accessInvitationService.validate(token);
      setInvitation(data.invitation);
      setMessage(data.invitation.status === 'used' ? 'La invitación ya fue usada.' : 'Invitación válida.');
    } catch (err) {
      setError(err.response?.data?.error || 'Invitación inválida o vencida.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmUse() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const { data } = await accessInvitationService.use(token);
      setInvitation(data.invitation);
      setMessage(data.message);
      await onUsed?.(data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el ingreso desde la invitación.');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setToken('');
    setInvitation(null);
    setMessage('');
    setError('');
  }

  const canConfirm = invitation?.status === 'active';

  return (
    <div style={styles.overlay}>
      <aside style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Validar invitación</h2>
            <span style={t.font.subtitle}>Ingresá el enlace o código presentado por el visitante.</span>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <div style={styles.body}>
          <label>
            <span style={t.font.label}>Enlace o código</span>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={4}
              placeholder="Pegá el enlace o código de la invitación"
              style={{ ...t.input, resize: 'vertical' }}
            />
          </label>
          <div style={styles.actions}>
            <button type="button" onClick={clear} disabled={loading} style={t.secondaryBtn}>Limpiar</button>
            <button type="button" onClick={validate} disabled={loading} style={t.primaryBtn}>
              {loading ? 'Validando...' : 'Validar invitación'}
            </button>
          </div>

          {(message || error) && (
            <div style={error ? t.toast('error') : t.toast('success')}>
              {error || message}
            </div>
          )}

          {invitation && (
            <section style={styles.summary}>
              <div style={styles.summaryHeader}>
                <strong>{invitation.visitor_name}</strong>
                <span style={invitation.status === 'used' ? t.badge(t.colors.textSecondary, t.colors.border) : t.badge(t.colors.success, t.colors.successSoft)}>
                  {invitation.status === 'used' ? 'Ya usado' : 'Válido'}
                </span>
              </div>
              <span style={styles.meta}>{invitation.destination_label || 'Destino manual'}</span>
              <span style={styles.meta}>Tipo: {invitation.visit_type}</span>
              <span style={styles.meta}>Documento: {invitation.visitor_document || 'Sin dato'}</span>
              <span style={styles.meta}>Autorizado por: {invitation.authorized_by || 'Sin dato'}</span>
              <span style={styles.meta}>Vigencia: {formatDateTime(invitation.expected_from)} - {formatDateTime(invitation.expected_until)}</span>
              {invitation.access_log_id && <span style={styles.meta}>Ingreso: #{invitation.access_log_id}</span>}

              <div style={styles.actions}>
                <button type="button" onClick={onClose} style={t.secondaryBtn}>Cerrar</button>
                <button type="button" onClick={confirmUse} disabled={loading || !canConfirm} style={{ ...t.primaryBtn, opacity: canConfirm ? 1 : 0.65 }}>
                  Confirmar ingreso
                </button>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,59,94,0.18)', zIndex: 185, display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 'min(460px, 100%)', height: '100%', background: t.colors.white, padding: '1.2rem', boxShadow: t.shadow.modal, overflowY: 'auto', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  title: { ...t.font.title, margin: 0 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: t.colors.textSecondary },
  body: { display: 'grid', gap: '0.7rem' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', flexWrap: 'wrap' },
  summary: { ...t.card, padding: '0.8rem', display: 'grid', gap: '0.35rem' },
  summaryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  meta: { display: 'block', fontSize: '0.8rem', color: t.colors.textSecondary },
};
