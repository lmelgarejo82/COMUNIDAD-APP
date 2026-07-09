import t from '../../theme';

export default function UnitSearchSelect({ value, onChange }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={t.font.label}>Unidad o destino</span>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej: Torre A 3B, Casa 12, Administración"
        style={t.input}
      />
    </label>
  );
}
