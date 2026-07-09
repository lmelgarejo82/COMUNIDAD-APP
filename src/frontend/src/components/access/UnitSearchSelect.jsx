import { useEffect, useRef, useState } from 'react';
import t from '../../theme';
import { hierarchyService } from '../../services/hierarchy';

export default function UnitSearchSelect({ value, selectedUnitId, onManualChange, onSelect, onClear }) {
  const [query, setQuery] = useState(value || '');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      setError('');
      try {
        const { data } = await hierarchyService.searchUnits({ q: query, limit: 12 });
        if (requestSeq.current !== seq) return;
        setOptions(data.data || []);
      } catch {
        if (requestSeq.current !== seq) return;
        setError('No pudimos buscar unidades.');
        setOptions([]);
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  function handleInput(value) {
    setQuery(value);
    setOpen(true);
    onManualChange(value);
  }

  function handleSelect(unit) {
    setOpen(false);
    setQuery(unit.unit_label);
    onSelect(unit);
  }

  function handleClear() {
    setQuery('');
    setOptions([]);
    setOpen(false);
    onClear();
  }

  return (
    <div style={{ display: 'block', position: 'relative' }}>
      <span style={t.font.label}>Unidad o destino</span>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Buscar unidad o escribir destino manual"
          style={{ ...t.input, marginBottom: 0 }}
        />
        {(selectedUnitId || query) && (
          <button type="button" onClick={handleClear} style={{ ...t.secondaryBtn, padding: '0.45rem 0.7rem' }}>
            Limpiar
          </button>
        )}
      </div>

      <div style={{ fontSize: '0.74rem', color: selectedUnitId ? t.colors.success : t.colors.textSecondary, marginTop: '0.28rem' }}>
        {selectedUnitId ? 'Unidad del sistema seleccionada.' : 'Sin unidad seleccionada: se usará como destino manual.'}
      </div>

      {open && (
        <div style={styles.dropdown}>
          {loading && <div style={styles.state}>Buscando unidades...</div>}
          {!loading && error && <div style={{ ...styles.state, color: t.colors.danger }}>{error}</div>}
          {!loading && !error && options.length === 0 && <div style={styles.state}>No se encontraron unidades.</div>}
          {!loading && !error && options.map(unit => (
            <button key={unit.unit_id} type="button" onClick={() => handleSelect(unit)} style={styles.option}>
              <strong style={{ color: t.colors.textPrimary }}>{unit.unit_label}</strong>
              <span style={{ color: t.colors.textSecondary, fontSize: '0.76rem' }}>{unit.display_path}</span>
              <span style={{ color: t.colors.textDisabled, fontSize: '0.72rem' }}>{unit.complex_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  dropdown: {
    position: 'absolute',
    zIndex: 220,
    left: 0,
    right: 0,
    top: 'calc(100% + 4px)',
    maxHeight: '240px',
    overflowY: 'auto',
    background: t.colors.white,
    border: `1px solid ${t.colors.border}`,
    borderRadius: t.radius.input,
    boxShadow: t.shadow.elevated,
  },
  option: {
    display: 'grid',
    gap: '0.12rem',
    width: '100%',
    border: 'none',
    borderBottom: `1px solid ${t.colors.border}`,
    background: t.colors.white,
    textAlign: 'left',
    padding: '0.55rem 0.65rem',
    cursor: 'pointer',
  },
  state: {
    padding: '0.75rem',
    color: t.colors.textSecondary,
    fontSize: '0.82rem',
  },
};
