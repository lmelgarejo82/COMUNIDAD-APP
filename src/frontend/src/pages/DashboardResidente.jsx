import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Spinner from '../components/Spinner';
import PollsWidget from '../components/PollsWidget';
import { getErrorMessage } from '../services/errors';

export default function DashboardResidente() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/dashboard/residente')
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Error al cargar el dashboard')));
  }, []);

  if (error) return <div style={styles.container}><p style={styles.errorMessage}>{error}</p></div>;
  if (!data) return <div style={styles.container}><Spinner /></div>;

  const saldoOk = data.saldo_pendiente === 0;
  const vencido = data.fecha_vencimiento && new Date(data.fecha_vencimiento) < new Date();

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Mi Dashboard</h2>

      <div style={styles.grid}>
        <div style={{ ...styles.card, borderLeftColor: saldoOk ? '#198754' : '#dc3545' }}>
          <p style={styles.cardLabel}>Saldo pendiente</p>
          <p style={{ ...styles.cardValue, color: saldoOk ? '#198754' : '#dc3545' }}>
            ${data.saldo_pendiente.toLocaleString()}
          </p>
          <span style={{ ...styles.badge, background: saldoOk ? '#d1e7dd' : '#f8d7da', color: saldoOk ? '#0f5132' : '#842029' }}>
            {saldoOk ? 'Al día' : 'Pendiente'}
          </span>
        </div>

        <div style={{ ...styles.card, borderLeftColor: vencido ? '#dc3545' : '#0d6efd' }}>
          <p style={styles.cardLabel}>Próximo vencimiento</p>
          <p style={styles.cardValue}>
            {data.fecha_vencimiento
              ? new Date(data.fecha_vencimiento).toLocaleDateString('es-AR')
              : 'Sin vencimientos'}
          </p>
          {vencido && <span style={{ ...styles.badge, background: '#f8d7da', color: '#842029' }}>Vencido</span>}
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Últimos anuncios</h3>
        {data.anuncios.length === 0 ? (
          <p style={styles.empty}>No hay anuncios aún.</p>
        ) : (
          data.anuncios.map((a, i) => (
            <div key={i} style={styles.anuncio}>
              <h4 style={styles.anuncioTitle}>{a.title}</h4>
              <p style={styles.anuncioContent}>{a.content}</p>
              <small style={styles.anuncioDate}>{new Date(a.created_at).toLocaleDateString('es-AR')}</small>
            </div>
          ))
        )}
      </div>

      <button style={styles.cta} onClick={() => navigate('/expensas')}>
        Pagar expensas
      </button>

      <PollsWidget />
    </div>
  );
}

const styles = {
  container: { padding: '1.5rem', maxWidth: '800px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  card: { background: '#fff', padding: '1.25rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: '4px solid #ced4da' },
  cardLabel: { fontSize: '0.8rem', color: '#6c757d', textTransform: 'uppercase', marginBottom: '0.25rem' },
  cardValue: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' },
  badge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
  section: { background: '#fff', padding: '1.25rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '1.1rem', color: '#2c3e50', marginBottom: '0.75rem' },
  empty: { color: '#6c757d', fontSize: '0.9rem' },
  anuncio: { padding: '0.75rem 0', borderBottom: '1px solid #e9ecef' },
  anuncioTitle: { fontSize: '0.95rem', color: '#2c3e50', marginBottom: '0.25rem' },
  anuncioContent: { fontSize: '0.85rem', color: '#495057', marginBottom: '0.25rem' },
  anuncioDate: { color: '#adb5bd', fontSize: '0.75rem' },
  cta: { width: '100%', padding: '0.875rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', minHeight: '48px' },
  errorMessage: { color: '#dc3545', textAlign: 'center', padding: '2rem' },
};
