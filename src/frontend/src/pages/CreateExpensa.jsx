import { useState, useRef } from 'react';
import { expenseService } from '../services/expensas';
import { getErrorMessage } from '../services/errors';

export default function CreateExpensa({ onCreated }) {
  const [form, setForm] = useState({
    description: '', fixedAmount: '', extraAmount: '', due_date: '', period: '',
  });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const fileRef = useRef(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const { data } = await expenseService.create(form);
      const createdId = data.expense.id;
      if (fileRef.current?.files?.[0]) {
        await expenseService.uploadFile(createdId, fileRef.current.files[0]);
      }
      setMsg(
        `Expensa creada. ${data.units_count} unidades · ` +
        `Fijo: $${data.fixed_per_unit} + Extra: $${data.extra_per_unit} = $${data.total_per_unit} c/u.`
      );
      setForm({ description: '', fixedAmount: '', extraAmount: '', due_date: '', period: '' });
      if (fileRef.current) fileRef.current.value = '';
      if (onCreated) onCreated();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al crear'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.wrapper}>
      <button style={s.toggleBtn} onClick={() => setShow(!show)}>
        {show ? 'Cancelar' : '+ Nueva expensa'}
      </button>

      {show && (
        <form onSubmit={handleSubmit} style={s.form}>
          <h3 style={s.title}>Nueva expensa</h3>
          {msg && <p style={s.msg}>{msg}</p>}

          <label style={s.label}>Descripción</label>
          <input name="description" value={form.description} onChange={handleChange} required style={s.input} placeholder="Expensa común julio" />

          <div style={s.row}>
            <div style={s.col}>
              <label style={s.label}>Monto Fijo (Gastos Generales)</label>
              <input name="fixedAmount" type="number" step="0.01" min="0" value={form.fixedAmount} onChange={handleChange} style={s.input} placeholder="10000" />
            </div>
            <div style={s.col}>
              <label style={s.label}>Monto Extraordinario (Obras/Reparaciones)</label>
              <input name="extraAmount" type="number" step="0.01" min="0" value={form.extraAmount} onChange={handleChange} style={s.input} placeholder="5000" />
            </div>
          </div>

          {form.fixedAmount || form.extraAmount ? (
            <p style={s.totalPreview}>
              Total: ${((parseFloat(form.fixedAmount) || 0) + (parseFloat(form.extraAmount) || 0)).toLocaleString()}
            </p>
          ) : null}

          <div style={s.row}>
            <div style={s.col}>
              <label style={s.label}>Vencimiento</label>
              <input name="due_date" type="date" value={form.due_date} onChange={handleChange} required style={s.input} />
            </div>
            <div style={s.col}>
              <label style={s.label}>Período</label>
              <input name="period" value={form.period} onChange={handleChange} style={s.input} placeholder="2024-07" />
            </div>
          </div>

          <label style={s.label}>Factura (PDF/imagen, opcional)</label>
          <input type="file" ref={fileRef} accept=".pdf,.jpg,.jpeg,.png" style={s.input} />

          <button type="submit" disabled={loading} style={s.submitBtn}>
            {loading ? 'Creando...' : 'Crear expensa'}
          </button>
        </form>
      )}
    </div>
  );
}

const s = {
  wrapper: { marginBottom: '1rem' },
  toggleBtn: {
    padding: '0.7rem 1.35rem', background: '#0d6efd', color: '#fff',
    border: 'none', borderRadius: '6px', fontSize: '0.95rem', cursor: 'pointer', minHeight: '44px',
  },
  form: {
    background: '#fff', padding: '1.25rem', borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginTop: '0.75rem',
  },
  title: { marginBottom: '0.75rem', color: '#2c3e50' },
  msg: {
    background: '#d1e7dd', color: '#0f5132', padding: '0.4rem 0.6rem',
    borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.75rem',
  },
  totalPreview: {
    background: '#e9ecef', padding: '0.5rem', borderRadius: '4px',
    fontSize: '0.95rem', fontWeight: 600, color: '#2c3e50',
    marginBottom: '0.75rem', textAlign: 'center',
  },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.2rem' },
  input: { padding: '0.5rem', border: '1px solid #ced4da', borderRadius: '4px', width: '100%', fontSize: '0.9rem', marginBottom: '0.75rem' },
  row: { display: 'flex', gap: '0.75rem' },
  col: { flex: 1 },
  submitBtn: {
    width: '100%', padding: '0.7rem', background: '#198754', color: '#fff',
    border: 'none', borderRadius: '4px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
  },
};
