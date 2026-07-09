import t from '../../theme';

const visitTypes = [
  { value: '', label: 'Tipo' },
  { value: 'guest', label: 'Visita' },
  { value: 'delivery', label: 'Entrega' },
  { value: 'service', label: 'Servicio' },
  { value: 'provider', label: 'Proveedor' },
  { value: 'other', label: 'Otro' },
];

export default function AccessFilters({ filters, onChange, onClear }) {
  return (
    <div style={{ ...t.card, padding: '0.75rem', display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 150px auto', gap: '0.55rem', alignItems: 'center' }}>
      <input
        value={filters.search || ''}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Buscar visitante, documento, patente o destino"
        style={{ ...t.input, marginBottom: 0 }}
      />
      <select
        value={filters.visit_type || ''}
        onChange={(e) => onChange({ ...filters, visit_type: e.target.value })}
        style={{ ...t.input, marginBottom: 0 }}
      >
        {visitTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
      <button type="button" onClick={onClear} style={{ ...t.secondaryBtn, padding: '0.5rem 0.8rem' }}>
        Limpiar
      </button>
    </div>
  );
}
