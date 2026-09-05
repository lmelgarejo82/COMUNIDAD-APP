import { useLayoutEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import accountRecovery from '../services/accountRecovery';
import { consumeFragmentToken, subscribeFragmentToken } from '../utils/fragmentToken';
import { INVALID_RESET_LINK, resetPasswordErrorMessage, validateResetPassword } from '../utils/passwordReset';

export default function ResetPassword() {
  const [resetToken, setResetToken] = useState(() => consumeFragmentToken(window));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useLayoutEffect(() => subscribeFragmentToken(window, (token) => {
    setResetToken(token);
    setError('');
  }), [location]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    const validationError = validateResetPassword(resetToken, password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await accountRecovery.reset(resetToken, password);
      setResetToken(null);
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(resetPasswordErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const message = resetToken ? error : INVALID_RESET_LINK;

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Restablecer contraseña</h1>
        {message && <p role="alert" style={styles.error}>{message}</p>}
        <label htmlFor="reset-password" style={styles.label}>Nueva contraseña</label>
        <input
          id="reset-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          style={styles.input}
        />
        <label htmlFor="reset-confirmation" style={styles.label}>Confirmar contraseña</label>
        <input
          id="reset-confirmation"
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          style={styles.input}
        />
        <button type="submit" disabled={loading || !resetToken} style={styles.button}>
          {loading ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
        <p style={styles.link}><Link to="/forgot-password">Solicitar otro enlace</Link></p>
        <p style={styles.link}><Link to="/login">Volver al ingreso</Link></p>
      </form>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: '#e9ecef' },
  card: { background: '#fff', padding: '2rem', boxSizing: 'border-box', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  title: { textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem', color: '#2c3e50' },
  label: { fontSize: '0.875rem', fontWeight: 600, color: '#495057' },
  input: { padding: '0.625rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '1rem' },
  button: { marginTop: '1rem', padding: '0.75rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  error: { background: '#f8d7da', color: '#842029', padding: '0.5rem', borderRadius: '4px', fontSize: '0.875rem', margin: 0 },
  link: { textAlign: 'center', fontSize: '0.875rem', color: '#6c757d', marginTop: '0.5rem', marginBottom: 0 },
};
