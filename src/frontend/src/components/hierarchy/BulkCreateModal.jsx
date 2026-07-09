import { useState } from 'react';
import t from '../../theme';

const flex1 = { flex: 1 };
const fg = { marginBottom: '0.4rem' };
const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: t.colors.textSecondary, marginBottom: '2px' };
const summaryStyle = { fontSize: '0.75rem', color: t.colors.primary, margin: '0.4rem 0 0', fontWeight: 600 };

export default function BulkCreateModal({ parentType, parentNode, onSave, onClose }) {
  const [buildingType, setBuildingType] = useState('tower');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [floorPrefix, setFloorPrefix] = useState('Piso');
  const [floorCount, setFloorCount] = useState(3);
  const [unitsPerFloor, setUnitsPerFloor] = useState(4);
  const [totalLots, setTotalLots] = useState(6);
  const [areaM2, setAreaM2] = useState('');
  const [coefPercent, setCoefPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const isAutoFloor = (buildingType === 'block' || buildingType === 'house');

  function generateUnitCode(floorNum, unitNum) {
    let code = '';
    if (prefix) code += prefix;
    if (floorCount > 1) code += `P${floorNum}`;
    code += `U${unitNum}`;
    return code;
  }

  async function handleSave() {
    setErr('');
    if (!name && parentType === 'complex') { setErr('Nombre requerido'); return; }
    setSaving(true);
    try {
      const building = { name: name || parentNode.name, building_type: buildingType, sort_order: 0 };
      let payload;

      if (parentType === 'complex') {
        if (isAutoFloor) {
          payload = { complex_id: parentNode.id, building, total_lots: parseInt(totalLots) || 1 };
        } else {
          const floors = [];
          const fc = parseInt(floorCount) || 1;
          const upf = parseInt(unitsPerFloor) || 1;
          for (let f = 1; f <= fc; f++) {
            const units = [];
            for (let u = 1; u <= upf; u++) {
              units.push({
                unit_code: generateUnitCode(f, u),
                sort_order: u,
                area_m2: areaM2 ? parseFloat(areaM2) : null,
                coef_percent: coefPercent ? parseFloat(coefPercent) : null,
              });
            }
            floors.push({
              number: f,
              name: `${floorPrefix} ${f}`,
              sort_order: f,
              units,
            });
          }
          payload = { complex_id: parentNode.id, building, floors };
        }
      } else if (parentType === 'building') {
        const units = [];
        const upf = parseInt(unitsPerFloor) || 1;
        for (let u = 1; u <= upf; u++) {
          units.push({
            unit_code: (prefix ? `${prefix}U${u}` : `U${u}`),
            sort_order: u,
            area_m2: areaM2 ? parseFloat(areaM2) : null,
            coef_percent: coefPercent ? parseFloat(coefPercent) : null,
          });
        }
        payload = {
          complex_id: parentNode.complex_id || undefined,
          building: { name: parentNode.name, building_type: parentNode.building_type, sort_order: parentNode.sort_order },
          floors: [{
            number: parseInt(floorCount) || 1,
            name: `${floorPrefix} ${floorCount}`,
            sort_order: parseInt(floorCount),
            units,
          }],
        };
      } else if (parentType === 'floor') {
        const units = [];
        const upf = parseInt(unitsPerFloor) || 1;
        for (let u = 1; u <= upf; u++) {
          units.push({
            unit_code: (prefix ? `${prefix}U${u}` : `U${u}`),
            sort_order: u,
            area_m2: areaM2 ? parseFloat(areaM2) : null,
            coef_percent: coefPercent ? parseFloat(coefPercent) : null,
          });
        }
        payload = units;
      }

      await onSave(payload);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  const totalUnits = parentType === 'complex' && !isAutoFloor
    ? (parseInt(floorCount) || 0) * (parseInt(unitsPerFloor) || 0)
    : parentType === 'complex' && isAutoFloor
    ? parseInt(totalLots) || 0
    : parseInt(unitsPerFloor) || 0;

  return (
    <div style={t.modal.overlay} onClick={onClose}>
      <div style={{ ...t.modal.box, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <h3 style={t.modal.title}>Creacin Rpida</h3>

        {parentType === 'complex' && <>
          <div style={fg}>
            <label style={lbl}>Nombre del edificio *</label>
            <input style={t.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Torre C" autoFocus />
          </div>
          <div style={fg}>
            <label style={lbl}>Tipo de edificio</label>
            <select style={t.input} value={buildingType} onChange={e => setBuildingType(e.target.value)}>
              <option value="tower">Torre (con pisos)</option>
              <option value="block">Bloque / Manzana</option>
              <option value="house">Casas</option>
            </select>
          </div>

          {!isAutoFloor ? (
            <>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={flex1}>
                  <label style={lbl}>Cant. pisos</label>
                  <input style={t.input} type="number" min="1" max="50" value={floorCount} onChange={e => setFloorCount(e.target.value)} />
                </div>
                <div style={flex1}>
                  <label style={lbl}>Unid. por piso</label>
                  <input style={t.input} type="number" min="1" max="100" value={unitsPerFloor} onChange={e => setUnitsPerFloor(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={flex1}>
                  <label style={lbl}>Prefijo (opc.)</label>
                  <input style={t.input} value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Ej: A-" />
                </div>
                <div style={flex1}>
                  <label style={lbl}>Nombre pisos</label>
                  <input style={t.input} value={floorPrefix} onChange={e => setFloorPrefix(e.target.value)} placeholder="Piso" />
                </div>
              </div>
              <p style={summaryStyle}>
                Total: {totalUnits} unidades en {parseInt(floorCount) || 0} pisos
              </p>
            </>
          ) : (
            <>
              <div style={fg}>
                <label style={lbl}>Cantidad de {buildingType === 'house' ? 'casas' : 'lotes'}</label>
                <input style={t.input} type="number" min="1" max="200" value={totalLots} onChange={e => setTotalLots(e.target.value)} />
              </div>
              <p style={{ fontSize: '0.75rem', color: t.colors.textSecondary, margin: '0.25rem 0', fontStyle: 'italic' }}>
                Se crear un piso automtico "Planta Baja" con {totalLots} {buildingType === 'house' ? 'casas' : 'lotes'}
              </p>
            </>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <div style={flex1}>
              <label style={lbl}>rea (m) por unid.</label>
              <input style={t.input} type="number" value={areaM2} onChange={e => setAreaM2(e.target.value)} placeholder="Opcional" />
            </div>
            <div style={flex1}>
              <label style={lbl}>Coef. (%)</label>
              <input style={t.input} type="number" value={coefPercent} onChange={e => setCoefPercent(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
        </>}

        {parentType === 'building' && <>
          <p style={{ fontSize: '0.85rem', color: t.colors.textSecondary, margin: '0 0 0.5rem' }}>
            Agregar piso a <strong>{parentNode.name}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={flex1}>
              <label style={lbl}>N de piso</label>
              <input style={t.input} type="number" min="1" max="100" value={floorCount} onChange={e => setFloorCount(e.target.value)} />
            </div>
            <div style={flex1}>
              <label style={lbl}>Nombre</label>
              <input style={t.input} value={floorPrefix} onChange={e => setFloorPrefix(e.target.value)} placeholder="Piso" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={flex1}>
              <label style={lbl}>Unidades</label>
              <input style={t.input} type="number" min="1" max="100" value={unitsPerFloor} onChange={e => setUnitsPerFloor(e.target.value)} />
            </div>
            <div style={flex1}>
              <label style={lbl}>Prefijo</label>
              <input style={t.input} value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Ej: A-" />
            </div>
          </div>
          <p style={summaryStyle}>Total: {totalUnits} unidades</p>
        </>}

        {parentType === 'floor' && <>
          <p style={{ fontSize: '0.85rem', color: t.colors.textSecondary, margin: '0 0 0.5rem' }}>
            Agregar unidades a <strong>{parentNode.name || `Piso ${parentNode.number}`}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={flex1}>
              <label style={lbl}>Cant. de unidades</label>
              <input style={t.input} type="number" min="1" max="100" value={unitsPerFloor} onChange={e => setUnitsPerFloor(e.target.value)} autoFocus />
            </div>
            <div style={flex1}>
              <label style={lbl}>Prefijo</label>
              <input style={t.input} value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Ej: A-" />
            </div>
          </div>
        </>}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <div style={flex1}>
            <label style={lbl}>rea (m) por unid.</label>
            <input style={t.input} type="number" value={areaM2} onChange={e => setAreaM2(e.target.value)} placeholder="Opcional" />
          </div>
          <div style={flex1}>
            <label style={lbl}>Coef. (%)</label>
            <input style={t.input} type="number" value={coefPercent} onChange={e => setCoefPercent(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        {err && <div style={{ color: t.colors.danger, fontSize: '0.8rem', marginTop: '0.5rem' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button style={t.secondaryBtn} onClick={onClose} disabled={saving}>Cancelar</button>
          <button style={t.primaryBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}
