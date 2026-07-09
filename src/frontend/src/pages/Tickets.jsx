import { useState, useEffect } from 'react';
import { ticketService } from '../services/comunicacion';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';

const STATUS_OPTIONS = [
  { value: 'sent', label: 'Pendiente', color: '#dc3545', bg: '#f8d7da' },
  { value: 'in_progress', label: 'En proceso', color: '#fd7e14', bg: '#fff3cd' },
  { value: 'resolved', label: 'Resuelto', color: '#198754', bg: '#d1e7dd' },
];

function statusInfo(val) {
  return STATUS_OPTIONS.find(s => s.value === val) || STATUS_OPTIONS[0];
}

export default function Tickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [replyMsg, setReplyMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const isAdmin = user?.role === 'admin';

  useEffect(() => { load(); }, [page]);

  async function load() {
    setLoading(true);
    try {
      const { data } = isAdmin ? await ticketService.listAll(page) : await ticketService.listMy(page);
      setTickets(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al cargar tickets'));
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(ticketId, status) {
    await ticketService.updateStatus(ticketId, status);
    load();
    const t = tickets.find(t => t.id === ticketId);
    if (selected?.id === ticketId) {
      const { data } = isAdmin ? await ticketService.listAll() : await ticketService.listMy();
      const updated = data.find(t => t.id === ticketId);
      setSelected(updated || null);
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyMsg.trim()) return;
    setMsg('');
    try {
      await ticketService.addReply(selected.id, replyMsg);
      setReplyMsg('');
      const { data } = isAdmin ? await ticketService.listAll() : await ticketService.listMy();
      const updated = data.find(t => t.id === selected.id);
      setSelected(updated || null);
      load();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al responder'));
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMsg('');
    try {
      await ticketService.create(form);
      setForm({ title: '', description: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al crear'));
    }
  }

  function openTicket(t) {
    setSelected(t);
    setReplyMsg('');
    setMsg('');
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Tickets</h2>

      {!isAdmin && (
        <button style={s.newBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nuevo ticket'}
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={s.form}>
          {msg && <p style={s.msg}>{msg}</p>}
          <input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required style={s.input} />
          <textarea placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ ...s.input, resize: 'vertical' }} />
          <button type="submit" style={s.submitBtn}>Crear ticket</button>
        </form>
      )}

      {tickets.length === 0 ? (
        <p style={s.empty}>No hay tickets.</p>
      ) : (
        tickets.map((t) => {
          const st = statusInfo(t.status);
          return (
            <div key={t.id} style={s.card} onClick={() => openTicket(t)}>
              <div style={s.cardHeader}>
                <div>
                  <strong>{t.title}</strong>
                  <span style={{ marginLeft: '0.5rem', color: '#6c757d', fontSize: '0.8rem' }}>
                    {t.unit_number} {t.user_email && `· ${t.user_email}`}
                  </span>
                </div>
                <span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span>
              </div>
            </div>
          );
        }        )
      )}

      {totalPages > 1 && (
        <div style={s.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={s.pageBtn}>Anterior</button>
          <span style={s.pageInfo}>Pág. {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={s.pageBtn}>Siguiente</button>
        </div>
      )}

      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{selected.title}</h3>
            <p style={s.meta}>
              {selected.unit_number} · {new Date(selected.created_at).toLocaleDateString('es-AR')}
            </p>
            {selected.description && <p style={s.desc}>{selected.description}</p>}

            {isAdmin && (
              <div style={s.statusRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    style={{
                      ...s.statusBtn,
                      background: selected.status === opt.value ? opt.color : '#e9ecef',
                      color: selected.status === opt.value ? '#fff' : '#495057',
                    }}
                    onClick={() => handleStatusChange(selected.id, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <div style={s.replies}>
              <h4 style={s.repliesTitle}>Respuestas</h4>
              {selected.replies?.length === 0 && <p style={s.noReplies}>Sin respuestas aún.</p>}
              {selected.replies?.map((r) => (
                <div key={r.id} style={{ ...s.reply, background: r.is_admin ? '#f0f7ff' : '#f8f9fa' }}>
                  <p style={s.replyText}>{r.message}</p>
                  <small style={s.replyMeta}>
                    {r.is_admin ? 'Administración' : 'Vos'} · {new Date(r.created_at).toLocaleString('es-AR')}
                  </small>
                </div>
              ))}
            </div>

            <form onSubmit={handleReply} style={s.replyForm}>
              <textarea
                placeholder="Escribí una respuesta..."
                value={replyMsg}
                onChange={(e) => setReplyMsg(e.target.value)}
                rows={2}
                style={{ ...s.input, resize: 'vertical' }}
              />
              <button type="submit" style={s.replyBtn}>Responder</button>
            </form>

            <button style={s.closeBtn} onClick={() => setSelected(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { padding: '1.5rem', maxWidth: '800px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  empty: { color: '#6c757d', textAlign: 'center', padding: '2rem' },
  newBtn: { padding: '0.6rem 1.25rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '1rem', fontSize: '0.9rem', minHeight: '44px' },
  form: { background: '#fff', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1rem' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.4rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.5rem' },
  input: { width: '100%', padding: '0.6rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.95rem', marginBottom: '0.5rem', boxSizing: 'border-box' },
  submitBtn: { padding: '0.6rem 1.25rem', background: '#198754', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', minHeight: '44px' },
  card: { background: '#fff', padding: '1rem 1.25rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.5rem', cursor: 'pointer' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  badge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', padding: '1.5rem', borderRadius: '8px', maxWidth: '650px', width: '95%', maxHeight: '80vh', overflowY: 'auto' },
  meta: { fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.75rem' },
  desc: { fontSize: '0.9rem', color: '#495057', marginBottom: '1rem', whiteSpace: 'pre-wrap' },
  statusRow: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' },
  statusBtn: { padding: '0.5rem 0.85rem', border: 'none', borderRadius: '4px', fontSize: '0.85rem', cursor: 'pointer', minHeight: '44px' },
  replies: { borderTop: '1px solid #dee2e6', paddingTop: '1rem', marginBottom: '1rem' },
  repliesTitle: { fontSize: '0.95rem', color: '#2c3e50', marginBottom: '0.5rem' },
  noReplies: { fontSize: '0.85rem', color: '#adb5bd' },
  reply: { padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '0.4rem' },
  replyText: { fontSize: '0.9rem', color: '#495057', marginBottom: '0.2rem' },
  replyMeta: { fontSize: '0.75rem', color: '#adb5bd' },
  replyForm: { display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' },
  replyBtn: { padding: '0.5rem 1rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', minHeight: '44px' },
  closeBtn: { marginTop: '1rem', padding: '0.6rem 1.5rem', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', minHeight: '44px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' },
  pageBtn: { padding: '0.5rem 1rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', minHeight: '44px' },
  pageInfo: { fontSize: '0.85rem', color: '#6c757d' },
};
