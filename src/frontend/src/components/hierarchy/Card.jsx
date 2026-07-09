import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import t from '../../theme';

const typeConfig = {
  complex:  { childKey: 'buildings', childType: 'building', color: t.colors.primary, bg: t.colors.primarySoft, icon: '\uD83C\uDFD8', labelPlural: 'edificios' },
  building: { childKey: 'floors',    childType: 'floor',    color: t.colors.secondary, bg: t.colors.secondarySoft, icon: '\uD83C\uDFE2', labelPlural: 'pisos' },
  floor:    { childKey: 'units',     childType: 'unit',     color: t.colors.accent, bg: t.colors.accentSoft, icon: '\uD83D\uDCCB', labelPlural: 'unidades' },
  unit:     { childKey: null,        childType: null,       color: '#8E44AD', bg: '#F3E5F5', icon: '\uD83C\uDFE0', labelPlural: null },
};

export function getNodeType(node) {
  if (node.unit_code !== undefined) return 'unit';
  if (node.number !== undefined) return 'floor';
  if (node.building_type !== undefined || node.floors !== undefined) return 'building';
  if (node.buildings !== undefined) return 'complex';
  return 'complex';
}

function formatBuildingType(type) {
  const map = { tower: 'Torre', block: 'Bloque', house: 'Casa', edificio: 'Edificio' };
  return map[type] || type;
}

function formatUnitMeta(node) {
  const parts = [];
  if (node.area_m2) parts.push(`${node.area_m2}m\u00B2`);
  if (node.coef_percent) parts.push(`${node.coef_percent}%`);
  if (node.unit_type) parts.push(node.unit_type);
  return parts.length > 0 ? parts.join(' \u00B7 ') : null;
}

export default function Card({ node, depth, onEdit, onDelete, onAddChild, onDoubleClick }) {
  const nodeType = getNodeType(node);
  const config = typeConfig[nodeType];
  const isComplex = nodeType === 'complex';
  const isUnit = nodeType === 'unit';
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);

  const draggable = useDraggable({
    id: `card-${nodeType}-${node.id}`,
    data: { source: 'tree', type: nodeType, node },
    disabled: depth === 0,
  });

  const droppable = useDroppable({
    id: `drop-${nodeType}-${node.id}`,
    data: { type: nodeType, node, accept: config.childType },
    disabled: isUnit || !onAddChild,
  });

  const children = config.childKey ? node[config.childKey] : null;
  const childCount = children?.length ?? 0;

  const label = isComplex ? node.name
    : nodeType === 'building' ? node.name
    : nodeType === 'floor' ? (node.name || `Piso ${node.number}`)
    : node.unit_code;

  const subLabel = nodeType === 'building' && node.building_type
    ? formatBuildingType(node.building_type)
    : nodeType === 'unit'
    ? formatUnitMeta(node)
    : null;

  const isDragging = draggable.isDragging;
  const isOver = droppable.isOver;

  const cardStyle = {
    position: 'relative',
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: isComplex ? '0.65rem 0.85rem' : '0.5rem 0.75rem',
    background: isDragging ? t.colors.bg : t.colors.white,
    border: `1px solid ${isOver ? config.color : t.colors.border}`,
    borderLeft: `4px solid ${config.color}`,
    borderRadius: t.radius.button,
    cursor: depth === 0 ? 'default' : isDragging ? 'grabbing' : 'grab',
    fontSize: isComplex ? '0.9rem' : '0.82rem',
    fontWeight: isComplex ? 700 : 600,
    userSelect: 'none',
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isOver
      ? `0 0 0 2px ${config.color}40, 0 2px 8px rgba(0,0,0,0.1)`
      : isDragging ? t.shadow.elevated : 'none',
    transform: draggable.transform
      ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`
      : undefined,
    zIndex: isDragging ? 999 : 1,
    transition: isDragging ? 'none' : 'box-shadow 0.15s, border-color 0.15s, opacity 0.15s',
    minWidth: '200px',
    maxWidth: depth > 0 ? '320px' : undefined,
  };

  const hasActions = onEdit || onDelete || onAddChild;

  return (
    <div style={{ marginBottom: depth === 0 ? 0 : '4px' }}>
      <div
        ref={(el) => {
          draggable.setNodeRef(el);
          droppable.setNodeRef(el);
        }}
        {...draggable.listeners}
        {...draggable.attributes}
        style={cardStyle}
        onDoubleClick={(e) => { e.stopPropagation(); if (onDoubleClick) onDoubleClick(nodeType, node); else if (onEdit) onEdit(nodeType, node); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {!isUnit && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{ fontSize: '0.55rem', width: '12px', flexShrink: 0, cursor: 'pointer', color: t.colors.textSecondary, userSelect: 'none' }}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        )}
        {isUnit && <span style={{ width: '12px', flexShrink: 0 }} />}

        <span style={{ fontSize: isComplex ? '1.15rem' : '1rem', flexShrink: 0, lineHeight: 1 }}>{config.icon}</span>

        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>

        {subLabel && <span style={badgeSmall(config.color, config.bg)}>{subLabel}</span>}

        {childCount > 0 && (
          <span style={badgeSmall(t.colors.textSecondary, t.colors.bg)}>
            {childCount}
          </span>
        )}

        {hasActions && (
          <div style={{ display: 'flex', gap: '0.1rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {onEdit && (
              <button style={actionBtn(t.colors.textSecondary, hovered)} onClick={() => onEdit(nodeType, node)} title="Editar">&#9998;</button>
            )}
            {!isUnit && onAddChild && (
              <button style={actionBtn(t.colors.secondary, hovered)} onClick={() => onAddChild(nodeType, node)} title="Agregar hijo">+</button>
            )}
            {onDelete && (
              <button style={actionBtn(t.colors.danger, hovered)} onClick={() => onDelete(nodeType, node)} title="Eliminar">&#10005;</button>
            )}
          </div>
        )}
      </div>

      {!isUnit && expanded && (
        <div style={{
          marginLeft: depth === 0 ? '0.5rem' : '1.5rem',
          marginTop: '4px',
          padding: childCount > 0 ? '0.6rem' : '0.4rem 0.6rem',
          background: childCount > 0 ? t.colors.bg : 'transparent',
          borderLeft: childCount > 0 ? `3px solid ${config.color}` : 'none',
          borderRadius: `0 ${t.radius.card} ${t.radius.card} 0`,
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          alignItems: 'flex-start',
        }}>
          {children?.map(child => (
            <Card
              key={`${getNodeType(child)}-${child.id}`}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onDoubleClick={onDoubleClick}
            />
          ))}
          {childCount === 0 && config.childType && (
            <span style={{ fontSize: '0.7rem', color: t.colors.textDisabled, fontStyle: 'italic', padding: '0.15rem 0' }}>
              Soltar {config.labelPlural} aquí
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function actionBtn(color, hovered) {
  return {
    fontSize: '0.7rem', padding: '2px 5px',
    background: 'none', border: 'none', cursor: 'pointer',
    color, borderRadius: '4px', fontFamily: 'inherit',
    opacity: hovered ? 1 : 0,
    transition: 'opacity 0.15s',
  };
}

function badgeSmall(color, bg) {
  return {
    fontSize: '0.63rem', fontWeight: 500, color, background: bg,
    padding: '1px 7px', borderRadius: '10px', flexShrink: 0, lineHeight: '1.4',
  };
}
