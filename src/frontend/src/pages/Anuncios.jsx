import { useState, useEffect, useRef } from 'react';
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
  const [loadError, setLoadError] = useState('');
  const [readbackError, setReadbackError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingRows, setPendingRows] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const isAdmin = user?.role === 'admin';
  const mounted = useRef(false);
  const readVersion = useRef(0);
  const operations = useRef(new Set());
  const needsReadback = useRef(false);
  const currentPage = useRef(page);
  currentPage.current = page;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; readVersion.current += 1; };
  }, []);
  useEffect(() => { load(page); }, [page, isAdmin]);

  async function load(targetPage = currentPage.current) {
    const version = ++readVersion.current;
    setLoading(true);
    setLoadError('');
    setReadbackError('');
    try {
      const { data } = isAdmin ? await announcementService.listAll(targetPage) : await announcementService.listResident(targetPage);
      if (!mounted.current || version !== readVersion.current) return;
      const lastPage = data.totalPages || 1;
      if (targetPage > lastPage) {
        setPage(lastPage);
        return;
      }
      setAnnouncements(data.data || []);
      setTotalPages(lastPage);
      setLoaded(true);
      needsReadback.current = false;
    } catch (err) {
      if (!mounted.current || version !== readVersion.current) return;
      if (needsReadback.current) setReadbackError('Los cambios están guardados. No se pudo actualizar la lista.');
      else setLoadError(getErrorMessage(err, 'Error al cargar anuncios'));
    } finally {
      if (mounted.current && version === readVersion.current) setLoading(false);
    }
  }

  async function changeRow(id, remove) {
    if (operations.current.has(id)) return;
    if (remove && !confirm('¿Eliminar este anuncio?')) return;
    operations.current.add(id);
    setPendingRows(rows => ({ ...rows, [id]: true }));
    setRowErrors(errors => ({ ...errors, [id]: '' }));
    let committed = false;
    try {
      if (remove) await announcementService.delete(id);
      else await announcementService.markAsRead(id);
      if (!mounted.current) return;
      readVersion.current += 1;
      needsReadback.current = true;
      setAnnouncements(rows => remove ? rows.filter(row => row.id !== id) : rows.map(row => row.id === id ? { ...row, is_new: false } : row));
      committed = true;
    } catch (err) {
      if (mounted.current) setRowErrors(errors => ({ ...errors, [id]: getErrorMessage(err, remove ? 'No se pudo eliminar el anuncio' : 'No se pudo marcar como leído') }));
    } finally {
      operations.current.delete(id);
      if (mounted.current) setPendingRows(rows => ({ ...rows, [id]: false }));
    }
    if (committed) await load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (operations.current.has('create')) return;
    operations.current.add('create');
    setCreating(true);
    setMsg('');
    let committed = false;
    try {
      const { data } = await announcementService.create(form);
      if (!mounted.current) return;
      readVersion.current += 1;
      needsReadback.current = true;
      setAnnouncements(rows => [data, ...rows.filter(row => row.id !== data.id)]);
      setLoaded(true);
      setForm({ title: '', message: '' });
      setShowForm(false);
      setPage(1);
      committed = true;
    } catch (err) {
      if (mounted.current) setMsg(getErrorMessage(err, 'Error al crear'));
    } finally {
      operations.current.delete('create');
      if (mounted.current) setCreating(false);
    }
    // A page change triggers the same versioned read through the effect.
    if (committed && currentPage.current === 1) await load(1);
  }

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Anuncios</h2>
      {isAdmin && <button style={s.newBtn} disabled={creating} onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nuevo anuncio'}</button>}
      {loading && <div role="status"><Spinner />Cargando anuncios…</div>}
      {(loadError || readbackError) && <div role="alert"><p>{loadError || readbackError}</p><button style={s.readBtn} onClick={() => load()}>Reintentar anuncios</button></div>}
      {showForm && (
        <form onSubmit={handleCreate} style={s.form}>
          {msg && <p style={s.msg}>{msg}</p>}
          <input name="title" aria-label="Título" placeholder="Título" disabled={creating} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={s.input} />
          <textarea name="message" aria-label="Mensaje" placeholder="Mensaje" disabled={creating} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required rows={3} style={{ ...s.input, resize: 'vertical' }} />
          <button type="submit" disabled={creating} style={s.submitBtn}>{creating ? 'Publicando…' : 'Publicar'}</button>
        </form>
      )}
      {announcements.length === 0 ? (loaded && !loading && !loadError && !readbackError && <p style={s.empty}>No hay anuncios.</p>) : (
        announcements.map(a => (
          <div key={a.id} style={{ ...s.card, opacity: a.is_new === true ? 1 : 0.7 }}>
            <div style={s.cardHeader}>
              <strong>{a.title}</strong>
              {a.is_new === true && <span style={s.newBadge}>Nuevo</span>}
            </div>
            <p style={s.cardMessage}>{a.message}</p>
            {rowErrors[a.id] && <p role="alert">{rowErrors[a.id]}</p>}
            <div style={s.cardFooter}>
              <small style={s.cardDate}>{new Date(a.created_at).toLocaleDateString('es-AR')}{a.created_by_email && ` · ${a.created_by_email}`}</small>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {!isAdmin && a.is_new === true && <button style={s.readBtn} disabled={Boolean(pendingRows[a.id])} onClick={() => changeRow(a.id, false)}>Marcar leído</button>}
                {isAdmin && <button style={{ ...s.readBtn, color: '#dc3545' }} disabled={Boolean(pendingRows[a.id])} onClick={() => changeRow(a.id, true)}>Eliminar</button>}
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
