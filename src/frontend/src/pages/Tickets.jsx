import { useEffect, useMemo, useState } from 'react';
import { ticketService } from '../services/comunicacion';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import t from '../theme';

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Mantenimiento', hint: 'Agua, ascensor, portón, luces o reparaciones.' },
  { value: 'cleaning', label: 'Limpieza', hint: 'Pasillos, residuos y áreas comunes.' },
  { value: 'security', label: 'Seguridad', hint: 'Accesos, cerraduras o situaciones de riesgo.' },
  { value: 'coexistence', label: 'Convivencia', hint: 'Ruido, mascotas o molestias entre vecinos.' },
  { value: 'administration', label: 'Expensas/Administración', hint: 'Consultas administrativas sin tocar pagos.' },
  { value: 'amenities', label: 'Amenities', hint: 'SUM, pileta, parrillas o espacios comunes.' },
  { value: 'other', label: 'Otro', hint: 'Situaciones no contempladas.' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja', hint: 'Puede esperar', color: t.colors.textSecondary, bg: t.colors.border },
  { value: 'medium', label: 'Media', hint: 'Requiere seguimiento', color: t.colors.accent, bg: t.colors.accentSoft },
  { value: 'high', label: 'Alta', hint: 'Afecta la operación', color: t.colors.danger, bg: t.colors.dangerSoft },
  { value: 'urgent', label: 'Urgente', hint: 'Atención inmediata', color: t.colors.dangerHover, bg: '#FCE3E0', glow: true },
];

const STATUS_OPTIONS = [
  { value: 'sent', label: 'Abierto', color: t.colors.info, bg: t.colors.primarySoft },
  { value: 'in_review', label: 'En revisión', color: t.colors.info, bg: '#E3F4F7' },
  { value: 'in_progress', label: 'En proceso', color: t.colors.accentHover, bg: t.colors.accentSoft },
  { value: 'resolved', label: 'Resuelto', color: t.colors.success, bg: t.colors.successSoft },
  { value: 'closed', label: 'Cerrado', color: t.colors.textSecondary, bg: t.colors.border },
  { value: 'cancelled', label: 'Cancelado', color: t.colors.danger, bg: t.colors.dangerSoft },
];

const TAB_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'mine', label: 'Míos' },
  { value: 'unassigned', label: 'Sin asignar', disabled: true, reason: 'Pendiente de asignación real' },
  { value: 'overdue', label: 'Vencidos', disabled: true, reason: 'Pendiente de SLA real' },
];

const KPI_FILTERS = {
  sent: { field: 'status', value: 'sent', label: 'Abiertos' },
  in_review: { field: 'status', value: 'in_review', label: 'En revisión' },
  in_progress: { field: 'status', value: 'in_progress', label: 'En proceso' },
  resolved: { field: 'status', value: 'resolved', label: 'Resueltos' },
  urgent: { field: 'priority', value: 'urgent', label: 'Urgentes' },
};

const initialForm = {
  category: 'maintenance',
  priority: 'medium',
  title: '',
  description: '',
  location_label: '',
};

const initialFilters = {
  category: '',
  priority: '',
  query: '',
  date: '',
  unit: '',
};

function getOption(options, value) {
  return options.find(opt => opt.value === value) || options[0];
}

function optionLabel(options, value) {
  return options.find(opt => opt.value === value)?.label || value || '-';
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function isActiveStatus(status) {
  return ['sent', 'in_review', 'in_progress'].includes(status);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchesSearch(ticket, filters) {
  const query = normalize(filters.query);
  const unit = normalize(filters.unit);
  const haystack = normalize(`${ticket.title} ${ticket.description} ${ticket.unit_number} ${ticket.location_label} ${ticket.user_email}`);
  if (query && !haystack.includes(query)) return false;
  if (unit && !normalize(ticket.unit_number).includes(unit)) return false;
  if (filters.date === 'today') {
    const created = new Date(ticket.created_at);
    const now = new Date();
    return created.toDateString() === now.toDateString();
  }
  return true;
}

function TicketStatusChip({ status }) {
  const opt = getOption(STATUS_OPTIONS, status);
  return <span style={chipStyle(opt)}>{opt.label}</span>;
}

function TicketPriorityChip({ priority }) {
  const opt = getOption(PRIORITY_OPTIONS, priority);
  return <span style={chipStyle(opt)}>{opt.label}</span>;
}

function TicketCategoryChip({ category }) {
  return <span style={styles.categoryChip}>{optionLabel(CATEGORY_OPTIONS, category)}</span>;
}

function chipStyle(opt) {
  return {
    ...t.badge(opt.color, opt.bg),
    border: opt.glow ? `1px solid ${t.colors.danger}` : '1px solid transparent',
    boxShadow: opt.glow ? '0 0 0 2px rgba(231,76,60,0.08)' : 'none',
  };
}

function TicketKpiCard({ label, value, hint, color, active, onClick }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} style={{ ...styles.kpiCard, ...(active ? styles.kpiCardActive(color) : {}), borderTopColor: color }}>
      <span style={styles.kpiLabel}>
        {label}
        {active && <span style={styles.kpiActiveMark}>Activo</span>}
      </span>
      <strong style={styles.kpiValue}>{value}</strong>
      <span style={styles.kpiHint}>{hint}</span>
    </button>
  );
}

function TicketTabs({ active, onChange, isAdmin, counts }) {
  const visibleTabs = isAdmin ? TAB_OPTIONS : TAB_OPTIONS.filter(tab => ['all', 'mine'].includes(tab.value));
  return (
    <div style={styles.tabs}>
      {visibleTabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          disabled={tab.disabled}
          title={tab.reason || ''}
          onClick={() => !tab.disabled && onChange(tab.value)}
          style={tab.disabled ? styles.tabDisabled : active === tab.value ? styles.tabActive : styles.tab}
        >
          {tab.label}
          <span style={styles.tabCount}>{tab.disabled ? 0 : counts[tab.value] || 0}</span>
        </button>
      ))}
    </div>
  );
}

function TicketFilters({ filters, onChange, onClear, compact }) {
  return (
    <section style={compact ? styles.filterBarCompact : styles.filterBar}>
      <div style={styles.searchWrap}>
        <span style={styles.searchIcon}>⌕</span>
        <input
          value={filters.query}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder="Buscar por título, descripción o unidad..."
          style={styles.searchInput}
        />
      </div>
      <select value={filters.date} onChange={(e) => onChange('date', e.target.value)} style={t.input}>
        <option value="">Cualquier fecha</option>
        <option value="today">Hoy</option>
      </select>
      <select value={filters.category} onChange={(e) => onChange('category', e.target.value)} style={t.input}>
        <option value="">Categoría</option>
        {CATEGORY_OPTIONS.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
      </select>
      <select value={filters.priority} onChange={(e) => onChange('priority', e.target.value)} style={t.input}>
        <option value="">Prioridad</option>
        {PRIORITY_OPTIONS.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
      </select>
      <input value={filters.unit} onChange={(e) => onChange('unit', e.target.value)} placeholder="Unidad" style={t.input} />
      <button type="button" onClick={onClear} style={t.secondaryBtn}>Limpiar</button>
    </section>
  );
}

function ActiveFilterSummary({ quickFilter, filters, activeTab, onClearQuick, onClearField, onClearAll }) {
  const chips = [];
  if (quickFilter) chips.push({ key: 'quick', label: `Filtro rápido: ${quickFilter.label}`, onClear: onClearQuick });
  if (activeTab !== 'all') chips.push({ key: 'tab', label: `Vista: ${optionLabel(TAB_OPTIONS, activeTab)}`, onClear: () => onClearField('tab') });
  if (filters.query) chips.push({ key: 'query', label: `Búsqueda: ${filters.query}`, onClear: () => onClearField('query') });
  if (filters.date === 'today') chips.push({ key: 'date', label: 'Hoy', onClear: () => onClearField('date') });
  if (filters.category) chips.push({ key: 'category', label: optionLabel(CATEGORY_OPTIONS, filters.category), onClear: () => onClearField('category') });
  if (filters.priority) chips.push({ key: 'priority', label: `Prioridad: ${optionLabel(PRIORITY_OPTIONS, filters.priority)}`, onClear: () => onClearField('priority') });
  if (filters.unit) chips.push({ key: 'unit', label: `Unidad: ${filters.unit}`, onClear: () => onClearField('unit') });
  if (!chips.length) return null;

  return (
    <div style={styles.activeFilters}>
      <span style={styles.activeFiltersLabel}>Filtros activos</span>
      {chips.map(chip => (
        <button key={chip.key} type="button" onClick={chip.onClear} style={styles.filterChip}>
          {chip.label} ×
        </button>
      ))}
      <button type="button" onClick={onClearAll} style={styles.clearInlineBtn}>Limpiar todo</button>
    </div>
  );
}

function TicketCreatePanel({ form, saving, onChange, onCancel, onSubmit, reporterLabel }) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <aside style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <PanelHeader title="Crear ticket" subtitle={`${reporterLabel} · Reportado por vos`} onClose={onCancel} />
        <form onSubmit={onSubmit} style={styles.panelBody}>
          <section style={styles.panelSection}>
            <h3 style={styles.panelSectionTitle}>¿Qué está pasando?</h3>
            <div style={styles.pillGrid}>
              {CATEGORY_OPTIONS.map(category => (
                <button key={category.value} type="button" onClick={() => onChange('category', category.value)} style={form.category === category.value ? styles.choiceActive : styles.choice}>
                  <strong>{category.label}</strong>
                  <span>{category.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section style={styles.panelSection}>
            <h3 style={styles.panelSectionTitle}>¿Qué tan urgente es?</h3>
            <div style={styles.priorityGrid}>
              {PRIORITY_OPTIONS.map(priority => (
                <button key={priority.value} type="button" onClick={() => onChange('priority', priority.value)} style={form.priority === priority.value ? styles.priorityActive(priority) : styles.priorityChoice}>
                  <strong>{priority.label}</strong>
                  <span>{priority.hint}</span>
                </button>
              ))}
            </div>
            <p style={styles.hint}>Seleccioná la prioridad según el impacto en la comunidad. Los urgentes notifican al admin inmediatamente.</p>
          </section>

          <section style={styles.panelSection}>
            <h3 style={styles.panelSectionTitle}>Detalles</h3>
            <label>
              <span style={t.font.label}>Título obligatorio</span>
              <input value={form.title} onChange={(e) => onChange('title', e.target.value)} placeholder="Ej: pérdida de agua en pasillo del piso 2" required style={t.input} />
            </label>
            <label>
              <span style={t.font.label}>Descripción obligatoria</span>
              <textarea value={form.description} onChange={(e) => onChange('description', e.target.value)} placeholder="Describí el problema, cuándo comenzó y a qué área afecta." required rows={5} style={{ ...t.input, resize: 'vertical' }} />
            </label>
            <label>
              <span style={t.font.label}>Ubicación / área afectada opcional</span>
              <input value={form.location_label} onChange={(e) => onChange('location_label', e.target.value)} placeholder="Ej: cochera, hall, SUM, piso 2" style={t.input} />
            </label>
            <div style={styles.readonlyField}>
              <span>Unidad asociada</span>
              <strong>Tu unidad registrada</strong>
            </div>
          </section>

          <div style={styles.panelActions}>
            <button type="button" onClick={onCancel} style={t.secondaryBtn}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...t.primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? 'Enviando...' : 'Enviar ticket'}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function TicketDetailPanel({ ticket, isAdmin, saving, replyMsg, onReplyMsg, onReply, onStatusChange, onClose }) {
  const timeline = buildTimeline(ticket);
  return (
    <div style={styles.overlay} onClick={onClose}>
      <aside style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <PanelHeader
          title={`Ticket #${ticket.id}`}
          subtitle={`Creado ${formatDate(ticket.created_at)} · Por ${ticket.user_email || 'residente'}, ${ticket.unit_number || 'sin unidad'}`}
          onClose={onClose}
        />
        <div style={styles.panelBody}>
          <div style={styles.chipRow}>
            <TicketCategoryChip category={ticket.category} />
            <TicketPriorityChip priority={ticket.priority} />
            <TicketStatusChip status={ticket.status} />
          </div>

          <section style={styles.detailBlock}>
            <h3 style={styles.detailTitle}>{ticket.title}</h3>
            <p style={styles.detailDescription}>{ticket.description || 'Sin descripción'}</p>
            <div style={styles.detailGrid}>
              <span style={styles.detailField}><strong>Ubicación</strong>{ticket.location_label || '-'}</span>
              <span style={styles.detailField}><strong>Unidad</strong>{ticket.unit_number || '-'}</span>
              <span style={styles.detailField}><strong>Actualizado</strong>{formatDate(ticket.updated_at)}</span>
            </div>
          </section>

          {isAdmin && (
            <section style={styles.detailBlock}>
              <h3 style={styles.panelSectionTitle}>Gestión admin</h3>
              <div style={styles.statusActions}>
                {STATUS_OPTIONS.map(status => (
                  <button key={status.value} type="button" onClick={() => onStatusChange(ticket.id, status.value)} disabled={saving} style={ticket.status === status.value ? t.primaryBtn : t.secondaryBtn}>
                    {status.label}
                  </button>
                ))}
              </div>
              <label style={styles.inlineCheck}>
                <input type="checkbox" disabled />
                Notificar al residente
              </label>
              <span style={styles.hint}>La notificación queda preparada visualmente; no se envía nada automático en este bloque.</span>
            </section>
          )}

          <section style={styles.detailBlock}>
            <h3 style={styles.panelSectionTitle}>Historial</h3>
            <TicketTimeline items={timeline} replies={ticket.replies || []} />
          </section>

          <section style={styles.detailBlock}>
            <h3 style={styles.panelSectionTitle}>{isAdmin ? 'Agregar nota / actualización' : 'Agregar respuesta'}</h3>
            <form onSubmit={onReply} style={styles.replyForm}>
              <textarea value={replyMsg} onChange={(e) => onReplyMsg(e.target.value)} placeholder={isAdmin ? 'Escribí una actualización para el residente...' : 'Escribí una respuesta para administración...'} rows={3} style={{ ...t.input, resize: 'vertical' }} />
              <button type="submit" disabled={saving || !replyMsg.trim()} style={t.primaryBtn}>{isAdmin ? 'Agregar nota' : 'Responder'}</button>
            </form>
          </section>
        </div>
      </aside>
    </div>
  );
}

function PanelHeader({ title, subtitle, onClose }) {
  return (
    <header style={styles.panelHeader}>
      <div>
        <h2 style={styles.panelTitle}>{title}</h2>
        <span style={t.font.subtitle}>{subtitle}</span>
      </div>
      <button type="button" onClick={onClose} style={styles.closeBtn}>×</button>
    </header>
  );
}

function TicketTimeline({ items, replies }) {
  return (
    <div style={styles.timeline}>
      {items.map(item => (
        <div key={item.id} style={styles.timelineItem}>
          <span style={styles.timelineDot} />
          <div>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        </div>
      ))}
      {replies.map(reply => (
        <div key={`reply-${reply.id}`} style={styles.timelineItem}>
          <span style={{ ...styles.timelineDot, background: reply.is_admin ? t.colors.primary : t.colors.secondary }} />
          <div>
            <strong>{reply.is_admin ? 'Administración agregó una nota' : 'Residente respondió'}</strong>
            <p style={styles.timelineText}>{reply.message}</p>
            <span>{formatDate(reply.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TicketCard({ ticket, isAdmin, onSelect, compact = false }) {
  return (
    <button type="button" style={styles.ticketCard} onClick={() => onSelect(ticket)}>
      <div style={compact ? styles.ticketMainCompact : styles.ticketMain}>
        <div>
          <div style={compact ? styles.ticketTitleRowCompact : styles.ticketTitleRow}>
            <strong style={styles.ticketTitle}>{ticket.title}</strong>
            <TicketStatusChip status={ticket.status} />
          </div>
          <p style={styles.ticketDescription}>{ticket.description || 'Sin descripción'}</p>
          <div style={styles.ticketMeta}>
            <span>{ticket.unit_number || 'Sin unidad'}</span>
            {ticket.location_label && <span>{ticket.location_label}</span>}
            {isAdmin && ticket.user_email && <span>{ticket.user_email}</span>}
          </div>
        </div>
        <div style={compact ? styles.ticketAsideCompact : styles.ticketAside}>
          <TicketPriorityChip priority={ticket.priority} />
          <TicketCategoryChip category={ticket.category} />
          <span style={styles.meta}>Actualizado {formatDate(ticket.updated_at)}</span>
        </div>
      </div>
    </button>
  );
}

function TicketTable({ tickets, isAdmin, onSelect }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Ticket</th>
            <th style={styles.th}>Unidad</th>
            <th style={styles.th}>Categoria</th>
            <th style={styles.th}>Prioridad</th>
            <th style={styles.th}>Estado</th>
            <th style={styles.th}>Actualizado</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => (
            <tr key={ticket.id} style={styles.tr} onClick={() => onSelect(ticket)}>
              <td style={styles.td}>
                <strong>{ticket.title}</strong>
                <span style={styles.meta}>{isAdmin && ticket.user_email ? ticket.user_email : ticket.location_label || 'Sin ubicación'}</span>
              </td>
              <td style={styles.td}>{ticket.unit_number || '-'}</td>
              <td style={styles.td}><TicketCategoryChip category={ticket.category} /></td>
              <td style={styles.td}><TicketPriorityChip priority={ticket.priority} /></td>
              <td style={styles.td}><TicketStatusChip status={ticket.status} /></td>
              <td style={styles.td}>{formatDate(ticket.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ type, isAdmin, onCreate }) {
  const copy = {
    loading: ['Cargando tickets', 'Estamos preparando la bandeja.'],
    error: ['No pudimos cargar los tickets', 'Reintentá en unos segundos.'],
    empty: isAdmin
      ? ['No hay tickets para mostrar', 'Cuando los residentes reporten incidencias, aparecerán acá.']
      : ['Todavía no tenés tickets', 'Creá un ticket cuando necesites reportar una incidencia.'],
    search: ['Sin resultados', 'Probá ajustar la búsqueda o limpiar los filtros.'],
  }[type];
  return (
    <div style={styles.emptyState}>
      <strong>{copy[0]}</strong>
      <span>{copy[1]}</span>
      {!isAdmin && type === 'empty' && <button type="button" onClick={onCreate} style={t.primaryBtn}>Nuevo ticket</button>}
    </div>
  );
}

function buildTimeline(ticket) {
  const items = [
    { id: 'created', label: 'Ticket creado', detail: formatDate(ticket.created_at) },
  ];
  if (ticket.status && ticket.status !== 'sent') {
    items.push({ id: 'status', label: `Estado actual: ${optionLabel(STATUS_OPTIONS, ticket.status)}`, detail: formatDate(ticket.updated_at) });
  }
  return items;
}

function computeTicketKpis(baseTickets) {
  return {
    opened: baseTickets.filter(ticket => ticket.status === 'sent').length,
    review: baseTickets.filter(ticket => ticket.status === 'in_review').length,
    progress: baseTickets.filter(ticket => ticket.status === 'in_progress').length,
    resolved: baseTickets.filter(ticket => ticket.status === 'resolved').length,
    urgent: baseTickets.filter(ticket => ticket.priority === 'urgent').length,
    active: baseTickets.filter(ticket => isActiveStatus(ticket.status)).length,
  };
}

function filterTickets(baseTickets, filters, quickFilter, activeTab, { isAdmin, userId }) {
  return baseTickets.filter(ticket => {
    if (quickFilter?.field && ticket[quickFilter.field] !== quickFilter.value) return false;
    if (filters.category && ticket.category !== filters.category) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    if (!matchesSearch(ticket, filters)) return false;
    if (activeTab === 'mine' && isAdmin && ticket.user_id !== userId) return false;
    return true;
  });
}

export default function Tickets() {
  const { user } = useAuth();
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 760);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [replyMsg, setReplyMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState(initialFilters);
  const [quickFilter, setQuickFilter] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => { load(); }, [isAdmin]);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = isAdmin
        ? await ticketService.listAll(1, { limit: 500 })
        : await ticketService.listMy(1, { limit: 500 });
      setTickets(data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Error al cargar tickets'));
    } finally {
      setLoading(false);
    }
  }

  const kpis = useMemo(() => computeTicketKpis(tickets), [tickets]);

  const tabCounts = useMemo(() => ({
    all: tickets.length,
    mine: isAdmin ? tickets.filter(ticket => ticket.user_id === user?.id).length : tickets.length,
    unassigned: 0,
    overdue: 0,
  }), [tickets, isAdmin, user?.id]);

  const visibleTickets = useMemo(
    () => filterTickets(tickets, filters, quickFilter, activeTab, { isAdmin, userId: user?.id }),
    [tickets, filters, quickFilter, activeTab, isAdmin, user?.id]
  );

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateFilter(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }));
    if (field === 'priority' && quickFilter?.field === 'priority') {
      setQuickFilter(null);
    }
  }

  function applyKpiFilter(key) {
    const next = KPI_FILTERS[key];
    if (!next) return;
    if (quickFilter?.field === next.field && quickFilter.value === next.value) {
      setQuickFilter(null);
      return;
    }
    setQuickFilter(next);
    if (next.field === 'priority') {
      setFilters(prev => ({ ...prev, priority: '' }));
    }
  }

  function clearAllFilters() {
    setFilters(initialFilters);
    setQuickFilter(null);
    setActiveTab('all');
  }

  function clearFilterField(field) {
    if (field === 'tab') {
      setActiveTab('all');
      return;
    }
    setFilters(prev => ({ ...prev, [field]: '' }));
  }

  async function handleStatusChange(ticketId, status) {
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const { data } = await ticketService.updateStatus(ticketId, status);
      setMsg('Estado actualizado');
      setSelected(prev => prev?.id === ticketId ? { ...prev, ...data } : prev);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Error al actualizar estado'));
    } finally {
      setSaving(false);
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyMsg.trim() || !selected) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const { data } = await ticketService.addReply(selected.id, replyMsg.trim());
      setReplyMsg('');
      setSelected(prev => prev ? { ...prev, replies: [...(prev.replies || []), data] } : prev);
      setMsg('Actualización agregada');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Error al responder'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    if (!form.title.trim() || !form.description.trim()) {
      setError('Completá título y descripción para enviar el ticket.');
      return;
    }
    setSaving(true);
    try {
      await ticketService.create({
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        location_label: form.location_label.trim() || null,
      });
      setForm(initialForm);
      setShowCreate(false);
      setMsg('Ticket creado correctamente');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear ticket'));
    } finally {
      setSaving(false);
    }
  }

  function openTicket(ticket) {
    setSelected(ticket);
    setReplyMsg('');
    setMsg('');
    setError('');
  }

  const subtitle = isAdmin
    ? `Gestión de incidencias del complejo · ${tickets.length} tickets totales`
    : `Tus tickets y reclamos · ${kpis.active} activos`;
  const hasClientFilters = Boolean(filters.query || filters.date || filters.unit || filters.category || filters.priority || activeTab !== 'all' || quickFilter);

  return (
    <div style={t.page}>
      <div style={t.headerBar}>
        <div>
          <h1 style={{ ...t.font.title, margin: 0 }}>Tickets / Reclamos</h1>
          <span style={t.font.subtitle}>{subtitle}</span>
        </div>
        {!isAdmin && (
          <button type="button" style={t.primaryBtn} onClick={() => setShowCreate(true)}>
            Nuevo ticket
          </button>
        )}
      </div>

      {(msg || error) && (
        <div style={{ marginBottom: '0.75rem', ...(error ? t.toast('error') : t.toast('success')) }}>
          {error || msg}
        </div>
      )}

      <section style={styles.kpiGrid}>
        <TicketKpiCard label="Abiertos" value={kpis.opened} hint="Sin tomar" color={t.colors.info} active={quickFilter?.value === 'sent'} onClick={() => applyKpiFilter('sent')} />
        <TicketKpiCard label="En revisión" value={kpis.review} hint="En análisis" color={t.colors.info} active={quickFilter?.value === 'in_review'} onClick={() => applyKpiFilter('in_review')} />
        <TicketKpiCard label="En proceso" value={kpis.progress} hint="Con seguimiento" color={t.colors.accent} active={quickFilter?.value === 'in_progress'} onClick={() => applyKpiFilter('in_progress')} />
        <TicketKpiCard label="Resueltos" value={kpis.resolved} hint="Finalizados" color={t.colors.success} active={quickFilter?.value === 'resolved'} onClick={() => applyKpiFilter('resolved')} />
        <TicketKpiCard label="Urgentes" value={kpis.urgent} hint="Prioridad máxima" color={t.colors.danger} active={quickFilter?.value === 'urgent'} onClick={() => applyKpiFilter('urgent')} />
      </section>

      <TicketTabs active={activeTab} onChange={setActiveTab} isAdmin={isAdmin} counts={tabCounts} />
      <ActiveFilterSummary
        quickFilter={quickFilter}
        filters={filters}
        activeTab={activeTab}
        onClearQuick={() => setQuickFilter(null)}
        onClearField={clearFilterField}
        onClearAll={clearAllFilters}
      />
      <TicketFilters filters={filters} compact={isNarrow} onChange={updateFilter} onClear={clearAllFilters} />

      {loading ? (
        <div style={styles.skeletonList}>
          <EmptyState type="loading" isAdmin={isAdmin} />
          <Spinner />
        </div>
      ) : error ? (
        <div style={styles.skeletonList}>
          <EmptyState type="error" isAdmin={isAdmin} />
          <button type="button" onClick={load} style={t.secondaryBtn}>Reintentar</button>
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState type="empty" isAdmin={isAdmin} onCreate={() => setShowCreate(true)} />
      ) : visibleTickets.length === 0 ? (
        <EmptyState type={hasClientFilters ? 'search' : 'empty'} isAdmin={isAdmin} onCreate={() => setShowCreate(true)} />
      ) : (
        isNarrow
          ? <div style={styles.mobileList}>{visibleTickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} isAdmin={isAdmin} onSelect={openTicket} compact />)}</div>
          : <TicketTable tickets={visibleTickets} isAdmin={isAdmin} onSelect={openTicket} />
      )}

      {showCreate && !isAdmin && (
        <TicketCreatePanel
          form={form}
          saving={saving}
          reporterLabel={user?.unit_number ? `Unidad ${user.unit_number}` : 'Tu comunidad'}
          onChange={updateForm}
          onCancel={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {selected && (
        <TicketDetailPanel
          ticket={selected}
          isAdmin={isAdmin}
          saving={saving}
          replyMsg={replyMsg}
          onReplyMsg={setReplyMsg}
          onReply={handleReply}
          onStatusChange={handleStatusChange}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

const styles = {
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.55rem', marginBottom: '0.75rem' },
  kpiCard: { ...t.card, padding: '0.75rem', borderTop: `3px solid ${t.colors.border}`, display: 'grid', gap: '0.16rem', textAlign: 'left', cursor: 'pointer', background: t.colors.white },
  kpiCardActive: (color) => ({ background: t.colors.primarySoft, borderColor: color, boxShadow: `0 0 0 2px ${t.colors.primarySoft}` }),
  kpiLabel: { fontSize: '0.74rem', color: t.colors.textSecondary, fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center' },
  kpiActiveMark: { fontSize: '0.62rem', color: t.colors.primary, background: t.colors.white, border: `1px solid ${t.colors.border}`, borderRadius: '999px', padding: '0 0.35rem' },
  kpiValue: { fontSize: '1.25rem', color: t.colors.textPrimary, lineHeight: 1 },
  kpiHint: { fontSize: '0.72rem', color: t.colors.textSecondary },
  tabs: { ...t.card, padding: '0.35rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.6rem' },
  tab: { border: 'none', background: 'transparent', color: t.colors.textSecondary, borderRadius: t.radius.input, padding: '0.42rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', gap: '0.35rem', alignItems: 'center' },
  tabActive: { border: 'none', background: t.colors.primarySoft, color: t.colors.primary, borderRadius: t.radius.input, padding: '0.42rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', gap: '0.35rem', alignItems: 'center' },
  tabDisabled: { border: 'none', background: 'transparent', color: t.colors.textDisabled, borderRadius: t.radius.input, padding: '0.42rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'not-allowed', display: 'flex', gap: '0.35rem', alignItems: 'center', opacity: 0.65 },
  tabCount: { fontSize: '0.68rem', background: t.colors.white, border: `1px solid ${t.colors.border}`, color: t.colors.textSecondary, borderRadius: '999px', padding: '0 0.35rem' },
  activeFilters: { ...t.card, padding: '0.55rem 0.65rem', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.6rem' },
  activeFiltersLabel: { fontSize: '0.73rem', color: t.colors.textSecondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0 },
  filterChip: { border: `1px solid ${t.colors.primary}`, background: t.colors.primarySoft, color: t.colors.primary, borderRadius: '999px', padding: '0.25rem 0.55rem', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' },
  clearInlineBtn: { border: 'none', background: 'transparent', color: t.colors.textSecondary, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: '0.25rem 0.4rem' },
  filterBar: { ...t.card, padding: '0.65rem', display: 'grid', gridTemplateColumns: 'minmax(280px, 1.8fr) repeat(5, minmax(115px, 1fr))', gap: '0.45rem', alignItems: 'start', marginBottom: '0.75rem' },
  filterBarCompact: { ...t.card, padding: '0.65rem', display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem', alignItems: 'start', marginBottom: '0.75rem' },
  searchWrap: { position: 'relative' },
  searchIcon: { position: 'absolute', left: '0.55rem', top: '0.43rem', color: t.colors.textSecondary, fontSize: '0.9rem' },
  searchInput: { ...t.input, paddingLeft: '1.65rem' },
  tableWrap: { ...t.card, overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  th: { textAlign: 'left', padding: '0.65rem 0.7rem', borderBottom: `1px solid ${t.colors.border}`, color: t.colors.textSecondary, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0 },
  tr: { borderBottom: `1px solid ${t.colors.border}`, cursor: 'pointer' },
  td: { padding: '0.65rem 0.7rem', color: t.colors.textPrimary, verticalAlign: 'top' },
  mobileList: { display: 'grid', gap: '0.55rem' },
  ticketCard: { ...t.card, padding: '0.8rem', textAlign: 'left', cursor: 'pointer', width: '100%', background: t.colors.white },
  ticketMain: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem' },
  ticketMainCompact: { display: 'grid', gridTemplateColumns: '1fr', gap: '0.55rem' },
  ticketTitleRow: { display: 'flex', gap: '0.4rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' },
  ticketTitleRowCompact: { display: 'flex', gap: '0.4rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', paddingRight: '3.4rem' },
  ticketTitle: { color: t.colors.textPrimary, fontSize: '0.93rem' },
  ticketDescription: { margin: '0.25rem 0', color: t.colors.textSecondary, fontSize: '0.82rem', lineHeight: 1.45 },
  ticketMeta: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap', color: t.colors.textSecondary, fontSize: '0.74rem' },
  ticketAside: { display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' },
  ticketAsideCompact: { display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap', paddingRight: '3.4rem' },
  categoryChip: { ...t.badge(t.colors.primary, t.colors.primarySoft), border: `1px solid ${t.colors.border}` },
  meta: { display: 'block', fontSize: '0.74rem', color: t.colors.textSecondary },
  skeletonList: { ...t.card, padding: '1rem', display: 'grid', placeItems: 'center', gap: '0.75rem', color: t.colors.textSecondary },
  emptyState: { ...t.card, padding: '1.35rem', display: 'grid', gap: '0.35rem', color: t.colors.textSecondary, textAlign: 'center', justifyItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,59,94,0.20)', zIndex: 180, display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 'min(620px, 100%)', height: '100%', background: t.colors.white, boxShadow: t.shadow.modal, overflowY: 'auto', boxSizing: 'border-box' },
  panelHeader: { position: 'sticky', top: 0, zIndex: 1, background: t.colors.white, borderBottom: `1px solid ${t.colors.border}`, padding: '1rem 1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' },
  panelTitle: { ...t.font.title, margin: 0 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.55rem', cursor: 'pointer', color: t.colors.textSecondary, lineHeight: 1 },
  panelBody: { padding: '1rem 1.1rem 5.5rem', display: 'grid', gap: '0.85rem' },
  panelSection: { display: 'grid', gap: '0.55rem' },
  panelSectionTitle: { margin: 0, fontSize: '0.9rem', fontWeight: 800, color: t.colors.textPrimary },
  pillGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.45rem' },
  choice: { border: `1px solid ${t.colors.border}`, background: t.colors.white, borderRadius: t.radius.input, padding: '0.6rem', display: 'grid', gap: '0.18rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textSecondary, fontSize: '0.78rem' },
  choiceActive: { border: `1px solid ${t.colors.primary}`, background: t.colors.primarySoft, borderRadius: t.radius.input, padding: '0.6rem', display: 'grid', gap: '0.18rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textPrimary, fontSize: '0.78rem' },
  priorityGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.4rem' },
  priorityChoice: { border: `1px solid ${t.colors.border}`, background: t.colors.white, borderRadius: t.radius.input, padding: '0.55rem', display: 'grid', gap: '0.1rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textSecondary, fontSize: '0.75rem' },
  priorityActive: (priority) => ({ border: `1px solid ${priority.color}`, background: priority.bg, borderRadius: t.radius.input, padding: '0.55rem', display: 'grid', gap: '0.1rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textPrimary, fontSize: '0.75rem', boxShadow: priority.glow ? '0 0 0 2px rgba(231,76,60,0.08)' : 'none' }),
  hint: { margin: 0, fontSize: '0.74rem', color: t.colors.textSecondary, lineHeight: 1.4 },
  readonlyField: { border: `1px dashed ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.55rem', display: 'grid', gap: '0.12rem', fontSize: '0.78rem', color: t.colors.textSecondary },
  panelActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.45rem', flexWrap: 'wrap', padding: '0.25rem 4.6rem 0 0', marginBottom: '2rem' },
  chipRow: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' },
  detailBlock: { ...t.card, padding: '0.8rem', display: 'grid', gap: '0.55rem' },
  detailTitle: { margin: 0, fontSize: '1rem', color: t.colors.textPrimary },
  detailDescription: { margin: 0, color: t.colors.textPrimary, fontSize: '0.86rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.45rem', fontSize: '0.78rem', color: t.colors.textSecondary },
  detailField: { display: 'grid', gap: '0.12rem' },
  statusActions: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  inlineCheck: { display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.8rem', color: t.colors.textSecondary },
  timeline: { display: 'grid', gap: '0.65rem' },
  timelineItem: { display: 'grid', gridTemplateColumns: '12px 1fr', gap: '0.55rem', alignItems: 'flex-start', fontSize: '0.8rem', color: t.colors.textSecondary },
  timelineDot: { width: '9px', height: '9px', borderRadius: '50%', background: t.colors.info, marginTop: '0.28rem', boxShadow: `0 0 0 3px ${t.colors.primarySoft}` },
  timelineText: { margin: '0.12rem 0', color: t.colors.textPrimary, lineHeight: 1.45 },
  replyForm: { display: 'grid', gap: '0.45rem' },
};
