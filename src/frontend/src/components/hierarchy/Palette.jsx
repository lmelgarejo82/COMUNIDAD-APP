import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import t from '../../theme';

const paletteItems = [
  { type: 'complex',   label: 'Complejo', icon: '\uD83C\uDFD8',  color: t.colors.primary },
  { type: 'building',  label: 'Edificio', icon: '\uD83C\uDFE2',  color: t.colors.secondary },
  { type: 'floor',     label: 'Piso',     icon: '\uD83D\uDCCB',  color: t.colors.accent },
  { type: 'unit',      label: 'Unidad',   icon: '\uD83C\uDFE0',  color: '#8E44AD' },
];

const validTargets = {
  complex: 'Se suelta sobre otro complejo (solo desde paleta)',
  building: 'Se suelta sobre un complejo',
  floor: 'Se suelta sobre un edificio',
  unit: 'Se suelta sobre un piso',
};

function PaletteItem({ item, collapsed }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { source: 'palette', type: item.type },
  });

  const style = {
    display: 'flex', alignItems: 'center', gap: collapsed ? '0' : '0.5rem',
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '0.5rem' : '0.6rem 0.75rem',
    background: isDragging ? item.color : t.colors.white,
    color: isDragging ? t.colors.white : t.colors.textPrimary,
    border: `1px solid ${t.colors.border}`,
    borderLeft: collapsed ? `3px solid ${item.color}` : `4px solid ${item.color}`,
    borderRadius: t.radius.button,
    cursor: 'grab',
    fontSize: '0.82rem',
    fontWeight: 600,
    userSelect: 'none',
    boxShadow: isDragging ? t.shadow.elevated : 'none',
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 999 : 1,
    transition: isDragging ? 'none' : 'box-shadow 0.15s, background 0.15s',
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      title={validTargets[item.type]}
    >
      <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </div>
  );
}

export default function Palette() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      width: collapsed ? '48px' : '180px',
      flexShrink: 0,
      background: t.colors.white,
      borderRight: `1px solid ${t.colors.border}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 0.75rem',
        borderBottom: `1px solid ${t.colors.border}`,
      }}>
        {!collapsed && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: t.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Paleta
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.colors.textSecondary, fontSize: '0.85rem', padding: '0',
            fontFamily: 'inherit',
          }}
          title={collapsed ? 'Expandir paleta' : 'Colapsar paleta'}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>

      <div style={{
        padding: collapsed ? '0.4rem 0' : '0.75rem',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
        alignItems: collapsed ? 'center' : 'stretch',
        flex: 1, overflowY: 'auto',
      }}>
        {paletteItems.map(item => (
          <PaletteItem key={item.type} item={item} collapsed={collapsed} />
        ))}
      </div>

      {!collapsed && (
        <div style={{
          marginTop: 'auto', padding: '0.5rem 0.75rem',
          borderTop: `1px solid ${t.colors.border}`,
          fontSize: '0.62rem', color: t.colors.textDisabled, lineHeight: 1.5,
        }}>
          Arrastrá elementos al canvas. Soltá sobre un nodo compatible para crear.
        </div>
      )}
    </div>
  );
}
