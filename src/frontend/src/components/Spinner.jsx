export default function Spinner() {
  return (
    <div style={styles.wrapper}>
      <div style={styles.spinner} />
      <p style={styles.text}>Cargando...</p>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem 0',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid #e9ecef',
    borderTop: '3px solid #0d6efd',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  text: {
    marginTop: '0.75rem',
    fontSize: '0.9rem',
    color: '#6c757d',
  },
};
