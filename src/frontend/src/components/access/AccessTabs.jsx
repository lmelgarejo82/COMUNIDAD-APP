import t from '../../theme';

const tabs = [
  { id: 'inside', label: 'Dentro' },
  { id: 'observed', label: 'Observados y demorados' },
  { id: 'history', label: 'Historial' },
];

export default function AccessTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            ...(active === tab.id ? t.primaryBtn : t.secondaryBtn),
            padding: '0.45rem 0.85rem',
            fontSize: '0.8rem',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
