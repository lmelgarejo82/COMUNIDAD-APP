import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import t from '../theme';

const { colors, primaryBtn, toast, badge, card, kpiCard, sectionTitle, table } = t;

export default function DashboardAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/dashboard/admin').then(r => setData(r.data)).catch(e => setError(getErrorMessage(e, 'Error al cargar el dashboard')));
  }, []);

  async function downloadReport(type, label) {
    setDownloading(label);
    try {
      const resp = await api.get(`/reports/${type}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a'); a.href = url; a.download = `reporte-${type}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { alert('Error al descargar'); }
    finally { setDownloading(''); }
  }

  if (error) return <div style={t.page}><p style={{ color: colors.danger, textAlign: 'center', padding: '2rem' }}>{error}</p></div>;
  if (!data) return <div style={t.page}><Spinner /></div>;

  const m = data.porcentaje_morosidad || 0;
  const mo = m > 30 ? { c: colors.morosidadAlta, bg: colors.dangerSoft, lbl: 'Alta' }
    : m > 10 ? { c: colors.morosidadMedia, bg: colors.accentSoft, lbl: 'Media' }
    : { c: colors.morosidadBaja, bg: colors.successSoft, lbl: 'Baja' };
  const tp = (data.tickets_pendientes || 0) > 5 ? { c: colors.danger, bg: colors.dangerSoft, lbl: 'Atención' }
    : (data.tickets_pendientes || 0) > 0 ? { c: colors.accent, bg: colors.accentSoft, lbl: 'Pendientes' }
    : { c: colors.success, bg: colors.successSoft, lbl: 'Al día' };

  return (
    <div style={t.page}>
      <div style={t.headerBar}>
        <div><h2 style={t.font.title}>Dashboard</h2><span style={t.font.subtitle}>Resumen general</span></div>
        <button style={primaryBtn} onClick={() => navigate('/expensas')}>+ Nueva Expensa</button>
      </div>

      <div style={t.kpiGrid}>
        {[
          { label: 'Recaudado este mes', value: `$${(data.total_recaudado || 0).toLocaleString()}`, color: colors.success },
          { label: 'Morosidad', value: `${m}%`, color: mo.c, badge: mo.lbl, badgeBg: mo.bg, badgeC: mo.c },
          { label: 'Tickets pendientes', value: data.tickets_pendientes || 0, color: tp.c, badge: tp.lbl, badgeBg: tp.bg, badgeC: tp.c },
        ].map((k, i) => (
          <div key={i} style={kpiCard(k.color)}>
            <p style={t.font.label}>{k.label}</p>
            <p style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.3rem', color: k.color }}>{k.value}</p>
            {k.badge && <span style={badge(k.badgeC, k.badgeBg)}>{k.badge}</span>}
          </div>
        ))}
      </div>

      {(data.total_recaudado_por_edificio || []).length > 0 && (
        <div style={{ ...card, padding: '1rem', marginBottom: '0.75rem' }}>
          <h3 style={sectionTitle}>Recaudación por edificio</h3>
          <div style={table.wrap}>
            <table style={table.table}><thead><tr>{['Edificio','Total pagado','Unidades','Morosidad'].map(h => <th key={h} style={table.th}>{h}</th>)}</tr></thead>
              <tbody>{(data.total_recaudado_por_edificio || []).map((e, i) => (
                <tr key={i} style={table.tr}>
                  <td style={table.td}>{e.building_name}</td>
                  <td style={table.td}>${parseFloat(e.total_paid || 0).toLocaleString()}</td>
                  <td style={table.td}>{e.total_units}</td>
                  <td style={table.td}><span style={badge(parseFloat(e.pct_morosos) > 30 ? colors.danger : colors.success, parseFloat(e.pct_morosos) > 30 ? colors.dangerSoft : colors.successSoft)}>{e.pct_morosos}%</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {(data.evolucion_mensual || []).length > 0 && (
          <div style={{ ...card, padding: '1rem' }}>
            <h3 style={sectionTitle}>Evolución mensual</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(data.evolucion_mensual || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ color: colors.textSecondary }}>{m.month}</span>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>${parseFloat(m.total_paid || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(data.morosidad_por_tipo_unidad || []).length > 0 && (
          <div style={{ ...card, padding: '1rem' }}>
            <h3 style={sectionTitle}>Morosidad por tipo</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(data.morosidad_por_tipo_unidad || []).map((x, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ color: colors.textSecondary, textTransform: 'capitalize' }}>{x.ownership_type}</span>
                  <span style={{ fontWeight: 600, color: parseFloat(x.pct_morosidad) > 30 ? colors.danger : colors.textPrimary }}>{x.pct_morosidad}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={() => downloadReport('delinquency', 'Morosidad')} disabled={!!downloading} style={{ flex: 1, minWidth: '160px', textAlign: 'center', padding: '0.65rem', background: colors.white, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: t.radius.button, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          {downloading === 'Morosidad' ? 'Descargando...' : '📊 Reporte de Morosidad'}
        </button>
        <button onClick={() => downloadReport('cashflow', 'Flujo')} disabled={!!downloading} style={{ flex: 1, minWidth: '160px', textAlign: 'center', padding: '0.65rem', background: colors.white, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: t.radius.button, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          {downloading === 'Flujo' ? 'Descargando...' : '💰 Reporte de Flujo de Caja'}
        </button>
      </div>
    </div>
  );
}
