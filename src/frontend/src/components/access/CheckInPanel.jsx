import { useState } from 'react';
import t from '../../theme';
import UnitSearchSelect from './UnitSearchSelect';

const initialForm = {
  visitor_name: '',
  visitor_document: '',
  visitor_phone: '',
  vehicle_plate: '',
  visit_type: 'guest',
  destination_label: '',
  authorized_by: '',
  notes: '',
};

export default function CheckInPanel({ open, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(initialForm);
  if (!open) return null;

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    await onSubmit(form);
    setForm(initialForm);
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

        <form onSubmit={submit} style={{ display: 'grid', gap: '0.65rem' }}>
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
          <UnitSearchSelect value={form.destination_label} onChange={(value) => update('destination_label', value)} />
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
            <button type="submit" disabled={saving} style={{ ...t.primaryBtn, opacity: saving ? 0.7 : 1 }}>
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
};
