import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function PollsWidget() {
  const { user } = useAuth();
  const [polls, setPolls] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await api.get('/polls');
      setPolls(data);
    } catch {}
  }

  async function handleVote(pollId, optionIndex) {
    setMsg('');
    try {
      await api.post(`/polls/${pollId}/vote`, { option_index: optionIndex });
      setMsg('Voto registrado');
      load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Error al votar');
    }
  }

  if (user?.role !== 'residente' || user?.user_type !== 'owner') return null;

  const activePolls = polls.filter(p => !p.has_voted && (!p.expires_at || new Date(p.expires_at) > new Date()));
  if (activePolls.length === 0 && polls.filter(p => p.has_voted).length === 0) return null;

  return (
    <div style={s.container}>
      <h3 style={s.heading}>Votaciones</h3>
      {msg && <p style={s.msg}>{msg}</p>}

      {activePolls.map((p) => {
        const options = typeof p.options === 'string' ? JSON.parse(p.options) : (p.options || []);
        const totalVotes = Array.isArray(p.results) ? p.results.reduce((sum, r) => sum + parseInt(r.count), 0) : 0;
        return (
          <div key={p.id} style={s.card}>
            <strong>{p.title}</strong>
            {p.description && <p style={s.desc}>{p.description}</p>}
            <div style={s.optionsGrid}>
              {options.map((opt, i) => {
                const r = Array.isArray(p.results) ? p.results.find(r => r.option_index === i) : null;
                const count = r ? parseInt(r.count) : 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                return (
                  <button key={i} style={s.optionBtn} onClick={() => handleVote(p.id, i)}>
                    <span style={s.optionLabel}>{opt}</span>
                    {totalVotes > 0 && <span style={s.optionBar}><span style={{ ...s.barFill, width: `${pct}%` }} /> {pct}%</span>}
                  </button>
                );
              })}
            </div>
            <small style={s.info}>{totalVotes} votos{p.expires_at ? ` · Vence ${new Date(p.expires_at).toLocaleDateString('es-AR')}` : ''}</small>
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
