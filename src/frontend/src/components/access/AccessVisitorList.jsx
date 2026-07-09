import t from '../../theme';
import AccessVisitorCard from './AccessVisitorCard';

export default function AccessVisitorList({ visits, loading, error, onSelect }) {
  if (loading) {
    return (
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {[1, 2, 3].map(i => <div key={i} style={{ ...t.card, height: '92px', background: '#F1F3F5' }} />)}
      </div>
    );
  }

  if (error) {
    return <div style={{ ...t.card, padding: '1rem', color: t.colors.danger }}>{error}</div>;
  }

  if (!visits?.length) {
    return (
      <div style={{ ...t.card, padding: '1.6rem', textAlign: 'center', color: t.colors.textSecondary }}>
        No hay visitas para mostrar.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      {visits.map(visit => <AccessVisitorCard key={visit.id} visit={visit} onSelect={onSelect} />)}
    </div>
  );
}
