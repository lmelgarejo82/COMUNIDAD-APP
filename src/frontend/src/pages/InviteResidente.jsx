import { useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errors';
import UnitSearchSelect from '../components/access/UnitSearchSelect';

export default function InviteResidente() {
  const [form, setForm] = useState({ email: '', unit_id: null, unit_number: '', ownership_type: 'owner' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.unit_id) {
      setMsg('Seleccioná una unidad del sistema.');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      await api.post('/admin/invite', {
        email: form.email,
        unit_id: form.unit_id,
        ownership_type: form.ownership_type,
      });
      setMsg(`Invitación enviada a ${form.email}. El residente recibirá un email con el enlace de registro.`);
      setForm({ email: '', unit_id: null, unit_number: '', ownership_type: 'owner' });
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al enviar invitación'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>
      <h2 style={s.heading}>Invitar residente</h2>
      <form onSubmit={handleSubmit} style={s.form}>
        {msg && <p style={s.msg}>{msg}</p>}
        <label style={s.label}>Email del residente</label>
        <input name="email" type="email" value={form.email} onChange={handleChange} required style={s.input} placeholder="vecino@email.com" />
        <UnitSearchSelect
          value={form.unit_number}
          selectedUnitId={form.unit_id}
          allowManual={false}
          label="Unidad"
          placeholder="Buscar y seleccionar una unidad"
          onManualChange={(unit_number) => setForm(current => ({ ...current, unit_number, unit_id: null }))}
          onSelect={(unit) => setForm(current => ({ ...current, unit_id: unit.unit_id, unit_number: unit.unit_label }))}
          onClear={() => setForm(current => ({ ...current, unit_id: null, unit_number: '' }))}
        />
        <label style={{ ...s.label, marginTop: '0.75rem' }}>Tipo de ocupación</label>
        <select name="ownership_type" value={form.ownership_type} onChange={handleChange} required style={s.input}>
          <option value="owner">Propietario</option>
          <option value="tenant">Inquilino</option>
        </select>
        <button type="submit" disabled={loading} style={s.btn}>
          {loading ? 'Enviando...' : 'Enviar invitación'}
        </button>
      </form>
    </div>
  );
}

const s = {
  container: { padding: '1.5rem', maxWidth: '500px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  form: { background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.75rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.25rem' },
  input: { padding: '0.6rem', border: '1px solid #ced4da', borderRadius: '4px', width: '100%', fontSize: '0.95rem', marginBottom: '0.75rem', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '0.75rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem', minHeight: '48px' },
};
