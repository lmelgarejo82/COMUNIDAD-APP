import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { hierarchyService } from '../services/hierarchy';
import { getErrorMessage } from '../services/errors';
import Spinner from '../components/Spinner';
import t from '../theme';

const { colors, radius, shadow, primaryBtn, secondaryBtn, dangerBtn, toast, badge, input, modal, sectionTitle, card } = t;

const initialForm = { name: '', address: '', access_code: '', building_type: 'tower', sort_order: 0, number: 1, unit_code: '', unit_type: '', area_m2: '', coef_percent: '', total_lots: 4 };

export default function AdminEstructura() {
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin === true;
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [modalData, setModalData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try { const { data } = await hierarchyService.getTree(); setTrees(Array.isArray(data) ? data : []); }
    catch (err) { showMsg(getErrorMessage(err, 'Error al cargar estructura'), 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchTree(); }, [fetchTree]);

  function showMsg(text, type = 'success') { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 3000); }
  function toggle(key) { setCollapsed(p => ({ ...p, [key]: !p[key] })); }
  function openModal(type, parent = {}, edit = null) {
    setForm({ ...initialForm, complex_id: parent.complex_id || '', building_id: parent.building_id || '', floor_id: parent.floor_id || '', ...(edit || {}) });
    setModalData({ type, parent, edit });
  }

  async function handleSubmit() {
    try {
      const mt = modalData.type;
      if (mt === 'complex') { if (!form.name) return showMsg('Nombre requerido', 'error'); await hierarchyService.createComplex({ name: form.name, address: form.address, access_code: form.access_code }); }
      else if (mt === 'editComplex') await hierarchyService.updateComplex(modalData.edit.id, { name: form.name, address: form.address });
      else if (mt === 'building') {
        if (!form.name) return showMsg('Nombre requerido', 'error');
        await hierarchyService.createBuilding({
          complex_id: form.complex_id || trees[0]?.id, name: form.name,
          address: form.address, building_type: form.building_type,
          sort_order: parseInt(form.sort_order) || 0,
          total_lots: (form.building_type === 'block' || form.building_type === 'house') ? (parseInt(form.total_lots) || 1) : undefined,
        });
      }
      else if (mt === 'floor') { if (!form.number) return showMsg('Número requerido', 'error'); await hierarchyService.createFloor({ building_id: parseInt(form.building_id), number: parseInt(form.number), name: form.name, sort_order: parseInt(form.sort_order) || 0 }); }
      else if (mt === 'unit') { if (!form.unit_code) return showMsg('Código requerido', 'error'); await hierarchyService.createUnit({ floor_id: parseInt(form.floor_id), unit_code: form.unit_code, unit_type: form.unit_type, area_m2: form.area_m2 ? parseFloat(form.area_m2) : null, coef_percent: form.coef_percent ? parseFloat(form.coef_percent) : null, sort_order: parseInt(form.sort_order) || 0 }); }
      else if (mt === 'editBuilding') await hierarchyService.updateBuilding(modalData.edit.id, { name: form.name, address: form.address, building_type: form.building_type, sort_order: parseInt(form.sort_order) || 0 });
      else if (mt === 'editFloor') await hierarchyService.updateFloor(modalData.edit.id, { number: parseInt(form.number), name: form.name, sort_order: parseInt(form.sort_order) || 0 });
      else if (mt === 'editUnit') await hierarchyService.updateUnit(modalData.edit.id, { unit_code: form.unit_code, unit_type: form.unit_type, area_m2: form.area_m2 ? parseFloat(form.area_m2) : null, coef_percent: form.coef_percent ? parseFloat(form.coef_percent) : null, sort_order: parseInt(form.sort_order) || 0 });
      setModalData(null); showMsg('Guardado correctamente'); fetchTree();
    } catch (err) { showMsg(getErrorMessage(err, 'Error al guardar'), 'error'); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      const { type, id } = confirmDelete;
      if (type === 'complex') await hierarchyService.deleteComplex(id);
      else if (type === 'building') await hierarchyService.deleteBuilding(id);
      else if (type === 'floor') await hierarchyService.deleteFloor(id);
      else if (type === 'unit') await hierarchyService.deleteUnit(id);
      setConfirmDelete(null); showMsg('Eliminado correctamente'); fetchTree();
    } catch (err) { showMsg(getErrorMessage(err, 'Error al eliminar'), 'error'); setConfirmDelete(null); }
  }

  if (loading) return <Spinner />;
  const totalUnits = trees.reduce((sum, t) => sum + (t.buildings || []).reduce((s, b) => s + (b.floors || []).reduce((fs, f) => fs + (f.units || []).length, 0), 0), 0);

  return (
    <div style={t.page}>
      <div style={t.headerBar}>
        <div><h2 style={t.font.title}>Estructura</h2><span style={t.font.subtitle}>{trees.length} complejo{trees.length !== 1 ? 's' : ''} &middot; {totalUnits} unidades</span></div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isSuperAdmin && <button style={primaryBtn} onClick={() => openModal('complex')}>+ Complejo</button>}
        </div>
        {msg && <span style={toast(msgType)}>{msg}</span>}
      </div>

      {trees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', ...card, background: colors.bg }}>
          <p style={{ color: colors.textPrimary, margin: '0 0 0.25rem' }}>No hay complejos configurados.</p>
          <p style={{ fontSize: '0.8rem', color: colors.textSecondary, margin: 0 }}>Ejecutá la migración y el seed para crear la estructura inicial.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {trees.map(tree => {
            const cxKey = `complex-${tree.id}`, cxCollapsed = collapsed[cxKey] === true;
            const cxUnits = (tree.buildings || []).reduce((sum, b) => sum + (b.floors || []).reduce((s, f) => s + (f.units || []).length, 0), 0);
            return (
              <div key={tree.id} style={{ ...card, overflow: 'hidden' }}>
                <div onClick={() => toggle(cxKey)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem', background: t.colors.primaryGradient, color: colors.white, cursor: 'pointer', userSelect: 'none', borderRadius: '10px 10px 0 0' }}>
                  <span style={{ fontSize: '0.6rem', opacity: 0.8, width: '14px', flexShrink: 0 }}>{cxCollapsed ? '\u25B6' : '\u25BC'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{tree.name}</span></div>
                  <span style={badge('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.2)')}>{cxUnits} unid.</span>
                  <button style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.2)', color: colors.white, border: '1px solid rgba(255,255,255,0.3)', padding: '3px 10px', borderRadius: radius.button, cursor: 'pointer', fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); openModal('building', { complex_id: tree.id }); }}>+ Edificio</button>
                  {isSuperAdmin && (
                    <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                      <button style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: colors.white, borderRadius: radius.small, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openModal('editComplex', {}, tree); }}>&#9998;</button>
                      <button style={{ fontSize: '0.72rem', padding: '2px 6px', background: 'rgba(255,0,0,0.3)', border: '1px solid rgba(255,80,80,0.4)', color: colors.white, borderRadius: radius.small, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'complex', id: tree.id }); }}>&#10005;</button>
                    </div>
                  )}
                </div>
                {!cxCollapsed && (
                  <div style={{ padding: '0.5rem 0.75rem 0.75rem' }}>
                    {(tree.buildings || []).map(building => {
                      const bKey = `building-${building.id}`, bCollapsed = collapsed[bKey] === true;
                      const bUnits = (building.floors || []).reduce((sum, f) => sum + (f.units || []).length, 0);
                      return (
                        <div key={building.id} style={{ marginBottom: '0.4rem', ...card, borderRadius: radius.button, overflow: 'hidden' }}>
                          <div onClick={() => toggle(bKey)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', background: colors.bg, cursor: 'pointer', userSelect: 'none', borderBottom: `1px solid ${colors.border}` }}>
                            <span style={{ fontSize: '0.6rem', color: colors.textSecondary, width: '14px', flexShrink: 0 }}>{bCollapsed ? '\u25B6' : '\u25BC'}</span>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: colors.textPrimary }}>{building.name}</span>
                              {building.building_type && <span style={badge(colors.textSecondary, colors.border)}>{building.building_type}</span>}
                              <span style={badge(colors.textSecondary, colors.bg)}>{bUnits} unid.</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                              <button style={{ fontSize: '0.7rem', padding: '2px 7px', background: colors.white, color: colors.primary, border: `1px solid ${colors.border}`, borderRadius: radius.small, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openModal('floor', { building_id: building.id }); }}>+ Piso</button>
                              <button style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }} onClick={(e) => { e.stopPropagation(); openModal('editBuilding', {}, building); }}>&#9998;</button>
                              <button style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }} onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'building', id: building.id }); }}>&#10005;</button>
                            </div>
                          </div>
                          {!bCollapsed && (
                            <div style={{ padding: '0.3rem 0.5rem 0.5rem 1.5rem' }}>
                              {(building.floors || []).map(floor => {
                                const fKey = `floor-${floor.id}`, fCollapsed = collapsed[fKey] === true;
                                return (
                                  <div key={floor.id} style={{ marginBottom: '0.25rem' }}>
                                    <div onClick={() => toggle(fKey)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.5rem', borderRadius: radius.input, cursor: 'pointer', userSelect: 'none', border: `1px dashed ${colors.border}` }}>
                                      <span style={{ fontSize: '0.5rem', color: colors.textDisabled, width: '10px', flexShrink: 0 }}>{fCollapsed ? '\u25B6' : '\u25BC'}</span>
                                      <span style={{ fontWeight: 500, fontSize: '0.8rem', color: colors.textSecondary, flex: 1 }}>{floor.name || `Piso ${floor.number}`}</span>
                                      <span style={badge(colors.textSecondary, colors.bg)}>{(floor.units || []).length} u.</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                        <button style={{ fontSize: '0.7rem', padding: '2px 7px', background: colors.white, color: colors.primary, border: `1px solid ${colors.border}`, borderRadius: radius.small, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openModal('unit', { floor_id: floor.id }); }}>+ Unid.</button>
                                        <button style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }} onClick={(e) => { e.stopPropagation(); openModal('editFloor', {}, floor); }}>&#9998;</button>
                                        <button style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }} onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'floor', id: floor.id }); }}>&#10005;</button>
                                      </div>
                                    </div>
                                    {!fCollapsed && (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.4rem', padding: '0.4rem 0.2rem 0.2rem 1.2rem' }}>
                                        {(floor.units || []).length === 0 ? <span style={{ fontSize: '0.72rem', color: colors.textDisabled, fontStyle: 'italic', gridColumn: '1/-1', padding: '0.3rem 0' }}>Sin unidades</span> : (floor.units || []).map(unit => (
                                          <div key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.55rem', ...card, borderRadius: radius.input, fontSize: '0.78rem' }}>
                                            <span style={{ fontWeight: 700, color: colors.primary, fontSize: '0.82rem' }}>{unit.unit_code}</span>
                                            {unit.area_m2 && <span style={badge(colors.textSecondary, colors.bg)}>{unit.area_m2} m²</span>}
                                            {unit.coef_percent && <span style={badge(colors.textSecondary, colors.bg)}>{unit.coef_percent}%</span>}
                                            <div style={{ display: 'flex', gap: '0.15rem', marginLeft: 'auto' }}>
                                              <button style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }} onClick={(e) => { e.stopPropagation(); openModal('editUnit', {}, unit); }}>&#9998;</button>
                                              <button style={{ fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }} onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'unit', id: unit.id }); }}>&#10005;</button>
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalData && (
        <div style={modal.overlay} onClick={() => setModalData(null)}>
          <div style={modal.box} onClick={(e) => e.stopPropagation()}>
            <h3 style={modal.title}>
              {modalData.type === 'complex' ? 'Nuevo Complejo' : modalData.type === 'editComplex' ? 'Editar Complejo' : modalData.type === 'building' ? 'Nuevo Edificio' : modalData.type === 'editBuilding' ? 'Editar Edificio' : modalData.type === 'floor' ? 'Nuevo Piso' : modalData.type === 'editFloor' ? 'Editar Piso' : modalData.type === 'unit' ? 'Nueva Unidad' : 'Editar Unidad'}
            </h3>
            {(modalData.type === 'complex' || modalData.type === 'editComplex') && <>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Nombre *</label>
              <input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Dirección</label>
              <input style={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              {modalData.type === 'complex' && <>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Código de acceso</label>
                <input style={input} value={form.access_code} onChange={e => setForm({ ...form, access_code: e.target.value })} placeholder="Opcional, se genera automáticamente" />
              </>}
            </>}
            {(modalData.type === 'building' || modalData.type === 'editBuilding') && <>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Nombre *</label>
              <input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Tipo</label>
              <select style={{ ...input, appearance: 'auto' }} value={form.building_type} onChange={e => setForm({ ...form, building_type: e.target.value })}>
                <option value="tower">Torre (con pisos)</option>
                <option value="block">Bloque / Manzana</option>
                <option value="house">Casas</option>
              </select>
              {modalData.type === 'building' && (form.building_type === 'block' || form.building_type === 'house') && <>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Cantidad de {form.building_type === 'house' ? 'casas' : 'lotes'}</label>
                <input style={input} type="number" value={form.total_lots} onChange={e => setForm({ ...form, total_lots: e.target.value })} />
              </>}
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Dirección</label>
              <input style={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Orden</label>
              <input style={input} type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
            </>}
            {(modalData.type === 'floor' || modalData.type === 'editFloor') && <>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Número *</label>
              <input style={input} type="number" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Nombre</label>
              <input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Orden</label>
              <input style={input} type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
            </>}
            {(modalData.type === 'unit' || modalData.type === 'editUnit') && <>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Código *</label>
              <input style={input} value={form.unit_code} onChange={e => setForm({ ...form, unit_code: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Tipo</label>
              <input style={input} value={form.unit_type} onChange={e => setForm({ ...form, unit_type: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Área (m²)</label>
              <input style={input} type="number" value={form.area_m2} onChange={e => setForm({ ...form, area_m2: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Coeficiente (%)</label>
              <input style={input} type="number" value={form.coef_percent} onChange={e => setForm({ ...form, coef_percent: e.target.value })} />
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '3px', marginTop: '0.5rem' }}>Orden</label>
              <input style={input} type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
            </>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button style={secondaryBtn} onClick={() => setModalData(null)}>Cancelar</button>
              <button style={primaryBtn} onClick={handleSubmit}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={modal.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={modal.box} onClick={(e) => e.stopPropagation()}>
            <h3 style={modal.title}>Confirmar eliminación</h3>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: colors.textSecondary }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button style={secondaryBtn} onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button style={dangerBtn} onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
