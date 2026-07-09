import Card from './Card';
import t from '../../theme';

export default function CardView({ tree, onEdit, onDelete, onAddChild }) {
  if (!tree) {
    return (
      <div style={{
        textAlign: 'center', padding: '3rem 1rem', color: t.colors.textSecondary,
      }}>
        <p style={{ color: t.colors.textPrimary, fontWeight: 600, margin: '0 0 0.25rem' }}>
          No hay complejo seleccionado
        </p>
        <p style={{ fontSize: '0.8rem', color: t.colors.textSecondary, margin: 0 }}>
          Seleccioná un complejo del menú superior o arrastrá un elemento desde la paleta.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '0.75rem',
      overflowY: 'auto',
      flex: 1,
    }}>
      <Card
        node={tree}
        depth={0}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddChild={onAddChild}
      />
    </div>
  );
}
