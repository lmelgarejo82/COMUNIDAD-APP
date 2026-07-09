import { useState } from 'react';
import t from '../../theme';

function countUnits(building) {
  return (building.floors || []).reduce((sum, floor) => sum + (floor.units || []).length, 0);
}

function actionButton(color) {
  return {
    fontSize: '0.72rem',
    padding: '2px 6px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color,
    borderRadius: t.radius.small,
    fontFamily: 'inherit',
  };
}

export default function ClassicView({ tree, canCreateComplex, onCreate, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState({});

  function toggle(key) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  if (!tree) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: t.colors.textSecondary }}>
        <p style={{ fontWeight: 600, color: t.colors.textPrimary, margin: '0 0 0.25rem' }}>No hay estructura seleccionada</p>
        <p style={{ fontSize: '0.8rem', margin: 0 }}>Selecciona un complejo para administrar edificios, pisos y unidades.</p>
        {canCreateComplex && (
          <button style={{ ...t.primaryBtn, marginTop: '1rem' }} onClick={() => onCreate('complex', null)}>
            Nuevo complejo
          </button>
        )}
      </div>
    );
  }

  const buildings = tree.buildings || [];
  const totalUnits = buildings.reduce((sum, building) => sum + countUnits(building), 0);

  return (
    <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
      <div style={{ ...t.card, padding: '0.9rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: t.colors.textPrimary }}>{tree.name}</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: t.colors.textSecondary }}>
              {buildings.length} edificio{buildings.length !== 1 ? 's' : ''} · {totalUnits} unidad{totalUnits !== 1 ? 'es' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button style={t.secondaryBtn} onClick={() => onEdit('complex', tree)}>Editar complejo</button>
            <button style={t.primaryBtn} onClick={() => onCreate('building', tree)}>Nuevo edificio</button>
          </div>
        </div>
      </div>

      {buildings.length === 0 ? (
        <div style={{ color: t.colors.textDisabled, fontSize: '0.85rem', padding: '1rem' }}>
          Este complejo no tiene edificios configurados.
        </div>
      ) : buildings.map(building => {
        const buildingKey = `building-${building.id}`;
        const buildingCollapsed = collapsed[buildingKey] === true;
        const floors = building.floors || [];

        return (
          <div key={building.id} style={{ ...t.card, marginBottom: '0.65rem', overflow: 'hidden' }}>
            <div
              onClick={() => toggle(buildingKey)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.8rem', background: t.colors.bg, cursor: 'pointer', borderBottom: `1px solid ${t.colors.border}` }}
            >
              <span style={{ width: 14, fontSize: '0.6rem', color: t.colors.textSecondary }}>{buildingCollapsed ? '>' : 'v'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: t.colors.textPrimary, fontSize: '0.88rem' }}>{building.name}</strong>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: t.colors.textSecondary }}>{building.building_type || 'edificio'}</span>
              </div>
              <span style={{ fontSize: '0.72rem', color: t.colors.textSecondary }}>{floors.length} pisos · {countUnits(building)} unidades</span>
              <div style={{ display: 'flex', gap: '0.15rem' }} onClick={e => e.stopPropagation()}>
                <button style={actionButton(t.colors.primary)} onClick={() => onCreate('floor', building)}>+ Piso</button>
                <button style={actionButton(t.colors.textSecondary)} onClick={() => onEdit('building', building)}>Editar</button>
                <button style={actionButton(t.colors.danger)} onClick={() => onDelete('building', building)}>Eliminar</button>
              </div>
            </div>

            {!buildingCollapsed && (
              <div style={{ padding: '0.5rem 0.75rem' }}>
                {floors.length === 0 ? (
                  <div style={{ color: t.colors.textDisabled, fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}>Sin pisos.</div>
                ) : floors.map(floor => {
                  const floorKey = `floor-${floor.id}`;
                  const floorCollapsed = collapsed[floorKey] === true;
                  const units = floor.units || [];

                  return (
                    <div key={floor.id} style={{ border: `1px dashed ${t.colors.border}`, borderRadius: t.radius.input, marginBottom: '0.4rem' }}>
                      <div
                        onClick={() => toggle(floorKey)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.55rem', cursor: 'pointer' }}
                      >
                        <span style={{ width: 12, fontSize: '0.55rem', color: t.colors.textSecondary }}>{floorCollapsed ? '>' : 'v'}</span>
                        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: t.colors.textSecondary }}>{floor.name || `Piso ${floor.number}`}</span>
                        <span style={{ fontSize: '0.72rem', color: t.colors.textSecondary }}>{units.length} unidades</span>
                        <div style={{ display: 'flex', gap: '0.15rem' }} onClick={e => e.stopPropagation()}>
                          <button style={actionButton(t.colors.primary)} onClick={() => onCreate('unit', floor)}>+ Unidad</button>
                          <button style={actionButton(t.colors.textSecondary)} onClick={() => onEdit('floor', floor)}>Editar</button>
                          <button style={actionButton(t.colors.danger)} onClick={() => onDelete('floor', floor)}>Eliminar</button>
                        </div>
                      </div>

                      {!floorCollapsed && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.4rem', padding: '0 0.55rem 0.55rem 1.4rem' }}>
                          {units.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: t.colors.textDisabled, fontStyle: 'italic' }}>Sin unidades</span>
                          ) : units.map(unit => (
                            <div key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.35rem 0.5rem', background: t.colors.white }}>
                              <strong style={{ color: t.colors.primary, fontSize: '0.82rem' }}>{unit.unit_code}</strong>
                              {unit.area_m2 && <span style={{ fontSize: '0.68rem', color: t.colors.textSecondary }}>{unit.area_m2}m²</span>}
                              {unit.coef_percent && <span style={{ fontSize: '0.68rem', color: t.colors.textSecondary }}>{unit.coef_percent}%</span>}
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.1rem' }}>
                                <button style={actionButton(t.colors.textSecondary)} onClick={() => onEdit('unit', unit)}>Editar</button>
                                <button style={actionButton(t.colors.danger)} onClick={() => onDelete('unit', unit)}>Eliminar</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
