import { useState, useEffect } from 'react';
import t from '../../theme';

export default function EditModal({ nodeType, node, onSave, onClose }) {
  const isNew = !node?.id;
  const [form, setForm] = useState({
    name: '', address: '', access_code: '',
    building_type: 'tower', sort_order: 0, total_lots: 4,
    number: 1, floorName: '',
    unit_code: '', unit_type: '', area_m2: '', coef_percent: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (node) {
      setForm(f => ({
        ...f,
        name: node.name || '',
        address: node.address || '',
        building_type: node.building_type || 'tower',
        sort_order: node.sort_order || 0,
        total_lots: node.floors?.[0]?.units?.length || 4,
        number: node.number || 1,
        floorName: node.name || '',
        unit_code: node.unit_code || '',
        unit_type: node.unit_type || '',
        area_m2: node.area_m2 ?? '',
        coef_percent: node.coef_percent ?? '',
      }));
    }
  }, [node]);

  const title = isNew
    ? `Nuevo ${nodeType === 'complex' ? 'Complejo' : nodeType === 'building' ? 'Edificio' : nodeType === 'floor' ? 'Piso' : 'Unidad'}`
    : `Editar ${nodeType === 'complex' ? 'Complejo' : nodeType === 'building' ? 'Edificio' : nodeType === 'floor' ? 'Piso' : 'Unidad'}`;

  async function handleSave() {
    setErr('');
    setSaving(true);
    try {
      let data = {};
      if (nodeType === 'complex') data = { name: form.name, address: form.address };
      else if (nodeType === 'building') data = { name: form.name, building_type: form.building_type, sort_order: parseInt(form.sort_order) || 0 };
      else if (nodeType === 'floor') data = { number: parseInt(form.number), name: form.floorName, sort_order: parseInt(form.sort_order) || 0 };
      else if (nodeType === 'unit') data = { unit_code: form.unit_code, unit_type: form.unit_type, area_m2: form.area_m2 ? parseFloat(form.area_m2) : null, coef_percent: form.coef_percent ? parseFloat(form.coef_percent) : null, sort_order: parseInt(form.sort_order) || 0 };
      await onSave(nodeType, data, node, form);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  return (
    <div style={t.modal.overlay} onClick={onClose}>
      <div style={{ ...t.modal.box, maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
        <h3 style={t.modal.title}>{title}</h3>

        {nodeType === 'complex' && <>
          <Field label="Nombre *" value={form.name} onChange={v => set('name', v)} />
          <Field label="Dirección" value={form.address} onChange={v => set('address', v)} />
        </>}

        {nodeType === 'building' && <>
          <Field label="Nombre *" value={form.name} onChange={v => set('name', v)} />
          <div style={fieldGroup}>
            <label style={lbl}>Tipo</label>
            <select style={t.input} value={form.building_type} onChange={e => set('building_type', e.target.value)}>
              <option value="tower">Torre</option>
              <option value="block">Bloque / Manzana</option>
              <option value="house">Casas</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <Field label="Orden" value={form.sort_order} onChange={v => set('sort_order', v)} type="number" />
            </div>
          </div>
        </>}

        {nodeType === 'floor' && <>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <Field label="Número *" value={form.number} onChange={v => set('number', v)} type="number" />
            </div>
            <div style={{ flex: 2 }}>
              <Field label="Nombre" value={form.floorName} onChange={v => set('floorName', v)} />
            </div>
          </div>
          <Field label="Orden" value={form.sort_order} onChange={v => set('sort_order', v)} type="number" />
        </>}

        {nodeType === 'unit' && <>
          <Field label="Código *" value={form.unit_code} onChange={v => set('unit_code', v)} />
          <Field label="Tipo" value={form.unit_type} onChange={v => set('unit_type', v)} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <Field label="Área (m²)" value={form.area_m2} onChange={v => set('area_m2', v)} type="number" />
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Coef. (%)" value={form.coef_percent} onChange={v => set('coef_percent', v)} type="number" />
            </div>
          </div>
          <Field label="Orden" value={form.sort_order} onChange={v => set('sort_order', v)} type="number" />
        </>}

        {err && <div style={{ color: t.colors.danger, fontSize: '0.8rem', marginTop: '0.5rem' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button style={t.secondaryBtn} onClick={onClose} disabled={saving}>Cancelar</button>
          <button style={t.primaryBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div style={fieldGroup}>
      <label style={lbl}>{label}</label>
      <input style={t.input} type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

const fieldGroup = { marginBottom: '0.3rem' };
const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: t.colors.textSecondary, marginBottom: '2px' };
