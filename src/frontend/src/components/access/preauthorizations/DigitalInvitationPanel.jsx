import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import t from '../../../theme';
import { accessPreauthorizationService } from '../../../services/accessLogs';
import { formatDateTime } from './preauthorizationUtils';

const invitationLabels = {
  active: 'Invitación activa',
  expired: 'Invitación vencida',
  revoked: 'Invitación revocada',
};

const invitationColors = {
  active: { color: t.colors.success, bg: t.colors.successSoft },
  expired: { color: t.colors.danger, bg: t.colors.dangerSoft },
  revoked: { color: t.colors.textSecondary, bg: t.colors.border },
};

function InvitationStatusChip({ status }) {
  const normalized = status || 'active';
  const palette = invitationColors[normalized] || invitationColors.active;
  return (
    <span style={t.badge(palette.color, palette.bg)}>
      {invitationLabels[normalized] || normalized}
    </span>
  );
}

export default function DigitalInvitationPanel({ preauthorization }) {
  const [items, setItems] = useState([]);
  const [generated, setGenerated] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setGenerated(null);
    setQrDataUrl('');
    setMessage('');
    setError('');
    if (preauthorization?.id) load();
  }, [preauthorization?.id]);

  useEffect(() => {
    let cancelled = false;
    async function renderQr() {
      if (!generated?.invitation_url) {
        setQrDataUrl('');
        return;
      }
      const dataUrl = await QRCode.toDataURL(generated.invitation_url, {
        width: 220,
        margin: 1,
        color: { dark: t.colors.primary, light: '#FFFFFF' },
      });
      if (!cancelled) setQrDataUrl(dataUrl);
    }
    renderQr().catch(() => {
      if (!cancelled) setError('No pudimos generar el QR.');
    });
    return () => { cancelled = true; };
  }, [generated?.invitation_url]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await accessPreauthorizationService.listInvitations(preauthorization.id);
      setItems(data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las invitaciones.');
    } finally {
      setLoading(false);
    }
  }

  async function generateInvitation() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const { data } = await accessPreauthorizationService.generateInvitation(preauthorization.id);
      setGenerated(data);
      setMessage(data.message);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo generar la invitación.');
    } finally {
      setLoading(false);
    }
  }

  async function revokeInvitation(item) {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const { data } = await accessPreauthorizationService.revokeInvitation(preauthorization.id, item.id);
      setMessage(data.message);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo revocar la invitación.');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!generated?.invitation_url) return;
    await navigator.clipboard.writeText(generated.invitation_url);
    setMessage('Enlace copiado');
  }

  const canGenerate = (preauthorization.effective_status || preauthorization.status) === 'pending';

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Invitación digital</h3>
          <span style={t.font.subtitle}>El QR no contiene datos personales.</span>
        </div>
        <button type="button" onClick={generateInvitation} disabled={loading || !canGenerate} style={t.secondaryBtn}>
          Generar invitación
        </button>
      </div>

      {(message || error) && (
        <div style={error ? t.toast('error') : t.toast('success')}>
          {error || message}
        </div>
      )}

      {generated && (
        <div style={styles.generatedBox}>
          <div style={styles.qrBox}>
            {qrDataUrl ? <img src={qrDataUrl} alt="QR de invitación digital" style={styles.qrImage} /> : <span>Generando QR...</span>}
          </div>
          <div style={styles.generatedInfo}>
            <strong>Compartir invitación</strong>
            <span>Este enlace se muestra una sola vez. Si lo cerrás, podés generar uno nuevo.</span>
            <span>La validación se realizará en el sistema al momento del ingreso.</span>
            <span>Vence: {formatDateTime(generated.invitation?.expires_at)}</span>
            <div style={styles.copyRow}>
              <input value={generated.invitation_url} readOnly style={{ ...t.input, marginBottom: 0 }} />
              <button type="button" onClick={copyLink} style={t.primaryBtn}>Copiar enlace</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.list}>
        {loading && <div style={styles.empty}>Cargando invitaciones...</div>}
        {!loading && items.length === 0 && <div style={styles.empty}>No hay invitaciones digitales generadas.</div>}
        {!loading && items.map(item => (
          <div key={item.id} style={styles.row}>
            <div>
              <div style={styles.rowTitle}>
                <strong>Código {item.token_hint || item.id}</strong>
                <InvitationStatusChip status={item.status} />
              </div>
              <span style={styles.meta}>Vence: {formatDateTime(item.expires_at)}</span>
              <span style={styles.meta}>Creada: {formatDateTime(item.created_at)}</span>
            </div>
            {item.status === 'active' && (
              <button type="button" onClick={() => revokeInvitation(item)} disabled={loading} style={t.secondaryBtn}>
                Revocar invitación
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const styles = {
  wrap: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.75rem', display: 'grid', gap: '0.65rem' },
  header: { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' },
  title: { margin: 0, fontSize: '0.9rem', fontWeight: 700, color: t.colors.textPrimary },
  generatedBox: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', alignItems: 'start' },
  qrBox: { width: 'min(220px, 100%)', minHeight: '220px', border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, display: 'grid', placeItems: 'center', background: t.colors.white },
  qrImage: { width: '220px', height: '220px', display: 'block' },
  generatedInfo: { display: 'grid', gap: '0.35rem', fontSize: '0.82rem', color: t.colors.textSecondary },
  copyRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.45rem', alignItems: 'start' },
  list: { display: 'grid', gap: '0.45rem' },
  row: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' },
  rowTitle: { display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' },
  meta: { display: 'block', fontSize: '0.74rem', color: t.colors.textSecondary, marginTop: '2px' },
  empty: { color: t.colors.textSecondary, fontSize: '0.8rem', padding: '0.35rem 0' },
};
