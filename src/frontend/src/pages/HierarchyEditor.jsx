import { useState, useEffect, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useCommunity } from '../context/CommunityContext';
import { hierarchyService } from '../services/hierarchy';
import { getErrorMessage } from '../services/errors';
import Spinner from '../components/Spinner';
import Palette from '../components/hierarchy/Palette';
import TreeView from '../components/hierarchy/TreeView';
import CompactView from '../components/hierarchy/CompactView';
import EditView from '../components/hierarchy/EditView';
import EditModal from '../components/hierarchy/EditModal';
import BulkCreateModal from '../components/hierarchy/BulkCreateModal';
import t from '../theme';

const VALID_DROPS = { complex: 'building', building: 'floor', floor: 'unit' };
const TARGET_PARENT = { building: 'complex', floor: 'building', unit: 'floor' };

const MODES = [
  { key: 'tree', label: '\u2630 Estructura', icon: '\uD83D\uDCCB' },
  { key: 'compact', label: '\u25A2 Compacto', icon: '\uD83C\uDFE2' },
  { key: 'edit', label: '\u25A3 Edicin', icon: '\u270F' },
];

export default function HierarchyEditor() {
  const { complexes, selectedId, setSelectedId, fetchComplexes } = useCommunity();
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('');
  const [mode, setMode] = useState(() => localStorage.getItem('hierarchyMode') || 'tree');
  const [edit, setEdit] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [del, setDel] = useState(null);
  const [activeDrag, setActiveDrag] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const showMsg = useCallback((text, type = 'success') => {
    setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 3500);
  }, []);

  const loadTree = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const { data } = await hierarchyService.getTree(selectedId);
      setTree(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch (err) {
      showMsg(getErrorMessage(err, 'Error al cargar estructura'), 'error');
    } finally { setLoading(false); }
  }, [selectedId, showMsg]);

  useEffect(() => { fetchComplexes(); }, []);
  useEffect(() => { loadTree(); }, [loadTree]);

  function setModeAndSave(m) { localStorage.setItem('hierarchyMode', m); setMode(m); }

  // ─── Drag & Drop (modo edicin) ───────────────────────────────────

  function handleDragStart(event) { setActiveDrag(event.active); }

  async function handleDragEnd(event) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const src = active.data.current;
    const tgt = over.data.current;

    if (src.source === 'palette') {
      if (VALID_DROPS[tgt.type] !== src.type) {
        showMsg(`${src.type} no se puede soltar sobre ${tgt.type}`, 'error'); return;
      }
      try {
        if (src.type === 'complex') {
          await hierarchyService.createComplex({ name: 'Nuevo Complejo' });
          await fetchComplexes();
        } else if (src.type === 'building') {
          await hierarchyService.createBuilding({ complex_id: tgt.node.id, name: 'Nuevo Edificio', building_type: 'tower' });
        } else if (src.type === 'floor') {
          await hierarchyService.createFloor({ building_id: tgt.node.id, number: 1, name: 'Nuevo Piso' });
        } else if (src.type === 'unit') {
          await hierarchyService.createUnit({ floor_id: tgt.node.id, unit_code: `U${Date.now().toString(36).slice(-4).toUpperCase()}` });
        }
        showMsg('Creado correctamente'); loadTree();
      } catch (err) { showMsg(getErrorMessage(err, 'Error al crear'), 'error'); }
    } else if (src.source === 'tree') {
      if (src.node.id === tgt.node.id) return;
      if (TARGET_PARENT[src.type] !== tgt.type) {
        showMsg(`${src.type} no se puede mover a ${tgt.type}`, 'error'); return;
      }
      try {
        if (src.type === 'building') await hierarchyService.moveBuilding(src.node.id, tgt.node.id);
        else if (src.type === 'floor') await hierarchyService.moveFloor(src.node.id, tgt.node.id);
        else if (src.type === 'unit') await hierarchyService.moveUnit(src.node.id, tgt.node.id);
        showMsg('Movido correctamente'); loadTree();
      } catch (err) { showMsg(getErrorMessage(err, 'Error al mover'), 'error'); }
    }
  }

  // ─── Editar ──────────────────────────────────────────────────────

  function openEdit(nodeType, node) { setEdit({ type: nodeType, node }); }

  async function handleEditSave(nodeType, data, node) {
    try {
      if (nodeType === 'complex') await hierarchyService.updateComplex(node.id, data);
      else if (nodeType === 'building') await hierarchyService.updateBuilding(node.id, data);
      else if (nodeType === 'floor') await hierarchyService.updateFloor(node.id, data);
      else if (nodeType === 'unit') await hierarchyService.updateUnit(node.id, data);
      showMsg('Guardado correctamente'); loadTree();
    } catch (err) { throw err; }
  }

  // ─── Eliminar ────────────────────────────────────────────────────

  function openDelete(nodeType, node) { setDel({ type: nodeType, node }); }

  async function handleDelete() {
    if (!del) return;
    try {
      const { type, node } = del;
      if (type === 'complex') await hierarchyService.deleteComplex(node.id);
      else if (type === 'building') await hierarchyService.deleteBuilding(node.id);
      else if (type === 'floor') await hierarchyService.deleteFloor(node.id);
      else if (type === 'unit') await hierarchyService.deleteUnit(node.id);
      setDel(null); showMsg('Eliminado correctamente'); loadTree();
    } catch (err) { showMsg(getErrorMessage(err, 'Error al eliminar'), 'error'); setDel(null); }
  }

  // ─── Bulk ────────────────────────────────────────────────────────

  function openBulk() { setBulk({ parentType: 'complex', parentNode: tree || null }); }
  function openAddChild(nodeType, node) { setBulk({ parentType: nodeType, parentNode: node }); }

  async function handleBulkSave(payload, parentInfo) {
    try {
      if (Array.isArray(payload)) {
        for (const unit of payload) {
          await hierarchyService.createUnit({ floor_id: parentInfo.parentNode.id, ...unit });
        }
      } else {
        await hierarchyService.bulkCreate(payload);
      }
      showMsg('Creado correctamente'); loadTree();
    } catch (err) { throw err; }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading && !tree) return <Spinner />;
  const isEdit = mode === 'edit';

  return (
    <>
      <div style={{ display: 'flex', height: 'calc(100vh - 52px)', background: t.colors.bg }}>
        {isEdit && <Palette />}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* ── Top Bar ── */}
          <div style={topBar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: t.colors.textPrimary }}>Editor</h2>
              {complexes.length > 0 && (
                <select style={selectStyle} value={selectedId || ''} onChange={e => setSelectedId(parseInt(e.target.value))}>
                  {complexes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              {MODES.map(m => (
                <button key={m.key}
                  style={{
                    ...modeBtn, fontWeight: mode === m.key ? 700 : 500,
                    background: mode === m.key ? t.colors.primary : t.colors.white,
                    color: mode === m.key ? t.colors.white : t.colors.textSecondary,
                    border: mode === m.key ? `1px solid ${t.colors.primary}` : `1px solid ${t.colors.border}`,
                  }}
                  onClick={() => setModeAndSave(m.key)}>
                  {m.label}
                </button>
              ))}
              <button style={t.secondaryBtn} onClick={loadTree}>&#8635;</button>
              {tree && mode !== 'compact' && (
                <button style={t.primaryBtn} onClick={openBulk}>+ Creacin Rpida</button>
              )}
              {msg && <span style={t.toast(msgType)}>{msg}</span>}
            </div>
          </div>

          {/* ── Content ── */}
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
            {loading && <div style={{ position: 'absolute', top: '50%', left: '50%' }}><Spinner /></div>}
            {isEdit ? (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <EditView tree={tree} onEdit={openEdit} onDelete={openDelete} onAddChild={openAddChild} />
                <DragOverlay dropAnimation={null}>
                  {activeDrag ? <div style={dragGhost}>{activeDrag.data.current?.type || '...'}</div> : null}
                </DragOverlay>
              </DndContext>
            ) : mode === 'compact' ? (
              <CompactView tree={tree} />
            ) : (
              <TreeView tree={tree} onEdit={openEdit} onDelete={openDelete} onDoubleClick={openEdit} />
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {edit && <EditModal nodeType={edit.type} node={edit.node} onSave={handleEditSave} onClose={() => setEdit(null)} />}

      {bulk && (
        <BulkCreateModal
          parentType={bulk.parentType} parentNode={bulk.parentNode}
          onSave={(payload) => handleBulkSave(payload, bulk)}
          onClose={() => setBulk(null)}
        />
      )}

      {del && (
        <div style={t.modal.overlay} onClick={() => setDel(null)}>
          <div style={t.modal.box} onClick={e => e.stopPropagation()}>
            <h3 style={t.modal.title}>Confirmar eliminacin</h3>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: t.colors.textSecondary }}>
              Eliminar <strong>{del.node.name || del.node.unit_code || `#${del.node.id}`}</strong>? Esta accin es irreversible.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button style={t.secondaryBtn} onClick={() => setDel(null)}>Cancelar</button>
              <button style={t.dangerBtn} onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const topBar = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0.65rem 1rem', background: t.colors.white,
  borderBottom: `1px solid ${t.colors.border}`,
  flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0,
};

const modeBtn = {
  padding: '0.35rem 0.75rem', borderRadius: t.radius.button,
  fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'inherit', transition: 'all 0.15s',
};

const selectStyle = {
  padding: '0.35rem 0.5rem', border: `1px solid ${t.colors.border}`,
  borderRadius: t.radius.input, fontSize: '0.85rem', fontWeight: 600,
  color: t.colors.textPrimary, background: t.colors.white,
  outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
};

const dragGhost = {
  padding: '0.4rem 0.75rem', background: t.colors.white,
  border: `1px solid ${t.colors.border}`, borderRadius: t.radius.button,
  boxShadow: t.shadow.elevated, fontSize: '0.82rem', fontWeight: 600,
  color: t.colors.textPrimary, whiteSpace: 'nowrap',
};
