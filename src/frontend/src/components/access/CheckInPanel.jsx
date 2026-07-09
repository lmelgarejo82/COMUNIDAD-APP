import { useRef, useState } from 'react';
import t from '../../theme';
import { accessPreauthorizationService } from '../../services/accessLogs';
import UnitSearchSelect from './UnitSearchSelect';

const initialForm = {
  visitor_name: '',
  visitor_document: '',
  visitor_phone: '',
  vehicle_plate: '',
  visit_type: 'guest',
  unit_id: null,
  destination_label: '',
  authorized_by: '',
  notes: '',
};

export default function CheckInPanel({ open, onClose, onSubmit, onUsePreauthorization, saving }) {
  const [form, setForm] = useState(initialForm);
  const [mode, setMode] = useState('manual');
  const [preauthQuery, setPreauthQuery] = useState('');
  const [preauthResults, setPreauthResults] = useState([]);
  const [preauthLoading, setPreauthLoading] = useState(false);
  const [preauthError, setPreauthError] = useState('');
  const formRef = useRef(null);
  if (!open) return null;

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const handleManualDestination = (value) => {
    setForm(prev => ({ ...prev, unit_id: null, destination_label: value }));
  };
  const handleUnitSelect = (unit) => {
    setForm(prev => ({
      ...prev,
      unit_id: unit.unit_id,
      destination_label: unit.display_path || unit.unit_label,
    }));
  };
  const handleUnitClear = () => {
    setForm(prev => ({ ...prev, unit_id: null, destination_label: '' }));
  };
  const submit = async () => {
    if (!formRef.current?.reportValidity()) return;
    await onSubmit(form);
    setForm(initialForm);
  };
  const searchPreauthorizations = async () => {
    setPreauthLoading(true);
    setPreauthError('');
    try {
      const { data } = await accessPreauthorizationService.search({ q: preauthQuery, limit: 8 });
      setPreauthResults(data.data || []);
    } catch (err) {
      setPreauthError(err.response?.data?.error || 'No pudimos buscar preautorizaciones.');
    } finally {
      setPreauthLoading(false);
    }
  };
  const usePreauthorization = async (item) => {
    if (!onUsePreauthorization) return;
    await onUsePreauthorization(item);
    setPreauthQuery('');
    setPreauthResults([]);
    setForm(initialForm);
  };
  const preventAccidentalSubmit = (event) => {
    if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
      event.preventDefault();
    }
  };

  return (
    <div style={styles.overlay}>
      <aside style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Registrar ingreso</h2>
            <span style={t.font.subtitle}>Datos mínimos para abrir la visita.</span>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <form ref={formRef} onSubmit={(event) => event.preventDefault()} onKeyDown={preventAccidentalSubmit} style={{ display: 'grid', gap: '0.65rem' }}>
          <div style={styles.modeToggle}>
            <button
              type="button"
              onClick={() => setMode('manual')}
              style={mode === 'manual' ? styles.modeBtnActive : styles.modeBtn}
            >
              Ingreso manual
            </button>
            <button
              type="button"
              onClick={() => setMode('preauthorized')}
              style={mode === 'preauthorized' ? styles.modeBtnActive : styles.modeBtn}
            >
              Buscar preautorización
            </button>
          </div>

          {mode === 'preauthorized' && (
            <section style={styles.preauthBox}>
              <span style={t.font.label}>Preautorizaciones pendientes</span>
              <div style={styles.searchRow}>
                <input
                  value={preauthQuery}
                  onChange={(e) => setPreauthQuery(e.target.value)}
                  placeholder="Nombre, documento, patente o unidad"
                  style={{ ...t.input, marginBottom: 0 }}
                />
                <button type="button" onClick={searchPreauthorizations} disabled={preauthLoading} style={t.secondaryBtn}>
                  {preauthLoading ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              {preauthError && <div style={t.toast('error')}>{preauthError}</div>}
              {!preauthLoading && preauthResults.length === 0 && (
                <div style={styles.emptyHint}>No hay preautorizaciones pendientes para esa búsqueda.</div>
              )}
              {preauthResults.map(item => (
                <div key={item.id} style={styles.preauthItem}>
                  <div>
                    <strong>{item.visitor_name}</strong>
                    <span style={styles.itemMeta}>
                      {item.destination_label || item.unit_code || 'Destino sin unidad'} · {item.visit_type}
                    </span>
                    <span style={styles.itemMeta}>
                      {item.expected_from ? new Date(item.expected_from).toLocaleString('es-AR') : 'Sin horario definido'}
                      {item.authorized_by ? ` · Autorizado por ${item.authorized_by}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => usePreauthorization(item)}
                    disabled={saving}
                    style={t.primaryBtn}
                  >
                    Usar preautorización
                  </button>
                </div>
              ))}
            </section>
          )}

          <label>
            <span style={t.font.label}>Nombre del visitante</span>
            <input value={form.visitor_name} onChange={(e) => update('visitor_name', e.target.value)} required style={t.input} />
          </label>
          <div style={styles.twoCols}>
            <label>
              <span style={t.font.label}>Documento</span>
              <input value={form.visitor_document} onChange={(e) => update('visitor_document', e.target.value)} style={t.input} />
            </label>
            <label>
              <span style={t.font.label}>Teléfono</span>
              <input value={form.visitor_phone} onChange={(e) => update('visitor_phone', e.target.value)} style={t.input} />
            </label>
          </div>
          <div style={styles.twoCols}>
            <label>
              <span style={t.font.label}>Tipo</span>
              <select value={form.visit_type} onChange={(e) => update('visit_type', e.target.value)} style={t.input}>
                <option value="guest">Visita</option>
                <option value="delivery">Entrega</option>
                <option value="service">Servicio</option>
                <option value="provider">Proveedor</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label>
              <span style={t.font.label}>Patente</span>
              <input value={form.vehicle_plate} onChange={(e) => update('vehicle_plate', e.target.value.toUpperCase())} style={t.input} />
            </label>
          </div>
          <UnitSearchSelect
            value={form.destination_label}
            selectedUnitId={form.unit_id}
            onManualChange={handleManualDestination}
            onSelect={handleUnitSelect}
            onClear={handleUnitClear}
          />
          <label>
            <span style={t.font.label}>Autorizado por</span>
            <input value={form.authorized_by} onChange={(e) => update('authorized_by', e.target.value)} placeholder="Residente, operador o administración" style={t.input} />
          </label>
          <label>
            <span style={t.font.label}>Notas</span>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={4} style={{ ...t.input, resize: 'vertical' }} />
          </label>
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={t.secondaryBtn}>Cancelar</button>
            <button type="button" onClick={submit} disabled={saving} style={{ ...t.primaryBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Registrando...' : 'Confirmar ingreso'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,59,94,0.18)', zIndex: 180, display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 'min(460px, 100%)', height: '100%', background: t.colors.white, padding: '1.2rem', boxShadow: t.shadow.modal, overflowY: 'auto', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  title: { ...t.font.title, margin: 0 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: t.colors.textSecondary },
  twoCols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', marginTop: '0.5rem', flexWrap: 'wrap' },
  modeToggle: { display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${t.colors.border}`, borderRadius: t.radius.button, overflow: 'hidden' },
  modeBtn: { border: 'none', background: t.colors.white, color: t.colors.textSecondary, padding: '0.5rem', cursor: 'pointer', fontWeight: 600 },
  modeBtnActive: { border: 'none', background: t.colors.primarySoft, color: t.colors.primary, padding: '0.5rem', cursor: 'pointer', fontWeight: 700 },
  preauthBox: { ...t.card, padding: '0.75rem', display: 'grid', gap: '0.55rem' },
  searchRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.45rem', alignItems: 'start' },
  preauthItem: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.55rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.55rem', alignItems: 'center' },
  itemMeta: { display: 'block', fontSize: '0.75rem', color: t.colors.textSecondary, marginTop: '2px' },
  emptyHint: { fontSize: '0.78rem', color: t.colors.textSecondary, padding: '0.35rem 0' },
};
