import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { getErrorMessage } from '../services/errors';

export default function Register() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');
  const [form, setForm] = useState({
    email: '', password: '', access_code: '', unit_number: '', inviteToken: inviteToken || '', user_type: 'owner',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { ...form };
      if (inviteToken) body.inviteToken = inviteToken;
      if (!inviteToken) delete body.inviteToken;
      const { data } = await api.post('/auth/register', body);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    } catch (err) {
      setError(getErrorMessage(err, 'Error al registrarse'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>
          {inviteToken ? 'Completá tu registro' : 'Crear cuenta'}
        </h1>

        {inviteToken && (
          <p style={styles.info}>Fuiste invitado. Completá tus datos para ingresar.</p>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <label style={styles.label}>Tipo de usuario</label>
        <select name="user_type" value={form.user_type} onChange={handleChange} style={{ ...styles.input, padding: '0.65rem' }}>
          <option value="owner">Propietario</option>
          <option value="tenant">Inquilino</option>
        </select>

        <label style={styles.label}>Email</label>
        <input type="email" name="email" value={form.email} onChange={handleChange} required style={styles.input} />

        <label style={styles.label}>Contraseña</label>
        <input type="password" name="password" value={form.password} onChange={handleChange} required minLength={6} style={styles.input} />

        {inviteToken && (
          <>
            <label style={styles.label}>N° de unidad</label>
            <input type="text" name="unit_number" value={form.unit_number} onChange={handleChange} style={styles.input} placeholder="Asignado por invitación" />
          </>
        )}

        {!inviteToken && (
          <>
            <label style={styles.label}>Código de acceso</label>
            <input type="text" name="access_code" value={form.access_code} onChange={handleChange} required style={styles.input} placeholder="DEMO2024" />
            <label style={styles.label}>N° de unidad (opcional)</label>
            <input type="text" name="unit_number" value={form.unit_number} onChange={handleChange} style={styles.input} placeholder="1A" />
          </>
        )}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Registrando...' : 'Registrarse'}
        </button>

        <p style={styles.link}>
          ¿Ya tenés cuenta? <Link to="/login">Ingresá acá</Link>
        </p>
      </form>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e9ecef' },
  card: { background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  title: { textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem', color: '#2c3e50' },
  info: { background: '#cfe2ff', color: '#084298', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem' },
  label: { fontSize: '0.875rem', fontWeight: 600, color: '#495057' },
  input: { padding: '0.625rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '1rem' },
  button: { marginTop: '1rem', padding: '0.75rem', background: '#198754', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  error: { background: '#f8d7da', color: '#842029', padding: '0.5rem', borderRadius: '4px', fontSize: '0.875rem' },
  link: { textAlign: 'center', fontSize: '0.875rem', color: '#6c757d', marginTop: '0.5rem' },
};
