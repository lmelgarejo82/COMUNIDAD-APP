import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/errors';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Error al iniciar sesión'));
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Comunidad App</h1>
        {error && <p style={styles.error}>{error}</p>}
        <label style={styles.label}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={styles.input}           placeholder="admin1@comunidad.app" />
        <label style={styles.label}>Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={styles.input} placeholder="admin123" />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
        <p style={styles.link}>
          ¿No tenés cuenta? <Link to="/register">Registrate acá</Link>
        </p>
      </form>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e9ecef' },
  card: { background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  title: { textAlign: 'center', marginBottom: '1rem', fontSize: '1.5rem', color: '#2c3e50' },
  label: { fontSize: '0.875rem', fontWeight: 600, color: '#495057' },
  input: { padding: '0.625rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '1rem' },
  button: { marginTop: '1rem', padding: '0.75rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  error: { background: '#f8d7da', color: '#842029', padding: '0.5rem', borderRadius: '4px', fontSize: '0.875rem' },
  link: { textAlign: 'center', fontSize: '0.875rem', color: '#6c757d', marginTop: '0.5rem' },
};
