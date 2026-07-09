import { useState } from 'react';
import { getNodeType } from './Card';
import t from '../../theme';

function countUnits(floors) {
  if (!floors) return 0;
  return floors.reduce((sum, f) => sum + (f.units?.length || 0), 0);
}

function BuildingCard({ building, onClick }) {
  const floors = building.floors || [];
  const totalUnits = countUnits(floors);
  const typeLabel = building.building_type === 'tower' ? 'Torre'
    : building.building_type === 'block' ? 'Bloque'
    : building.building_type === 'house' ? 'Casa'
    : building.building_type || 'Edificio';

  return (
    <div
      onClick={() => onClick(building)}
      style={{
        background: t.colors.white,
        border: `1px solid ${t.colors.border}`,
        borderLeft: `4px solid ${t.colors.secondary}`,
        borderRadius: t.radius.button,
        padding: '1rem',
        cursor: 'pointer',
        minWidth: '220px',
        flex: '1 1 220px',
        maxWidth: '320px',
        transition: 'box-shadow 0.15s, transform 0.1s',
        fontFamily: t.font.family,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = t.shadow.elevated; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.2rem' }}>{'\uD83C\uDFE2'}</span>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: t.colors.textPrimary }}>{building.name}</span>
        <span style={{ fontSize: '0.65rem', color: t.colors.textSecondary, background: t.colors.secondarySoft, padding: '1px 6px', borderRadius: '10px', marginLeft: 'auto' }}>{typeLabel}</span>
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: t.colors.textSecondary }}>
        <span>{'\uD83D\uDCCB'} {floors.length} {floors.length === 1 ? 'piso' : 'pisos'}</span>
        <span>{'\uD83C\uDFE0'} {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}</span>
      </div>
    </div>
  );
}

function BuildingDetailModal({ building, onClose }) {
  const [collapsedFloors, setCollapsedFloors] = useState({});

  function toggleFloor(idx) {
    setCollapsedFloors(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  const floors = building.floors || [];

  return (
    <div style={t.modal.overlay} onClick={onClose}>
      <div style={{ ...t.modal.box, maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={t.modal.title}>{'\uD83C\uDFE2'} {building.name}</h3>
        <p style={{ fontSize: '0.8rem', color: t.colors.textSecondary, margin: '0 0 0.75rem' }}>
          {floors.length} {floors.length === 1 ? 'piso' : 'pisos'} &middot; {countUnits(floors)} unidades totales
        </p>

        {floors.map((floor, fi) => (
          <div key={floor.id} style={{ marginBottom: '0.5rem' }}>
            <div
              onClick={() => toggleFloor(fi)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.5rem',
                background: t.colors.accentSoft,
                borderRadius: t.radius.input,
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: '0.55rem' }}>{collapsedFloors[fi] ? '\u25B6' : '\u25BC'}</span>
              <span>{'\uD83D\uDCCB'}</span>
              <span>{floor.name || `Piso ${floor.number}`}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: t.colors.textSecondary }}>{(floor.units || []).length} unid.</span>
            </div>
            {!collapsedFloors[fi] && (floor.units || []).map(unit => (
              <div key={unit.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.3rem 0.5rem 0.3rem 2rem',
                fontSize: '0.78rem',
                borderBottom: `1px solid ${t.colors.border}`,
              }}>
                <span>{'\uD83C\uDFE0'}</span>
                <span style={{ fontWeight: 500 }}>{unit.unit_code}</span>
                {unit.area_m2 && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: t.colors.textSecondary }}>{unit.area_m2}m\u00B2</span>}
                {unit.coef_percent && <span style={{ fontSize: '0.7rem', color: t.colors.textSecondary }}>{unit.coef_percent}%</span>}
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button style={t.secondaryBtn} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default function CompactView({ tree }) {
  const [selectedBuilding, setSelectedBuilding] = useState(null);

  if (!tree) {
    return <div style={{ textAlign: 'center', padding: '3rem 1rem', color: t.colors.textSecondary }}>
      <p style={{ fontWeight: 600, color: t.colors.textPrimary, margin: '0 0 0.25rem' }}>No hay estructura seleccionada</p>
      <p style={{ fontSize: '0.8rem', margin: 0 }}>Seleccioná un complejo para ver el resumen.</p>
    </div>;
  }

  const buildings = tree.buildings || [];
  const totalUnits = buildings.reduce((s, b) => s + countUnits(b.floors), 0);
  const totalFloors = buildings.reduce((s, b) => s + (b.floors?.length || 0), 0);

  return (
    <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: t.colors.textPrimary }}>
          {tree.name}
        </h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: t.colors.textSecondary }}>
          {buildings.length} {buildings.length === 1 ? 'edificio' : 'edificios'} &middot; {totalFloors} pisos &middot; {totalUnits} unidades totales
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {buildings.map(b => (
          <BuildingCard key={b.id} building={b} onClick={setSelectedBuilding} />
        ))}
      </div>

      {buildings.length === 0 && (
        <p style={{ color: t.colors.textDisabled, fontStyle: 'italic', fontSize: '0.85rem' }}>
          Este complejo no tiene edificios.
        </p>
      )}

      {selectedBuilding && (
        <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)} />
      )}
    </div>
  );
}
