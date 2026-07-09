import { useState, useEffect, useCallback } from 'react';
import { hierarchyService } from '../services/hierarchy';
import { getErrorMessage } from '../services/errors';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import Spinner from '../components/Spinner';

function UnitBadge({ unit, floorId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unit-${unit.id}`,
    data: { unit_id: unit.id, unit_code: unit.unit_code, source_floor_id: floorId },
  });
  return (
    <span ref={setNodeRef} {...listeners} {...attributes}
      style={{ ...s.unitTag, opacity: isDragging ? 0.3 : 1, cursor: 'grab' }}>
      {unit.unit_code}
    </span>
  );
}

function FloorDropZone({ floor, units, collapsed, onToggle }) {
  const { setNodeRef, isOver } = useDroppable({ id: `floor-${floor.id}` });
  return (
    <div ref={setNodeRef} style={{ ...s.floorCard, borderColor: isOver ? '#0F3B5E' : '#E9ECEF', background: isOver ? '#D6EAF8' : '#FFFFFF' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: units.length > 0 ? '0.3rem' : 0 }} onClick={() => onToggle(floor.id)}>
        <span style={s.chevron}>{collapsed ? '\u25B6' : '\u25BC'}</span>
        <span style={s.floorName}>{floor.name || `Piso ${floor.number || '?'}`}</span>
        <span style={s.badgeSm}>{(units || []).length} unid.</span>
      </div>
      {!collapsed && (
        <div style={s.unitsRow}>
          {(units || []).length === 0
            ? <span style={s.empty}>Sin unidades</span>
            : (units || []).map(u => <UnitBadge key={u.id} unit={u} floorId={floor.id} />)}
        </div>
      )}
    </div>
  );
}

function BuildingCard({ building, collapsed, onToggle, floorCollapsed, onFloorToggle }) {
  const bCollapsed = collapsed;
  return (
    <div key={building.id} style={s.buildingCard}>
      <div style={s.buildingHeader} onClick={() => onToggle(building.id)}>
        <span style={s.chevron}>{bCollapsed ? '\u25B6' : '\u25BC'}</span>
        <span style={s.buildingName}>{building.name}</span>
      </div>
      {!bCollapsed && (building.floors || []).map(floor => (
        <FloorDropZone key={floor.id} floor={floor} units={floor.units || []}
          collapsed={floorCollapsed[floor.id]} onToggle={onFloorToggle} />
      ))}
    </div>
  );
}

function ComplexSection({ tree, collapsed, onToggle, buildingCollapsed, onBuildingToggle, floorCollapsed, onFloorToggle }) {
  return (
    <div style={s.complexCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem', background: 'linear-gradient(135deg, #0F3B5E 0%, #1A5276 100%)', color: '#FFFFFF', cursor: 'pointer', userSelect: 'none', borderRadius: '10px 10px 0 0' }} onClick={() => onToggle(tree.id)}>
        <span style={s.chevron}>{collapsed ? '\u25B6' : '\u25BC'}</span>
        <div style={s.complexInfo}><span style={s.complexName}>{tree.name}</span></div>
      </div>
      {!collapsed && (
        <div style={s.buildingsList}>
          {(tree.buildings || []).map(building => (
            <BuildingCard key={building.id} building={building}
              collapsed={!!buildingCollapsed[building.id]} onToggle={onBuildingToggle}
              floorCollapsed={floorCollapsed} onFloorToggle={onFloorToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUnidades() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('');
  const [collapsedComplexes, setCollapsedComplexes] = useState({});
  const [collapsedBuildings, setCollapsedBuildings] = useState({});
  const [collapsedFloors, setCollapsedFloors] = useState({});
  const [draggedUnit, setDraggedUnit] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try { const { data } = await hierarchyService.getTree(); setTrees(Array.isArray(data) ? data : []); }
    catch (err) { showMsg(getErrorMessage(err, 'Error al cargar el árbol'), 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchTree(); }, [fetchTree]);

  function showMsg(text, type = 'success') { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 2500); }
  function toggleComplex(id) { setCollapsedComplexes(p => ({ ...p, [id]: !p[id] })); }
  function toggleBuilding(id) { setCollapsedBuildings(p => ({ ...p, [id]: !p[id] })); }
  function toggleFloor(id) { setCollapsedFloors(p => ({ ...p, [id]: !p[id] })); }

  function moveUnitLocally(unitId, toFloorId) {
    setTrees(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let movingUnit = null;
      for (const tree of next) for (const building of (tree.buildings || [])) for (const floor of (building.floors || [])) {
        const idx = (floor.units || []).findIndex(u => u.id === unitId);
        if (idx !== -1) { movingUnit = floor.units.splice(idx, 1)[0]; break; }
      }
      if (movingUnit) for (const tree of next) for (const building of (tree.buildings || [])) {
        const tf = (building.floors || []).find(f => f.id === toFloorId);
        if (tf) { if (!tf.units) tf.units = []; tf.units.push(movingUnit); tf.units.sort((a, b) => a.unit_code.localeCompare(b.unit_code)); return next; }
      }
      return next;
    });
  }

  async function handleDragEnd(event) {
    const { active, over } = event; setDraggedUnit(null);
    if (!over) return;
    const unitId = active.data.current?.unit_id, sourceFloorId = active.data.current?.source_floor_id;
    const targetFloorId = parseInt(String(over.id).replace('floor-', ''));
    if (sourceFloorId === targetFloorId) return;
    moveUnitLocally(unitId, targetFloorId);
    try {
      await hierarchyService.reorganizeUnits([{ unit_id: unitId, new_floor_id: targetFloorId }]);
      showMsg('Unidad reubicada correctamente');
    } catch (err) { moveUnitLocally(unitId, sourceFloorId); showMsg(getErrorMessage(err, 'Error'), 'error'); }
  }
  function handleDragStart(event) { if (event.active.data.current?.unit_code) setDraggedUnit(event.active.data.current); }

  if (loading) return <Spinner />;
  const totalUnits = trees.reduce((sum, t) => sum + (t.buildings || []).reduce((s, b) => s + (b.floors || []).reduce((fs, f) => fs + (f.units || []).length, 0), 0), 0);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={s.page}>
        <div style={s.topBar}>
          <div>
            <h2 style={s.title}>Unidades</h2>
            <span style={s.subtitle}>{trees.length} complejo{trees.length !== 1 ? 's' : ''} &middot; {totalUnits} unidades &middot; Arrastrá para reordenar</span>
          </div>
          {msg && <span style={{ ...s.toast, background: msgType === 'error' ? '#fce4ec' : '#e8f5e9', color: msgType === 'error' ? '#c62828' : '#2e7d32', borderColor: msgType === 'error' ? '#ef9a9a' : '#a5d6a7' }}>{msg}</span>}
        </div>

        {trees.length === 0 ? (
          <p style={s.emptyTree}>No hay complejos configurados.</p>
        ) : (
          trees.map(tree => (
            <ComplexSection key={tree.id} tree={tree}
              collapsed={!!collapsedComplexes[tree.id]} onToggle={toggleComplex}
              buildingCollapsed={collapsedBuildings} onBuildingToggle={toggleBuilding}
              floorCollapsed={collapsedFloors} onFloorToggle={toggleFloor} />
          ))
        )}
      </div>
      <DragOverlay>{draggedUnit ? <span style={s.dragOverlay}>{draggedUnit.unit_code}</span> : null}</DragOverlay>
    </DndContext>
  );
}

const s = {
  page: { maxWidth: '1024px', margin: '0 auto', padding: '1.5rem 1.25rem', fontFamily: 'system-ui, -apple-system, sans-serif' },
  topBar: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' },
  title: { margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#212529', letterSpacing: '-0.01em' },
  subtitle: { fontSize: '0.8rem', color: '#6C757D', marginTop: '2px', display: 'block' },
  toast: { fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid', fontWeight: 500 },
  emptyTree: { textAlign: 'center', color: '#6C757D', padding: '2rem 0' },

  complexCard: { marginBottom: '0.75rem', border: '1px solid #E9ECEF', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  complexHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem', background: 'linear-gradient(135deg, #0F3B5E 0%, #1A5276 100%)', color: '#FFFFFF', cursor: 'pointer', userSelect: 'none', borderRadius: '10px 10px 0 0' },
  chevron: { fontSize: '0.6rem', opacity: 0.8, width: '14px', flexShrink: 0 },
  complexInfo: { flex: 1, minWidth: 0 },
  complexName: { fontWeight: 700, fontSize: '0.95rem' },
  buildingsList: { padding: '0.5rem 0.75rem 0.75rem' },

  buildingCard: { marginBottom: '0.4rem', border: '1px solid #E9ECEF', borderRadius: '8px', overflow: 'hidden' },
  buildingHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', background: '#F8F9FA', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid #E9ECEF' },
  buildingName: { fontWeight: 600, fontSize: '0.85rem', color: '#212529' },
  badgeSm: { fontSize: '0.7rem', color: '#6C757D', background: '#E9ECEF', padding: '1px 6px', borderRadius: '8px', marginLeft: 'auto' },

  floorCard: { margin: '0.3rem 0 0.3rem 1.2rem', padding: '0.5rem 0.7rem', border: '2px dashed', borderRadius: '6px', transition: 'background 0.15s, border-color 0.15s' },
  floorName: { fontSize: '0.8rem', color: '#6C757D', fontWeight: 500 },

  unitsRow: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', paddingLeft: '0.3rem' },
  unitTag: { display: 'inline-block', padding: '0.25rem 0.6rem', background: 'linear-gradient(135deg, #0F3B5E, #1A5276)', color: '#FFFFFF', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 500, userSelect: 'none', transition: 'opacity 0.15s', boxShadow: '0 1px 3px rgba(15,59,94,0.25)' },
  empty: { fontSize: '0.75rem', color: '#ADB5BD', fontStyle: 'italic' },

  dragOverlay: { display: 'inline-block', padding: '0.3rem 0.7rem', background: 'linear-gradient(135deg, #0F3B5E, #1A5276)', color: '#FFFFFF', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 500, boxShadow: '0 6px 20px rgba(15,59,94,0.35)' },
};
