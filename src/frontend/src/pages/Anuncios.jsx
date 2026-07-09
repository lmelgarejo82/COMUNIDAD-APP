import { useState, useEffect } from 'react';
import { announcementService } from '../services/comunicacion';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';

export default function Anuncios() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', message: '' });
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const isAdmin = user?.role === 'admin';

  useEffect(() => { load(); }, [page, isAdmin]);

  async function load() {
    setLoading(true);
    try {
      const { data } = isAdmin ? await announcementService.listAll(page) : await announcementService.listResident(page);
      setAnnouncements(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al cargar anuncios'));
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id) {
    await announcementService.markAsRead(id);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este anuncio?')) return;
    await announcementService.delete(id);
    load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMsg('');
    try {
      await announcementService.create(form);
      setForm({ title: '', message: '' });
      setShowForm(false);
      setPage(1);
      load();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al crear'));
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Anuncios</h2>
      {isAdmin && <button style={s.newBtn} onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nuevo anuncio'}</button>}
      {showForm && (
        <form onSubmit={handleCreate} style={s.form}>
          {msg && <p style={s.msg}>{msg}</p>}
          <input name="title" placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={s.input} />
          <textarea name="message" placeholder="Mensaje" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required rows={3} style={{ ...s.input, resize: 'vertical' }} />
          <button type="submit" style={s.submitBtn}>Publicar</button>
        </form>
      )}
      {announcements.length === 0 ? <p style={s.empty}>No hay anuncios.</p> : (
        announcements.map(a => (
          <div key={a.id} style={{ ...s.card, opacity: a.is_new === true ? 1 : 0.7 }}>
            <div style={s.cardHeader}>
              <strong>{a.title}</strong>
              {a.is_new === true && <span style={s.newBadge}>Nuevo</span>}
            </div>
            <p style={s.cardMessage}>{a.message}</p>
            <div style={s.cardFooter}>
              <small style={s.cardDate}>{new Date(a.created_at).toLocaleDateString('es-AR')}{a.created_by_email && ` · ${a.created_by_email}`}</small>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {!isAdmin && a.is_new === true && <button style={s.readBtn} onClick={() => handleMarkRead(a.id)}>Marcar leído</button>}
                {isAdmin && <button style={{ ...s.readBtn, color: '#dc3545' }} onClick={() => handleDelete(a.id)}>Eliminar</button>}
              </div>
            </div>
          </div>
        ))
      )}
      {totalPages > 1 && (
        <div style={s.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={s.pageBtn}>Anterior</button>
          <span style={s.pageInfo}>Pág. {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={s.pageBtn}>Siguiente</button>
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
  card: { background: '#fff', padding: '1rem 1.25rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.5rem' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  newBadge: { background: '#cfe2ff', color: '#084298', padding: '0.1rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 },
  cardMessage: { fontSize: '0.9rem', color: '#495057', marginBottom: '0.5rem' },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { color: '#adb5bd', fontSize: '0.75rem' },
  readBtn: { padding: '0.3rem 0.7rem', background: '#e9ecef', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', color: '#495057', minHeight: '44px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' },
  pageBtn: { padding: '0.5rem 1rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', minHeight: '44px' },
  pageInfo: { fontSize: '0.85rem', color: '#6c757d' },
};
