import t from '../../../theme';
import UnitSearchSelect from '../UnitSearchSelect';
import { preauthInitialForm } from './preauthorizationUtils';

export default function PreauthorizationForm({ form, saving, onChange, onSubmit, onReset }) {
  const update = (field, value) => onChange(prev => ({ ...prev, [field]: value }));

  const handleManualDestination = (value) => {
    onChange(prev => ({ ...prev, unit_id: null, destination_label: value }));
  };

  const handleUnitSelect = (unit) => {
    onChange(prev => ({
      ...prev,
      unit_id: unit.unit_id,
      destination_label: unit.display_path || unit.unit_label,
    }));
  };

  const handleUnitClear = () => {
    onChange(prev => ({ ...prev, unit_id: null, destination_label: '' }));
  };

  return (
    <div style={styles.preauthCreate}>
      <h3 style={styles.subsectionTitle}>Nueva preautorización</h3>
      <div style={styles.preauthForm}>
        <label>
          <span style={t.font.label}>Visitante</span>
          <input value={form.visitor_name} onChange={(e) => update('visitor_name', e.target.value)} placeholder="Nombre y apellido" style={t.input} />
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
            <span style={t.font.label}>Vehículo</span>
            <input value={form.vehicle_plate} onChange={(e) => update('vehicle_plate', e.target.value.toUpperCase())} placeholder="Patente" style={t.input} />
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
          <input value={form.authorized_by} onChange={(e) => update('authorized_by', e.target.value)} placeholder="Residente o administración" style={t.input} />
        </label>
        <div style={styles.twoCols}>
          <label>
            <span style={t.font.label}>Esperada desde</span>
            <input type="datetime-local" value={form.expected_from} onChange={(e) => update('expected_from', e.target.value)} style={t.input} />
          </label>
          <label>
            <span style={t.font.label}>Esperada hasta</span>
            <input type="datetime-local" value={form.expected_until} onChange={(e) => update('expected_until', e.target.value)} style={t.input} />
          </label>
        </div>
        <label>
          <span style={t.font.label}>Notas</span>
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} style={{ ...t.input, resize: 'vertical' }} />
        </label>
        <div style={styles.formActions}>
          <button type="button" onClick={onReset || (() => onChange(preauthInitialForm))} style={t.secondaryBtn}>
            Limpiar
          </button>
          <button type="button" onClick={onSubmit} disabled={saving} style={t.primaryBtn}>
            {saving ? 'Creando...' : 'Crear preautorización'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  subsectionTitle: { margin: 0, fontSize: '0.9rem', fontWeight: 700, color: t.colors.textPrimary },
  preauthCreate: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.75rem', display: 'grid', gap: '0.6rem' },
  preauthForm: { display: 'grid', gap: '0.55rem', alignItems: 'start' },
  twoCols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' },
};
