import { useEffect, useRef, useState } from 'react';
import t from '../../theme';
import { accessInvitationService } from '../../services/accessLogs';

function formatDateTime(value) {
  if (!value) return 'Sin horario definido';
  return new Date(value).toLocaleString('es-AR');
}

function extractInvitationToken(value) {
  const input = String(value || '').trim();
  if (!input) return '';

  try {
    const url = new URL(input);
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) return tokenParam.trim();

    const parts = url.pathname.split('/').filter(Boolean);
    const invitationIndex = parts.findIndex((part) => part.toLowerCase() === 'invitacion');
    if (invitationIndex >= 0 && parts[invitationIndex + 1]) {
      return decodeURIComponent(parts[invitationIndex + 1]).trim();
    }

    return decodeURIComponent(parts.at(-1) || input).trim();
  } catch {
    return input;
  }
}

export default function ValidateInvitationPanel({ open, onClose, onUsed }) {
  const [mode, setMode] = useState('manual');
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scannerStatus, setScannerStatus] = useState('idle');
  const [scannerMessage, setScannerMessage] = useState('Escaneá el QR de la invitación o usá ingreso manual.');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    if (!open || mode !== 'scan') {
      stopScanner();
    }

    return () => stopScanner();
  }, [open, mode]);

  async function validateToken(rawToken) {
    const value = extractInvitationToken(rawToken);
    if (!value) {
      setError('Ingresá el enlace o código de invitación.');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    setInvitation(null);
    setConfirmed(false);
    try {
      const { data } = await accessInvitationService.validate(value);
      setInvitation(data.invitation);
      setMessage(data.invitation.status === 'used' ? 'Esta invitación ya fue utilizada.' : 'Invitación válida');
    } catch (err) {
      setError(err.response?.data?.error || 'Invitación inválida o vencida.');
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    await validateToken(token);
  }

  function stopScanner(nextStatus = 'idle') {
    scanningRef.current = false;
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerStatus(nextStatus);
  }

  async function startScanner() {
    setScannerMessage('');
    setMessage('');
    setError('');
    setInvitation(null);
    setConfirmed(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStatus('unsupported');
      setScannerMessage('Cámara no disponible en este navegador. Usá ingreso manual.');
      return;
    }

    if (!('BarcodeDetector' in window)) {
      setScannerStatus('unsupported');
      setScannerMessage('Este navegador todavía no permite leer QR desde cámara. Usá ingreso manual.');
      return;
    }

    let detector;
    try {
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats?.();
      if (supportedFormats && !supportedFormats.includes('qr_code')) {
        setScannerStatus('unsupported');
        setScannerMessage('El lector de este navegador no soporta QR. Usá ingreso manual.');
        return;
      }
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      setScannerStatus('error');
      setScannerMessage('No pudimos iniciar el lector QR. Usá ingreso manual.');
      return;
    }

    try {
      setScannerStatus('requesting');
      setScannerMessage('Solicitando permiso de cámara...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanningRef.current = true;
      setScannerStatus('active');
      setScannerMessage('Cámara activa. Enfocá el QR de la invitación.');
      scanFrame(detector);
    } catch (err) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      stopScanner(denied ? 'denied' : 'error');
      setScannerMessage(denied ? 'Permiso de cámara denegado. Usá ingreso manual.' : 'No pudimos abrir la cámara. Usá ingreso manual.');
    }
  }

  async function scanFrame(detector) {
    if (!scanningRef.current || !videoRef.current) return;
    try {
      const results = await detector.detect(videoRef.current);
      const rawValue = results?.[0]?.rawValue?.trim();
      if (rawValue) {
        stopScanner('detected');
        setScannerMessage('QR detectado. Validando invitación...');
        setToken(rawValue);
        await validateToken(rawValue);
        return;
      }
    } catch {
      stopScanner('error');
      setScannerMessage('No pudimos leer el QR. Usá ingreso manual.');
      return;
    }
    scanFrameRef.current = requestAnimationFrame(() => scanFrame(detector));
  }

  async function confirmUse() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const { data } = await accessInvitationService.use(token);
      setInvitation(data.invitation);
      setConfirmed(true);
      setMessage(data.invitation?.status === 'used' && data.message?.includes('ya') ? 'Esta invitación ya fue utilizada.' : 'Ingreso confirmado correctamente.');
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
    setConfirmed(false);
    setMessage('');
    setError('');
    setScannerMessage('Escaneá el QR de la invitación o usá ingreso manual.');
  }

  if (!open) return null;

  const canConfirm = invitation?.status === 'active';
  const alreadyUsed = invitation?.status === 'used' && message === 'Esta invitación ya fue utilizada.';
  const statusLabel = confirmed && !alreadyUsed ? 'Ingreso confirmado' : invitation?.status === 'used' ? 'Ya usado' : 'Válido';
  const resultTitle = alreadyUsed
    ? 'Esta invitación ya fue utilizada.'
    : confirmed
      ? 'Ingreso confirmado correctamente.'
      : invitation?.status === 'used'
        ? 'Esta invitación ya fue utilizada.'
        : 'Invitación válida';
  const statusStyle = confirmed && !alreadyUsed
    ? t.badge(t.colors.success, t.colors.successSoft)
    : invitation?.status === 'used'
      ? t.badge(t.colors.textSecondary, t.colors.border)
      : t.badge(t.colors.success, t.colors.successSoft);

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
          <div style={styles.modeToggle}>
            <button type="button" onClick={() => setMode('manual')} style={mode === 'manual' ? styles.modeBtnActive : styles.modeBtn}>
              Manual
            </button>
            <button type="button" onClick={() => setMode('scan')} style={mode === 'scan' ? styles.modeBtnActive : styles.modeBtn}>
              Escanear QR
            </button>
          </div>

          {mode === 'manual' ? (
            <section style={styles.modeSection}>
              <div style={styles.initialState}>
                <strong>Validación manual</strong>
                <span>Pegá el enlace completo o el código de invitación. La validación se realiza en el sistema antes de registrar el ingreso.</span>
              </div>
              <label>
                <span style={t.font.label}>Enlace o código</span>
                <textarea
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setInvitation(null);
                    setConfirmed(false);
                    setMessage('');
                    setError('');
                  }}
                  rows={4}
                  placeholder="Pegá el enlace o código de invitación"
                  style={{ ...t.input, resize: 'vertical' }}
                />
              </label>
              <div style={styles.actions}>
                <button type="button" onClick={clear} disabled={loading} style={t.secondaryBtn}>Limpiar</button>
                <button type="button" onClick={validate} disabled={loading} style={t.primaryBtn}>
                  {loading ? 'Validando...' : 'Validar'}
                </button>
              </div>
            </section>
          ) : (
            <section style={styles.scanBox}>
              <div style={styles.scanHeader}>
                <div>
                  <strong>Escanear QR</strong>
                  <span>La cámara es opcional. El ingreso manual sigue disponible.</span>
                </div>
                <span style={scannerStatus === 'active' ? t.badge(t.colors.success, t.colors.successSoft) : t.badge(t.colors.textSecondary, t.colors.border)}>
                  {scannerStatus === 'requesting'
                    ? 'Solicitando'
                    : scannerStatus === 'active'
                      ? 'Cámara activa'
                      : scannerStatus === 'detected'
                        ? 'QR detectado'
                        : 'Manual disponible'}
                </span>
              </div>

              <div style={styles.videoFrame}>
                <video ref={videoRef} muted playsInline style={styles.video} />
                {scannerStatus !== 'active' && scannerStatus !== 'requesting' && (
                  <div style={styles.videoFallback}>
                    <span>{scannerStatus === 'detected' ? 'QR detectado' : 'Lector QR'}</span>
                  </div>
                )}
              </div>

              <span style={styles.scannerText}>{scannerMessage}</span>

              <div style={styles.actions}>
                {scannerStatus === 'active' || scannerStatus === 'requesting' ? (
                  <button type="button" onClick={() => {
                    stopScanner('idle');
                    setScannerMessage('Escaneo detenido. Podés iniciar la cámara otra vez o usar ingreso manual.');
                  }} style={t.secondaryBtn}>
                    Detener cámara
                  </button>
                ) : (
                  <button type="button" onClick={startScanner} disabled={loading} style={t.primaryBtn}>
                    Iniciar cámara
                  </button>
                )}
                <button type="button" onClick={() => setMode('manual')} style={t.secondaryBtn}>
                  Usar ingreso manual
                </button>
              </div>
            </section>
          )}

          {loading && (
            <div style={styles.loadingBox}>
              Validando invitación...
            </div>
          )}

          {(message || error) && !loading && (
            <div style={error ? t.toast('error') : t.toast('success')}>
              {error || message}
            </div>
          )}

          {invitation && (
            <section style={styles.summary}>
              <div style={styles.summaryHeader}>
                <strong>{invitation.visitor_name}</strong>
                <span style={statusStyle}>{statusLabel}</span>
              </div>
              <span style={styles.resultTitle}>{resultTitle}</span>
              <span style={styles.meta}>{invitation.destination_label || 'Destino manual'}</span>
              <span style={styles.meta}>Tipo: {invitation.visit_type}</span>
              <span style={styles.meta}>Documento: {invitation.visitor_document || 'Sin dato'}</span>
              <span style={styles.meta}>Autorizado por: {invitation.authorized_by || 'Sin dato'}</span>
              <span style={styles.meta}>Vigencia: {formatDateTime(invitation.expected_from)} - {formatDateTime(invitation.expected_until)}</span>
              {invitation.access_log_id && <span style={styles.meta}>Ingreso: #{invitation.access_log_id}</span>}

              <div style={styles.actions}>
                <button type="button" onClick={onClose} style={t.secondaryBtn}>Cerrar</button>
                <button type="button" onClick={confirmUse} disabled={loading || !canConfirm || confirmed} style={{ ...t.primaryBtn, opacity: canConfirm && !confirmed ? 1 : 0.65 }}>
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
  modeToggle: { display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${t.colors.border}`, borderRadius: t.radius.button, overflow: 'hidden' },
  modeBtn: { border: 'none', background: t.colors.white, color: t.colors.textSecondary, padding: '0.5rem', cursor: 'pointer', fontWeight: 600 },
  modeBtnActive: { border: 'none', background: t.colors.primarySoft, color: t.colors.primary, padding: '0.5rem', cursor: 'pointer', fontWeight: 700 },
  modeSection: { display: 'grid', gap: '0.6rem' },
  initialState: { ...t.card, padding: '0.7rem', display: 'grid', gap: '0.2rem', fontSize: '0.8rem', color: t.colors.textSecondary },
  scanBox: { ...t.card, padding: '0.85rem', display: 'grid', gap: '0.65rem', color: t.colors.textSecondary, fontSize: '0.82rem' },
  scanHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.65rem', flexWrap: 'wrap' },
  videoFrame: { position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: t.radius.input, overflow: 'hidden', background: t.colors.bg, border: `1px solid ${t.colors.border}` },
  video: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: t.colors.bg },
  videoFallback: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: t.colors.textSecondary, fontWeight: 700 },
  scannerText: { display: 'block', fontSize: '0.82rem', color: t.colors.textSecondary },
  loadingBox: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.65rem', fontSize: '0.82rem', color: t.colors.textSecondary, background: t.colors.bg },
  summary: { ...t.card, padding: '0.8rem', display: 'grid', gap: '0.35rem' },
  summaryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  resultTitle: { fontSize: '0.82rem', fontWeight: 700, color: t.colors.textPrimary },
  meta: { display: 'block', fontSize: '0.8rem', color: t.colors.textSecondary },
};
