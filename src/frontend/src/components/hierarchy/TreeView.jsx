import { useState } from 'react';
import { getNodeType } from './Card';
import t from '../../theme';

const cn = {
  complex:  { childKey: 'buildings', color: t.colors.primary, bg: t.colors.primarySoft, icon: '\uD83C\uDFD8', labelPlural: 'edificios' },
  building: { childKey: 'floors',    color: t.colors.secondary, bg: t.colors.secondarySoft, icon: '\uD83C\uDFE2', labelPlural: 'pisos' },
  floor:    { childKey: 'units',     color: t.colors.accent, bg: t.colors.accentSoft, icon: '\uD83D\uDCCB', labelPlural: 'unidades' },
  unit:     { childKey: null,        color: '#8E44AD', bg: '#F3E5F5', icon: '\uD83C\uDFE0', labelPlural: null },
};

function NodeRow({ node, depth, onEdit, onDelete, onDoubleClick }) {
  const nodeType = getNodeType(node);
  const cfg = cn[nodeType];
  const isUnit = nodeType === 'unit';
  const isComplex = nodeType === 'complex';
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const children = cfg.childKey ? node[cfg.childKey] : null;
  const childCount = children?.length ?? 0;

  const label = isComplex ? node.name
    : nodeType === 'building' ? node.name
    : nodeType === 'floor' ? (node.name || `Piso ${node.number}`)
    : node.unit_code;

  const meta = nodeType === 'building' && node.building_type
    ? node.building_type
    : nodeType === 'unit' && node.area_m2
    ? `${node.area_m2}m\u00B2`
    : nodeType === 'unit' && node.coef_percent
    ? `${node.coef_percent}%`
    : null;

  return (
    <div style={{ marginBottom: '2px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: isComplex ? '0.5rem 0.65rem' : '0.3rem 0.5rem',
          marginLeft: `${depth * 22}px`,
          borderRadius: t.radius.input,
          border: `1px solid ${t.colors.border}`,
          borderLeft: `3px solid ${cfg.color}`,
          background: t.colors.white,
          fontSize: isComplex ? '0.9rem' : '0.8rem',
          fontWeight: isComplex ? 700 : 500,
          userSelect: 'none',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(nodeType, node); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {!isUnit && (
          <span onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
            style={{ fontSize: '0.55rem', width: '12px', flexShrink: 0, cursor: 'pointer', color: t.colors.textSecondary }}>
            {collapsed ? '\u25B6' : '\u25BC'}
          </span>
        )}
        {isUnit && <span style={{ width: '12px', flexShrink: 0 }} />}

        <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{cfg.icon}</span>

        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>

        {meta && <span style={{ fontSize: '0.65rem', color: t.colors.textSecondary, fontWeight: 400, flexShrink: 0, marginRight: '0.25rem' }}>{meta}</span>}

        {childCount > 0 && (
          <span style={{ fontSize: '0.63rem', color: t.colors.textSecondary, background: t.colors.bg, padding: '1px 6px', borderRadius: '10px', flexShrink: 0, marginRight: '0.25rem' }}>
            {childCount}
          </span>
        )}

        <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <button style={actBtn(t.colors.textSecondary, hovered)} onClick={() => onEdit(nodeType, node)} title="Editar">&#9998;</button>
          )}
          {onDelete && (
            <button style={actBtn(t.colors.danger, hovered)} onClick={() => onDelete(nodeType, node)} title="Eliminar">&#10005;</button>
          )}
        </div>
      </div>

      {!collapsed && !isUnit && children?.map(child => (
        <NodeRow key={`${getNodeType(child)}-${child.id}`} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} onDoubleClick={onDoubleClick} />
      ))}
      {!collapsed && !isUnit && childCount === 0 && (
        <div style={{ marginLeft: `${(depth + 1) * 22}px`, padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: t.colors.textDisabled, fontStyle: 'italic' }}>
          Sin {cfg.labelPlural}
        </div>
      )}
    </div>
  );
}

function actBtn(color, hovered) {
  return {
    fontSize: '0.7rem', padding: '1px 4px', background: 'none', border: 'none',
    cursor: 'pointer', color, fontFamily: 'inherit', borderRadius: '4px',
    opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
  };
}

export default function TreeView({ tree, onEdit, onDelete, onDoubleClick }) {
  if (!tree) {
    return <div style={{ textAlign: 'center', padding: '3rem 1rem', color: t.colors.textSecondary }}>
      <p style={{ fontWeight: 600, color: t.colors.textPrimary, margin: '0 0 0.25rem' }}>No hay estructura seleccionada</p>
      <p style={{ fontSize: '0.8rem', margin: 0 }}>Seleccioná un complejo para ver su estructura.</p>
    </div>;
  }

  return (
    <div style={{ padding: '0.5rem 0.75rem', flex: 1, overflowY: 'auto' }}>
      <NodeRow node={tree} depth={0} onEdit={onEdit} onDelete={onDelete} onDoubleClick={onDoubleClick} />
    </div>
  );
}
