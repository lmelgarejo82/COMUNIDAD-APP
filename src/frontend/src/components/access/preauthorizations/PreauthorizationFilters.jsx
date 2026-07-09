import t from '../../../theme';
import { preauthInitialFilters } from './preauthorizationUtils';

export default function PreauthorizationFilters({ filters, onChange }) {
  const update = (field, value) => onChange(prev => ({ ...prev, [field]: value }));

  return (
    <div style={styles.filtersGrid}>
      <input
        value={filters.search}
        onChange={(e) => update('search', e.target.value)}
        placeholder="Buscar visitante, documento, patente o unidad"
        style={t.input}
      />
      <select value={filters.status} onChange={(e) => update('status', e.target.value)} style={t.input}>
        <option value="">Todos los estados</option>
        <option value="pending">Pendiente</option>
        <option value="used">Usada</option>
        <option value="cancelled">Cancelada</option>
        <option value="expired">Vencida</option>
      </select>
      <input type="date" value={filters.date_from} onChange={(e) => update('date_from', e.target.value)} style={t.input} />
      <input type="date" value={filters.date_to} onChange={(e) => update('date_to', e.target.value)} style={t.input} />
      <button type="button" onClick={() => onChange(preauthInitialFilters)} style={t.secondaryBtn}>
        Limpiar filtros
      </button>
    </div>
  );
}

const styles = {
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '0.45rem',
    alignItems: 'start',
  },
};
