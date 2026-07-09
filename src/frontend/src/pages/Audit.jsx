import { useState, useEffect } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errors';
import Spinner from '../components/Spinner';

const ACTION_LABELS = {
  CONFIRM_PAYMENT: 'Pago confirmado',
  CREATE_EXPENSE: 'Expensa creada',
  UPDATE_EXPENSE: 'Expensa editada',
  CREATE_ANNOUNCEMENT: 'Anuncio creado',
  DELETE_ANNOUNCEMENT: 'Anuncio eliminado',
  UPDATE_TICKET_STATUS: 'Ticket actualizado',
};

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => { load(); }, [filterAction]);

  async function load() {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filterAction) params.action = filterAction;
      const { data } = await api.get('/admin/audit', { params });
      setRows(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Error al cargar historial'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={s.container}><Spinner /></div>;
  if (error) return <div style={s.container}><p style={s.error}>{error}</p></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Historial de actividad</h2>

      <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} style={s.select}>
        <option value="">Todas las acciones</option>
        {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      {rows.length === 0 ? (
        <p style={s.empty}>Sin registros.</p>
      ) : (
        <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={s.cell}>{new Date(r.created_at).toLocaleString('es-AR')}</td>
                <td style={s.cell}>{r.user_email}</td>
                <td style={s.cell}>
                  <span style={s.badge}>{ACTION_LABELS[r.action] || r.action}</span>
                </td>
                <td style={s.cell}>
                  <code style={s.code}>{typeof r.details === 'object' ? JSON.stringify(r.details) : r.details}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { padding: '1.5rem', maxWidth: '960px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  error: { color: '#dc3545', textAlign: 'center', padding: '2rem' },
  empty: { color: '#6c757d', textAlign: 'center', padding: '2rem' },
  select: { padding: '0.5rem 0.75rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '1rem', minHeight: '44px' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', minWidth: '550px', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  cell: { padding: '0.6rem 0.75rem', borderBottom: '1px solid #e9ecef', fontSize: '0.85rem', color: '#495057' },
  badge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: '#e9ecef', color: '#495057' },
  code: { fontSize: '0.75rem', background: '#f8f9fa', padding: '0.15rem 0.4rem', borderRadius: '3px', color: '#6c757d', wordBreak: 'break-all' },
};
