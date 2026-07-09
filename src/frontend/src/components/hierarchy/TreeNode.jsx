import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import t from '../../theme';

const typeConfig = {
  complex:  { childType: 'building', color: t.colors.primary, bg: t.colors.primarySoft, label: 'Complejo' },
  building: { childType: 'floor',    color: t.colors.secondary, bg: t.colors.secondarySoft, label: 'Edificio' },
  floor:    { childType: 'unit',     color: t.colors.accent, bg: t.colors.accentSoft, label: 'Piso' },
  unit:     { childType: null,       color: '#8E44AD', bg: '#F3E5F5', label: 'Unidad' },
};

function getNodeType(node) {
  if (node.unit_code !== undefined) return 'unit';
  if (node.number !== undefined) return 'floor';
  if (node.building_type !== undefined || node.floors !== undefined) return 'building';
  if (node.buildings !== undefined) return 'complex';
  return 'complex';
}

export default function TreeNode({ node, depth, onEdit, onDelete, onDrop, disabled }) {
  const nodeType = getNodeType(node);
  const config = typeConfig[nodeType];
  const [collapsed, setCollapsed] = useState(false);
  const isComplex = nodeType === 'complex';
  const isUnit = nodeType === 'unit';

  const draggable = useDraggable({
    id: `tree-${nodeType}-${node.id}`,
    data: { source: 'tree', type: nodeType, node },
    disabled: disabled || depth === 0,
  });

  const droppable = useDroppable({
    id: `drop-${nodeType}-${node.id}`,
    data: { type: nodeType, node, accept: config.childType },
    disabled: disabled || isUnit,
  });

  const children = isComplex ? node.buildings : nodeType === 'building' ? node.floors : nodeType === 'floor' ? node.units : null;
  const childCount = children?.length ?? 0;

  const bgStyle = draggable.isDragging
    ? { opacity: 0.4 }
    : droppable.isOver
      ? { background: config.bg, outline: `2px dashed ${config.color}`, outlineOffset: '-2px' }
      : {};

  const icon = isComplex ? '\uD83C\uDFD8' : nodeType === 'building' ? '\uD83C\uDFE2' : nodeType === 'floor' ? '\uD83D\uDCCB' : '\uD83D\uDEAA';
  const label = isComplex ? node.name : nodeType === 'building' ? node.name : nodeType === 'floor' ? (node.name || `Piso ${node.number}`) : node.unit_code;

  const subLabel = nodeType === 'building' && node.building_type
    ? node.building_type : nodeType === 'unit' && node.area_m2
    ? `${node.area_m2}m²` : nodeType === 'unit' && node.coef_percent
    ? `${node.coef_percent}%` : null;

  return (
    <div style={{ marginBottom: '2px' }}>
      <div
        ref={(el) => { draggable.setNodeRef(el); droppable.setNodeRef(el); }}
        {...draggable.listeners}
        {...draggable.attributes}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: isComplex ? '0.55rem 0.6rem' : '0.35rem 0.5rem',
          marginLeft: `${depth * 20}px`,
          borderRadius: t.radius.input,
          border: `1px solid ${t.colors.border}`,
          borderLeft: `3px solid ${config.color}`,
          background: t.colors.white,
          cursor: disabled ? 'default' : draggable.isDragging ? 'grabbing' : 'grab',
          fontSize: isComplex ? '0.9rem' : '0.8rem',
          fontWeight: isComplex ? 700 : 500,
          userSelect: 'none',
          transition: 'background 0.15s, outline 0.15s',
          ...bgStyle,
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(nodeType, node); }}
      >
        {!isUnit && (
          <span
            onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
            style={{ fontSize: '0.5rem', width: '12px', flexShrink: 0, cursor: 'pointer', color: t.colors.textSecondary }}
          >
            {collapsed ? '\u25B6' : '\u25BC'}
          </span>
        )}
        <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {subLabel && (
          <span style={{ fontSize: '0.65rem', color: t.colors.textSecondary, fontWeight: 400, flexShrink: 0 }}>
            {subLabel}
          </span>
        )}
        {childCount > 0 && (
          <span style={{ fontSize: '0.65rem', color: t.colors.textSecondary, background: t.colors.bg, padding: '1px 6px', borderRadius: t.radius.badge, flexShrink: 0 }}>
            {childCount} {isComplex ? 'edif.' : nodeType === 'building' ? 'pisos' : 'unid.'}
          </span>
        )}
        <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button style={btnIcon(t.colors.textSecondary)} onClick={() => onEdit(nodeType, node)} title="Editar">&#9998;</button>
          <button style={btnIcon(t.colors.danger)} onClick={() => onDelete(nodeType, node)} title="Eliminar">&#10005;</button>
        </div>
      </div>
      {!collapsed && !isUnit && children?.map(child => (
        <TreeNode
          key={`${getNodeType(child)}-${child.id}`}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onDrop={onDrop}
          disabled={disabled}
        />
      ))}
      {!collapsed && !isUnit && childCount === 0 && (
        <div style={{ marginLeft: `${(depth + 1) * 20}px`, padding: '0.3rem 0.5rem', fontSize: '0.7rem', color: t.colors.textDisabled, fontStyle: 'italic' }}>
          Soltá {config.childType === 'building' ? 'edificios' : config.childType === 'floor' ? 'pisos' : 'unidades'} aquí
        </div>
      )}
    </div>
  );
}

function btnIcon(color) {
  return {
    fontSize: '0.7rem', padding: '1px 4px',
    background: 'none', border: 'none', cursor: 'pointer',
    color, fontFamily: 'inherit',
  };
}
