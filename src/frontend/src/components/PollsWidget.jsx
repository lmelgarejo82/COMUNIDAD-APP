import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function PollsWidget() {
  const { user } = useAuth();
  const [polls, setPolls] = useState([]);
  const [msg, setMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [unreconciled, setUnreconciled] = useState({});
  const alive = useRef(false);
  const reads = useRef(0);
  const operations = useRef(new Set());
  const committed = useRef(new Set());
  const eligible = user?.role === 'residente' && user?.user_type === 'owner';

  useEffect(() => {
    alive.current = true;
    if (eligible) load();
    return () => { alive.current = false; reads.current += 1; };
  }, [eligible]);

  async function load() {
    const request = ++reads.current;
    setLoading(true);
    try {
      const { data } = await api.get('/polls');
      if (!alive.current || request !== reads.current) return;
      setPolls(data.map(p => ({ ...p, has_voted: p.has_voted || committed.current.has(p.id) })));
      setUnreconciled({});
      setLoadError('');
    } catch {
      if (!alive.current || request !== reads.current) return;
      setLoadError(committed.current.size
        ? 'No pudimos actualizar los resultados. Tu voto registrado se conserva.'
        : 'No pudimos cargar las votaciones.');
    } finally {
      if (alive.current && request === reads.current) setLoading(false);
    }
  }

  async function handleVote(pollId, optionIndex) {
    if (!eligible || operations.current.has(pollId) || committed.current.has(pollId)) return;
    operations.current.add(pollId);
    reads.current += 1;
    setBusy(prev => ({ ...prev, [pollId]: true }));
    setMsg('');
    try {
      await api.post(`/polls/${pollId}/vote`, { option_index: optionIndex });
      if (!alive.current) return;
      committed.current.add(pollId);
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, has_voted: true } : p));
      setUnreconciled(prev => ({ ...prev, [pollId]: true }));
      setMsg('Voto registrado');
      await load();
    } catch (err) {
      if (alive.current) setMsg(err.response?.data?.error || 'Error al votar');
    } finally {
      operations.current.delete(pollId);
      if (alive.current) { setBusy(prev => ({ ...prev, [pollId]: false })); setLoading(false); }
    }
  }

  if (!eligible) return null;

  const visiblePolls = polls.filter(p => p.has_voted || !p.expires_at || new Date(p.expires_at) > new Date());
  if (!loading && !loadError && visiblePolls.length === 0) return null;

  return (
    <div style={s.container}>
      <h3 style={s.heading}>Votaciones</h3>
      {msg && <p style={s.msg}>{msg}</p>}
      {loading && <p role="status">Cargando votaciones...</p>}
      {loadError && <div role="alert"><p>{loadError}</p><button onClick={load} disabled={loading} style={s.optionBtn}>Reintentar votaciones</button></div>}

      {visiblePolls.map((p) => {
        const options = typeof p.options === 'string' ? JSON.parse(p.options) : (p.options || []);
        const totalVotes = Array.isArray(p.results) ? p.results.reduce((sum, r) => sum + parseInt(r.count), 0) : 0;
        return (
          <div key={p.id} style={s.card}>
            <strong>{p.title}</strong>
            {p.has_voted && <p role="status" style={s.msg}>Voto registrado</p>}
            {p.description && <p style={s.desc}>{p.description}</p>}
            {unreconciled[p.id] && <p>Resultados pendientes de actualización.</p>}
            <div style={s.optionsGrid}>
              {options.map((opt, i) => {
                const r = Array.isArray(p.results) ? p.results.find(r => r.option_index === i) : null;
                const count = r ? parseInt(r.count) : 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                return (
                  p.has_voted ? <div key={i} style={s.optionBtn}>
                    <span style={s.optionLabel}>{opt}</span>
                    {!unreconciled[p.id] && <span style={s.optionBar}>{count} votos · {pct}%</span>}
                  </div> : <button key={i} disabled={Boolean(busy[p.id])} style={s.optionBtn} onClick={() => handleVote(p.id, i)}>
                    <span style={s.optionLabel}>{opt}</span>
                    {totalVotes > 0 && <span style={s.optionBar}><span style={{ ...s.barFill, width: `${pct}%` }} /> {pct}%</span>}
                  </button>
                );
              })}
            </div>
            {!unreconciled[p.id] && <small style={s.info}>{totalVotes} votos{p.expires_at ? ` · Vence ${new Date(p.expires_at).toLocaleDateString('es-AR')}` : ''}</small>}
          </div>
        );
      })}
    </div>
  );
}

const s = {
  container: { marginTop: '1.5rem', maxWidth: '800px', margin: '1.5rem auto 0', padding: '0 1.5rem' },
  heading: { fontSize: '1.1rem', color: '#2c3e50', marginBottom: '0.75rem' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.4rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.5rem' },
  card: { background: '#fff', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.75rem' },
  desc: { fontSize: '0.85rem', color: '#6c757d', margin: '0.3rem 0' },
  optionsGrid: { display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' },
  optionBtn: { padding: '0.6rem', border: '1px solid #dee2e6', borderRadius: '6px', background: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' },
  optionLabel: { fontWeight: 500, display: 'block' },
  optionBar: { display: 'block', marginTop: '0.25rem', fontSize: '0.75rem', color: '#6c757d' },
  barFill: { display: 'inline-block', height: '4px', background: '#0d6efd', borderRadius: '2px', verticalAlign: 'middle', marginRight: '0.4rem' },
  info: { color: '#adb5bd', fontSize: '0.75rem', display: 'block', marginTop: '0.5rem' },
};
