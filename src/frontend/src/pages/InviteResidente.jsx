import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errors';
import UnitSearchSelect from '../components/access/UnitSearchSelect';
import { useCommunity } from '../context/CommunityContext';
import {
  addResendingInvite,
  createInviteRequestTracker,
  inviteListViewState,
  inviteStatusLabel,
  partitionInvites,
  removeResendingInvite,
} from '../utils/invitePresentation';

export default function InviteResidente() {
  const { selectedId } = useCommunity();
  const [form, setForm] = useState({ email: '', unit_id: null, unit_number: '', ownership_type: 'owner' });
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [resendingIds, setResendingIds] = useState(new Set());
  const mountedRef = useRef(false);
  const requestTrackerRef = useRef(null);
  const resendingIdsRef = useRef(new Set());

  if (!requestTrackerRef.current) {
    requestTrackerRef.current = createInviteRequestTracker();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestTrackerRef.current.invalidate();
    };
  }, []);

  const loadInvites = useCallback(async () => {
    const requestId = requestTrackerRef.current.begin();
    const isCurrentRequest = () => (
      mountedRef.current && requestTrackerRef.current.isCurrent(requestId)
    );

    if (isCurrentRequest()) {
      setListLoading(true);
      setListError('');
    }
    try {
      const { data } = await api.get('/admin/invites', {
        params: selectedId ? { complex: selectedId } : undefined,
      });
      if (isCurrentRequest()) setInvites(data);
    } catch (err) {
      if (isCurrentRequest()) {
        setListError(getErrorMessage(err, 'No pudimos cargar las invitaciones.'));
      }
    } finally {
      if (isCurrentRequest()) setListLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function startResending(inviteId) {
    const nextIds = addResendingInvite(resendingIdsRef.current, inviteId);
    if (nextIds === resendingIdsRef.current) return false;

    resendingIdsRef.current = nextIds;
    if (mountedRef.current) setResendingIds(() => nextIds);
    return true;
  }

  function settleResending(inviteId) {
    const nextIds = removeResendingInvite(resendingIdsRef.current, inviteId);
    if (nextIds === resendingIdsRef.current) return;

    resendingIdsRef.current = nextIds;
    if (mountedRef.current) setResendingIds(() => nextIds);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.unit_id) {
      setMsgType('error');
      setMsg('Seleccioná una unidad del sistema.');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const { data } = await api.post('/admin/invite', {
        email: form.email,
        unit_id: form.unit_id,
        ownership_type: form.ownership_type,
      });
      if (!mountedRef.current) return;
      if (data.email_sent === false) {
        setMsgType('warning');
        setMsg(data.delivery_warning || 'La invitación fue creada, pero no se pudo enviar el email.');
      } else {
        setMsgType('success');
        setMsg(`Invitación enviada a ${form.email}. El residente recibirá un email con el enlace de registro.`);
      }
      setForm({ email: '', unit_id: null, unit_number: '', ownership_type: 'owner' });
      await loadInvites();
    } catch (err) {
      if (mountedRef.current) {
        setMsgType('error');
        setMsg(getErrorMessage(err, 'Error al enviar invitación'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleResend(inviteId) {
    if (!startResending(inviteId)) return;
    if (mountedRef.current) setMsg('');
    try {
      const { data } = await api.post(`/admin/invites/${inviteId}/resend`);
      if (!mountedRef.current) return;
      setMsgType(data.email_sent ? 'success' : 'warning');
      setMsg(data.email_sent
        ? 'Invitación reenviada correctamente.'
        : data.delivery_warning || 'La invitación fue renovada, pero no se pudo enviar el email.');
      await loadInvites();
    } catch (err) {
      if (mountedRef.current) {
        setMsgType('error');
        setMsg(getErrorMessage(err, 'No pudimos reenviar la invitación.'));
      }
    } finally {
      settleResending(inviteId);
    }
  }

  const { pending, history } = partitionInvites(invites);
  const listViewState = inviteListViewState(listLoading, listError, invites);

  function renderInviteCard(invite) {
    const isResending = resendingIds.has(invite.id);
    return (
      <article key={invite.id} style={s.inviteCard}>
        <strong style={s.email}>{invite.email}</strong>
        <span style={s.meta}>Unidad: {invite.unit_number || 'Sin unidad'}</span>
        <span style={s.meta}>{invite.ownership_type === 'tenant' ? 'Inquilino' : 'Propietario'}</span>
        <span style={s.meta}>Vence: {formatExpiration(invite.expires_at)}</span>
        <span style={s.status}>{inviteStatusLabel(invite.status)}</span>
        {invite.status === 'pending' && (
          <button
            type="button"
            onClick={() => handleResend(invite.id)}
            disabled={isResending}
            style={{ ...s.resendBtn, ...(isResending ? s.disabledBtn : {}) }}
          >
            {isResending ? 'Reenviando...' : 'Reenviar'}
          </button>
        )}
      </article>
    );
  }

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Invitar residente</h2>
      <form onSubmit={handleSubmit} style={s.form}>
        {msg && <p style={{ ...s.msg, ...s[msgType] }}>{msg}</p>}
        <label style={s.label}>Email del residente</label>
        <input name="email" type="email" value={form.email} onChange={handleChange} required style={s.input} placeholder="vecino@email.com" />
        <UnitSearchSelect
          value={form.unit_number}
          selectedUnitId={form.unit_id}
          allowManual={false}
          label="Unidad"
          placeholder="Buscar y seleccionar una unidad"
          onManualChange={(unit_number) => setForm(current => ({ ...current, unit_number, unit_id: null }))}
          onSelect={(unit) => setForm(current => ({ ...current, unit_id: unit.unit_id, unit_number: unit.unit_label }))}
          onClear={() => setForm(current => ({ ...current, unit_id: null, unit_number: '' }))}
        />
        <label style={{ ...s.label, marginTop: '0.75rem' }}>Tipo de ocupación</label>
        <select name="ownership_type" value={form.ownership_type} onChange={handleChange} required style={s.input}>
          <option value="owner">Propietario</option>
          <option value="tenant">Inquilino</option>
        </select>
        <button type="submit" disabled={loading} style={s.btn}>
          {loading ? 'Enviando...' : 'Enviar invitación'}
        </button>
      </form>

      <section style={s.listSection} aria-labelledby="invite-management-heading">
        <h3 id="invite-management-heading" style={s.subheading}>Gestión de invitaciones</h3>
        {listError && <p style={{ ...s.msg, ...s.error }}>{listError}</p>}
        {listViewState === 'loading' ? (
          <p style={s.emptyState}>Cargando invitaciones...</p>
        ) : listViewState.startsWith('loaded-') ? (
          <>
            <h4 style={s.sectionHeading}>Pendientes</h4>
            {pending.length > 0 ? (
              <div style={s.listGrid}>{pending.map(renderInviteCard)}</div>
            ) : (
              <p style={s.emptyState}>No hay invitaciones pendientes.</p>
            )}

            <h4 style={s.sectionHeading}>Historial</h4>
            {history.length > 0 ? (
              <div style={s.listGrid}>{history.map(renderInviteCard)}</div>
            ) : (
              <p style={s.emptyState}>Todavía no hay invitaciones en el historial.</p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

function formatExpiration(expiresAt) {
  if (!expiresAt) return 'Sin vencimiento';

  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

const s = {
  container: { padding: '1.5rem', maxWidth: '960px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  form: { background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.75rem' },
  success: { background: '#d1e7dd', color: '#0f5132' },
  warning: { background: '#fff3cd', color: '#664d03' },
  error: { background: '#f8d7da', color: '#842029' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.25rem' },
  input: { padding: '0.6rem', border: '1px solid #ced4da', borderRadius: '4px', width: '100%', fontSize: '0.95rem', marginBottom: '0.75rem', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '0.75rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem', minHeight: '48px' },
  listSection: { marginTop: '1.5rem' },
  subheading: { fontSize: '1.2rem', color: '#2c3e50', marginBottom: '0.75rem' },
  sectionHeading: { fontSize: '1rem', color: '#495057', margin: '1.25rem 0 0.5rem' },
  listGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' },
  inviteCard: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', background: '#fff', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  email: { color: '#2c3e50', overflowWrap: 'anywhere' },
  meta: { color: '#495057', fontSize: '0.9rem' },
  status: { color: '#0d6efd', fontSize: '0.85rem', fontWeight: 600 },
  resendBtn: { marginTop: '0.35rem', padding: '0.55rem 0.8rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', minHeight: '40px' },
  disabledBtn: { cursor: 'wait', opacity: 0.65 },
  emptyState: { color: '#6c757d', fontSize: '0.9rem', margin: '0.5rem 0' },
};
