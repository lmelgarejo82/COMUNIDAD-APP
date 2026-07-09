import { useMemo, useState } from 'react';

function getCommunityLabel(complex) {
  return complex.community_name || complex.communityName || complex.group_name || 'Comunidad';
}

function getOrganizationLabel(complex) {
  return complex.organization_name || complex.organizationName || 'Organización';
}

function getComplexType(complex) {
  if (complex.type && complex.type !== 'complex') return complex.type;
  return 'Complejo';
}

function groupComplexes(complexes) {
  const map = new Map();
  for (const complex of complexes || []) {
    const orgKey = String(complex.organization_id || complex.organization_name || complex.community_id || 'legacy-org');
    const communityKey = String(complex.community_id || complex.community_name || 'legacy-community');

    if (!map.has(orgKey)) {
      map.set(orgKey, { key: orgKey, name: getOrganizationLabel(complex), communities: new Map(), total: 0 });
    }

    const org = map.get(orgKey);
    if (!org.communities.has(communityKey)) {
      org.communities.set(communityKey, {
        key: communityKey,
        name: getCommunityLabel(complex),
        items: [],
      });
    }
    org.communities.get(communityKey).items.push(complex);
    org.total += 1;
  }
  return Array.from(map.values()).map(group => ({
    ...group,
    communities: Array.from(group.communities.values()),
  }));
}

export default function ScopeSelector({
  complexes,
  selectedId,
  onChange,
  variant = 'dark',
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = (complexes || []).find(c => c.id === selectedId);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? (complexes || []).filter(c => {
          const text = `${getOrganizationLabel(c)} ${getCommunityLabel(c)} ${c.name} ${c.address || ''}`.toLowerCase();
          return text.includes(q);
        })
      : complexes || [];
    return groupComplexes(filtered);
  }, [complexes, query]);

  if (!complexes || complexes.length === 0) return null;

  const isDark = variant === 'dark';
  const organizationLabel = selected ? getOrganizationLabel(selected) : 'Organización';
  const communityLabel = selected ? getCommunityLabel(selected) : 'Alcance';
  const complexLabel = selected?.name || 'Seleccionar complejo';

  function selectComplex(id) {
    onChange(parseInt(id, 10));
    setOpen(false);
    setQuery('');
  }

  return (
    <div style={{ ...styles.wrap, minWidth: compact ? '100%' : 260 }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        style={{
          ...styles.trigger,
          ...(isDark ? styles.triggerDark : styles.triggerLight),
          width: compact ? '100%' : undefined,
        }}
        title={`${organizationLabel} > ${communityLabel} > ${complexLabel}`}
      >
        <span style={styles.icon}>&#127970;</span>
        <span style={styles.textBlock}>
          <span style={{ ...styles.label, color: isDark ? 'rgba(255,255,255,0.72)' : '#6C757D' }}>
            Alcance operativo
          </span>
          <span style={{ ...styles.value, color: isDark ? '#FFFFFF' : '#212529' }}>
            {organizationLabel} &gt; {communityLabel} &gt; {complexLabel}
          </span>
        </span>
        <span style={{ ...styles.chevron, color: isDark ? '#FFFFFF' : '#6C757D' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={styles.dropdown}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar organización, comunidad o complejo"
            autoFocus
            style={styles.search}
          />
          <div style={styles.list}>
            {groups.length === 0 ? (
              <div style={styles.empty}>Sin resultados</div>
            ) : groups.map(group => (
              <div key={group.key} style={styles.group}>
                <div style={styles.groupTitle}>
                  <span>{group.name}</span>
                  <span style={styles.count}>{group.total}</span>
                </div>
                {group.communities.map(community => (
                  <div key={community.key} style={styles.communityBlock}>
                    <div style={styles.communityTitle}>{community.name}</div>
                    {community.items.map(complex => (
                      <button
                        key={complex.id}
                        type="button"
                        onClick={() => selectComplex(complex.id)}
                        style={{
                          ...styles.option,
                          ...(complex.id === selectedId ? styles.optionActive : null),
                        }}
                      >
                        <span style={styles.optionName}>{complex.name}</span>
                        <span style={styles.optionMeta}>
                          {getComplexType(complex)}
                          {complex.address ? ` · ${complex.address}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative', fontFamily: 'inherit' },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    borderRadius: '8px',
    border: '1px solid',
    padding: '0.35rem 0.55rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  triggerDark: {
    background: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  triggerLight: {
    background: '#FFFFFF',
    borderColor: '#E9ECEF',
  },
  icon: { fontSize: '0.95rem', flexShrink: 0 },
  textBlock: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 },
  label: { fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' },
  value: { fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  chevron: { fontSize: '0.58rem', flexShrink: 0 },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: 'min(380px, calc(100vw - 24px))',
    maxHeight: '420px',
    background: '#FFFFFF',
    border: '1px solid #E9ECEF',
    borderRadius: '10px',
    boxShadow: '0 12px 34px rgba(0,0,0,0.2)',
    zIndex: 200,
    overflow: 'hidden',
  },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    border: 'none',
    borderBottom: '1px solid #E9ECEF',
    padding: '0.65rem 0.75rem',
    fontSize: '0.85rem',
    outline: 'none',
    fontFamily: 'inherit',
  },
  list: { maxHeight: '350px', overflowY: 'auto', padding: '0.35rem' },
  empty: { padding: '1rem', textAlign: 'center', color: '#6C757D', fontSize: '0.82rem' },
  group: { marginBottom: '0.35rem' },
  groupTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.35rem 0.45rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#6C757D',
    textTransform: 'uppercase',
  },
  count: {
    background: '#E9ECEF',
    borderRadius: '10px',
    padding: '1px 7px',
    color: '#6C757D',
  },
  communityBlock: { marginBottom: '0.25rem' },
  communityTitle: {
    padding: '0.2rem 0.55rem',
    fontSize: '0.72rem',
    color: '#0F3B5E',
    fontWeight: 700,
  },
  option: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    padding: '0.5rem 0.55rem',
    border: 'none',
    borderRadius: '7px',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  optionActive: { background: '#D6EAF8' },
  optionName: { fontSize: '0.86rem', fontWeight: 700, color: '#212529' },
  optionMeta: { fontSize: '0.72rem', color: '#6C757D' },
};
