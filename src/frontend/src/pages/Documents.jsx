import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/errors';
import Spinner from '../components/Spinner';
import { downloadProtectedUpload } from '../services/protectedUploads';

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [downloads, setDownloads] = useState({});
  const requests = useRef(new Map());
  const alive = useRef(false);
  const listRequest = useRef(0);
  const fileRef = useRef(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; listRequest.current += 1; requests.current.clear(); };
  }, []);

  async function load() {
    const request = ++listRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/documents');
      if (alive.current && request === listRequest.current) setDocs(data);
    } catch { if (alive.current && request === listRequest.current) setLoadError('Error al cargar documentos'); }
    finally { if (alive.current && request === listRequest.current) setLoading(false); }
  }

  async function handleDownload(doc) {
    if (requests.current.has(doc.id)) return;
    const request = Symbol();
    requests.current.set(doc.id, request);
    const current = () => alive.current && requests.current.get(doc.id) === request;
    setDownloads(prev => ({ ...prev, [doc.id]: { busy: true, error: '' } }));
    let error = '';
    try {
      await downloadProtectedUpload(doc.file_url, `documento-${Number(doc.id)}.pdf`);
    } catch (err) {
      error = getErrorMessage(err, 'Error al descargar documento');
    } finally {
      if (current()) {
        requests.current.delete(doc.id);
        setDownloads(prev => ({ ...prev, [doc.id]: { busy: false, error } }));
      }
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) return;
    const formData = new FormData();
    formData.append('file', fileRef.current.files[0]);
    formData.append('title', title);
    if (desc) formData.append('description', desc);
    setUploading(true); setMsg('');
    try {
      await api.post('/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('Documento subido.');
      setTitle(''); setDesc(''); setShowForm(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al subir'));
    } finally { setUploading(false); }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Documentación Legal</h2>
      {msg && <p style={s.msg}>{msg}</p>}

      {isAdmin && (
        <button style={s.uploadBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Subir documento'}
        </button>
      )}

      {showForm && (
        <form onSubmit={handleUpload} style={s.form}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del documento" required style={s.input} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)" style={s.input} />
          <input type="file" ref={fileRef} accept=".pdf" required style={s.input} />
          <button type="submit" disabled={uploading} style={s.submitBtn}>
            {uploading ? 'Subiendo...' : 'Subir PDF'}
          </button>
        </form>
      )}

      {loadError ? <div role="alert"><p>{loadError}</p><button onClick={load} style={s.submitBtn}>Reintentar</button></div> : docs.length === 0 ? <p style={s.empty}>No hay documentos.</p> : (
        docs.map((d) => (
          <div key={d.id} style={s.card}>
            <strong>{d.title}</strong>
            {d.description && <p style={s.docDesc}>{d.description}</p>}
            <small style={s.docMeta}>
              Subido por {d.uploaded_by_email || 'admin'} · {new Date(d.created_at).toLocaleDateString('es-AR')}
            </small>
            <button onClick={() => handleDownload(d)} disabled={Boolean(downloads[d.id]?.busy)} style={s.submitBtn}>
              {downloads[d.id]?.busy ? 'Descargando...' : 'Descargar PDF'}
            </button>
            {downloads[d.id]?.error && <p role="alert">{downloads[d.id].error}</p>}
          </div>
        ))
      )}
    </div>
  );
}

const s = {
  container: { padding: '1.5rem', maxWidth: '800px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.75rem' },
  empty: { color: '#6c757d', textAlign: 'center', padding: '2rem' },
  uploadBtn: { padding: '0.6rem 1.25rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '1rem', minHeight: '44px' },
  form: { background: '#fff', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1rem' },
  input: { width: '100%', padding: '0.5rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '0.5rem', boxSizing: 'border-box' },
  submitBtn: { padding: '0.6rem 1.25rem', background: '#198754', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', minHeight: '44px' },
  card: { background: '#fff', padding: '1rem 1.25rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.5rem' },
  docDesc: { fontSize: '0.85rem', color: '#6c757d', marginTop: '0.25rem' },
  docMeta: { color: '#adb5bd', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' },
};
