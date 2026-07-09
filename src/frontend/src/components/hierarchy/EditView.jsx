import Card from './Card';
import t from '../../theme';

export default function EditView({ tree, onEdit, onDelete, onAddChild, onDoubleClick }) {
  if (!tree) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: t.colors.textSecondary }}>
        <p style={{ fontWeight: 600, color: t.colors.textPrimary, margin: '0 0 0.25rem' }}>No hay estructura seleccionada</p>
        <p style={{ fontSize: '0.8rem', margin: 0 }}>
          Seleccioná un complejo o arrastrá un elemento desde la paleta.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.75rem', flex: 1, overflowY: 'auto' }}>
      <Card
        node={tree}
        depth={0}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddChild={onAddChild}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
