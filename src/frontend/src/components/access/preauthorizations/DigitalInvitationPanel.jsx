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
  const [shareView, setShareView] = useState('qr');
  const [shareMessageDraft, setShareMessageDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setGenerated(null);
    setQrDataUrl('');
    setShareView('qr');
    setShareMessageDraft('');
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
      setShareView('qr');
      setShareMessageDraft(buildShareMessage({
        invitationUrl: data.invitation_url,
        expiresAt: data.invitation?.expires_at,
        context: getShareContext(),
      }));
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

  async function copyText(value, successMessage) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(successMessage);
      setError('');
    } catch {
      setError('No pudimos copiar automáticamente. Seleccioná el texto y copialo manualmente.');
    }
  }

  async function shareInvitation() {
    if (!generated?.invitation_url) return;
    if (!navigator.share) {
      setError('Tu navegador no permite compartir directamente. Copiá el enlace o el mensaje.');
      return;
    }

    try {
      await navigator.share({
        title: 'Invitación de acceso',
        text: `Tenés una invitación para ingresar a ${getShareContext()}. Mostrá este enlace o QR en portería.`,
        url: generated.invitation_url,
      });
      setMessage('Invitación compartida');
      setError('');
    } catch (err) {
      if (err?.name === 'AbortError') {
        setMessage('Acción de compartir cancelada.');
        setError('');
        return;
      }
      setError('No pudimos abrir el diálogo de compartir. Copiá el enlace o el mensaje.');
    }
  }

  function openWhatsApp() {
    if (!shareMessageDraft.trim()) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessageDraft)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setMessage('WhatsApp abierto. El envío queda a cargo del usuario.');
    setError('');
  }

  function getShareContext() {
    return preauthorization.complex_name || preauthorization.community_name || 'la comunidad';
  }

  function getInvitationCode() {
    if (!generated?.invitation_url) return '';
    try {
      const url = new URL(generated.invitation_url);
      const parts = url.pathname.split('/').filter(Boolean);
      const invitationIndex = parts.findIndex((part) => part.toLowerCase() === 'invitacion');
      if (invitationIndex >= 0 && parts[invitationIndex + 1]) return decodeURIComponent(parts[invitationIndex + 1]);
      return decodeURIComponent(parts.at(-1) || generated.invitation_url);
    } catch {
      return generated.token || generated.invitation_url;
    }
  }

  function buildShareMessage({ invitationUrl, expiresAt, context }) {
    if (!invitationUrl) return '';
    return [
      `Hola. Tenés una invitación para ingresar a ${context}.`,
      'Mostrá este enlace o QR en portería:',
      invitationUrl,
      `Vigente hasta: ${formatDateTime(expiresAt)}`,
    ].join('\n');
  }

  const canGenerate = (preauthorization.effective_status || preauthorization.status) === 'pending';
  const invitationCode = getInvitationCode();

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
        <div style={styles.generatedWrap}>
          <div style={styles.shareHeader}>
            <div>
              <strong>Compartir invitación</strong>
              <span>Enviá este enlace al visitante por el canal que prefieras.</span>
              <span>El QR no contiene datos personales. La validación se realiza en portería.</span>
            </div>
            <InvitationStatusChip status="active" />
          </div>

          <div style={styles.warningBox}>
            Este enlace se muestra solo al generarlo. Si lo cerrás, podés generar una nueva invitación.
          </div>

          <div style={styles.shareTabs}>
            {[
              ['qr', 'Vista QR'],
              ['message', 'Mensaje'],
              ['details', 'Detalles'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setShareView(key)}
                style={shareView === key ? styles.shareTabActive : styles.shareTab}
              >
                {label}
              </button>
            ))}
          </div>

          {shareView === 'qr' && (
            <div style={styles.generatedBox}>
              <div style={styles.qrBox}>
                {qrDataUrl ? <img src={qrDataUrl} alt="QR de invitación digital" style={styles.qrImage} /> : <span>Generando QR...</span>}
              </div>
              <div style={styles.generatedInfo}>
                <span>Vigente hasta: <strong>{formatDateTime(generated.invitation?.expires_at)}</strong></span>
                <div style={styles.copyRow}>
                  <input value={generated.invitation_url} readOnly style={{ ...t.input, marginBottom: 0 }} />
                  <button type="button" onClick={() => copyText(generated.invitation_url, 'Enlace copiado')} style={t.primaryBtn}>
                    Copiar enlace
                  </button>
                </div>
                <div style={styles.copyRow}>
                  <input value={invitationCode} readOnly style={{ ...t.input, marginBottom: 0 }} />
                  <button type="button" onClick={() => copyText(invitationCode, 'Código copiado')} style={t.secondaryBtn}>
                    Copiar código
                  </button>
                </div>
                <div style={styles.assistedActions}>
                  <button type="button" onClick={shareInvitation} style={t.secondaryBtn}>
                    Compartir
                  </button>
                  <button type="button" onClick={openWhatsApp} style={t.secondaryBtn}>
                    Abrir WhatsApp
                  </button>
                </div>
              </div>
            </div>
          )}

          {shareView === 'message' && (
            <div style={styles.generatedInfo}>
              <span>Mensaje sugerido editable para copiar y enviar manualmente.</span>
              <textarea
                value={shareMessageDraft}
                onChange={(e) => setShareMessageDraft(e.target.value)}
                rows={6}
                style={{ ...t.input, resize: 'vertical', marginBottom: 0 }}
              />
              <div style={styles.actions}>
                <button type="button" onClick={shareInvitation} style={t.secondaryBtn}>
                  Compartir
                </button>
                <button type="button" onClick={openWhatsApp} style={t.secondaryBtn}>
                  Abrir WhatsApp
                </button>
                <button type="button" onClick={() => copyText(shareMessageDraft, 'Mensaje copiado')} style={t.primaryBtn}>
                  Copiar mensaje
                </button>
              </div>
            </div>
          )}

          {shareView === 'details' && (
            <div style={styles.detailGrid}>
              <span><strong>Visitante</strong>{preauthorization.visitor_name}</span>
              <span><strong>Destino</strong>{preauthorization.destination_label || preauthorization.unit_code || 'Destino manual'}</span>
              <span><strong>Código</strong>{invitationCode}</span>
              <span><strong>Vigente hasta</strong>{formatDateTime(generated.invitation?.expires_at)}</span>
              <span><strong>Estado</strong>Activa</span>
              <span><strong>Canal</strong>Manual</span>
            </div>
          )}
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
              <span style={styles.meta}>No se muestra el enlace de invitaciones anteriores porque el token plano no se guarda.</span>
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
  generatedWrap: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.75rem', display: 'grid', gap: '0.65rem', background: t.colors.bg },
  shareHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.82rem', color: t.colors.textSecondary },
  warningBox: { border: `1px solid ${t.colors.warning || t.colors.border}`, borderRadius: t.radius.input, padding: '0.55rem', background: t.colors.warningSoft || t.colors.white, color: t.colors.textSecondary, fontSize: '0.8rem' },
  shareTabs: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: `1px solid ${t.colors.border}`, borderRadius: t.radius.button, overflow: 'hidden', background: t.colors.white },
  shareTab: { border: 'none', background: t.colors.white, color: t.colors.textSecondary, padding: '0.45rem', cursor: 'pointer', fontWeight: 600 },
  shareTabActive: { border: 'none', background: t.colors.primarySoft, color: t.colors.primary, padding: '0.45rem', cursor: 'pointer', fontWeight: 700 },
  generatedBox: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', alignItems: 'start' },
  qrBox: { width: 'min(220px, 100%)', minHeight: '220px', border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, display: 'grid', placeItems: 'center', background: t.colors.white },
  qrImage: { width: '220px', height: '220px', display: 'block' },
  generatedInfo: { display: 'grid', gap: '0.35rem', fontSize: '0.82rem', color: t.colors.textSecondary },
  copyRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.45rem', alignItems: 'start' },
  assistedActions: { display: 'flex', justifyContent: 'flex-start', gap: '0.45rem', flexWrap: 'wrap' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', fontSize: '0.82rem', color: t.colors.textSecondary },
  list: { display: 'grid', gap: '0.45rem' },
  row: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' },
  rowTitle: { display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' },
  meta: { display: 'block', fontSize: '0.74rem', color: t.colors.textSecondary, marginTop: '2px' },
  empty: { color: t.colors.textSecondary, fontSize: '0.8rem', padding: '0.35rem 0' },
};
