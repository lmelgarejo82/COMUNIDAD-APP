import { useState } from 'react';
import { Link } from 'react-router-dom';
import accountRecovery from '../services/accountRecovery';
import { getErrorMessage } from '../services/errors';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await accountRecovery.request(email);
      setMessage(data.message);
      setError('');
    } catch (err) {
      setMessage('');
      setError(getErrorMessage(err, 'No pudimos procesar la solicitud. Intentá nuevamente.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Recuperar contraseña</h1>
        <p style={styles.info}>Ingresá tu email y te enviaremos instrucciones si corresponde.</p>
        {message && <p style={styles.success}>{message}</p>}
        {error && <p style={styles.error}>{error}</p>}
        <label htmlFor="recovery-email" style={styles.label}>Email</label>
        <input
          id="recovery-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          style={styles.input}
          placeholder="tuemail@comunidad.app"
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Enviando...' : 'Enviar instrucciones'}
        </button>
        <p style={styles.link}><Link to="/login">Volver al ingreso</Link></p>
      </form>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: '#e9ecef' },
  card: { background: '#fff', padding: '2rem', boxSizing: 'border-box', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  title: { textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem', color: '#2c3e50' },
  info: { background: '#cfe2ff', color: '#084298', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', margin: 0 },
  label: { fontSize: '0.875rem', fontWeight: 600, color: '#495057' },
  input: { padding: '0.625rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '1rem' },
  button: { marginTop: '1rem', padding: '0.75rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  success: { background: '#d1e7dd', color: '#0f5132', padding: '0.5rem', borderRadius: '4px', fontSize: '0.875rem', margin: 0 },
  error: { background: '#f8d7da', color: '#842029', padding: '0.5rem', borderRadius: '4px', fontSize: '0.875rem', margin: 0 },
  link: { textAlign: 'center', fontSize: '0.875rem', color: '#6c757d', marginTop: '0.5rem', marginBottom: 0 },
};
