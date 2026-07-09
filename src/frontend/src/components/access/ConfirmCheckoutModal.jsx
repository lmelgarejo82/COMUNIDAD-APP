import t from '../../theme';

export default function ConfirmCheckoutModal({ visit, onCancel, onConfirm, saving }) {
  if (!visit) return null;

  return (
    <div style={t.modal.overlay}>
      <div style={t.modal.box}>
        <h2 style={t.modal.title}>Confirmar salida</h2>
        <p style={{ color: t.colors.textSecondary, fontSize: '0.88rem', lineHeight: 1.45 }}>
          Vas a registrar la salida de <strong>{visit.visitor_name}</strong>. Esta acción es idempotente:
          si la salida ya existe, no se duplica.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} style={t.secondaryBtn}>Volver</button>
          <button type="button" onClick={() => onConfirm(visit)} disabled={saving} style={{ ...t.primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Registrando...' : 'Confirmar salida'}
          </button>
        </div>
      </div>
    </div>
  );
}
