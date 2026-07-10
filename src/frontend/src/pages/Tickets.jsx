import { useEffect, useState } from 'react';
import { ticketService } from '../services/comunicacion';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import t from '../theme';

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Mantenimiento', hint: 'Agua, ascensor, portón, luces o reparaciones.' },
  { value: 'cleaning', label: 'Limpieza', hint: 'Pasillos, residuos, áreas comunes.' },
  { value: 'security', label: 'Seguridad', hint: 'Accesos, cerraduras, situaciones de riesgo.' },
  { value: 'coexistence', label: 'Convivencia', hint: 'Ruido, mascotas, molestias entre vecinos.' },
  { value: 'administration', label: 'Expensas/Administración', hint: 'Consultas administrativas sin tocar pagos.' },
  { value: 'amenities', label: 'Amenities', hint: 'Reservas o problemas en espacios comunes.' },
  { value: 'other', label: 'Otro', hint: 'Cualquier situación no contemplada.' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja', color: t.colors.textSecondary, bg: t.colors.border },
  { value: 'medium', label: 'Media', color: t.colors.info, bg: t.colors.primarySoft },
  { value: 'high', label: 'Alta', color: t.colors.accent, bg: t.colors.accentSoft },
  { value: 'urgent', label: 'Urgente', color: t.colors.danger, bg: t.colors.dangerSoft },
];

const STATUS_OPTIONS = [
  { value: 'sent', label: 'Abierto', color: t.colors.info, bg: t.colors.primarySoft },
  { value: 'in_review', label: 'En revisión', color: t.colors.accent, bg: t.colors.accentSoft },
  { value: 'in_progress', label: 'En proceso', color: t.colors.accentHover, bg: t.colors.accentSoft },
  { value: 'resolved', label: 'Resuelto', color: t.colors.success, bg: t.colors.successSoft },
  { value: 'closed', label: 'Cerrado', color: t.colors.textSecondary, bg: t.colors.border },
  { value: 'cancelled', label: 'Cancelado', color: t.colors.danger, bg: t.colors.dangerSoft },
];

const EXAMPLES = [
  'Pérdida de agua en pasillo del piso 2',
  'Ascensor no funciona desde la mañana',
  'Portón eléctrico queda abierto',
  'Luces quemadas en cochera',
  'Ruido molesto fuera de horario',
  'Limpieza pendiente en hall de entrada',
];

const initialForm = {
  category: 'maintenance',
  priority: 'medium',
  title: '',
  description: '',
  location_label: '',
};

const initialFilters = { status: '', category: '', priority: '' };

function optionLabel(options, value) {
  return options.find(opt => opt.value === value)?.label || value || '-';
}

function badgeFor(options, value) {
  const opt = options.find(item => item.value === value) || options[0];
  return t.badge(opt.color, opt.bg);
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Tickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [replyMsg, setReplyMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState(initialFilters);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const isAdmin = user?.role === 'admin';

  useEffect(() => { load(); }, [page, filters.status, filters.category, filters.priority]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const { data } = isAdmin
        ? await ticketService.listAll(page, activeFilters)
        : await ticketService.listMy(page, activeFilters);
      setTickets(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Error al cargar tickets'));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
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
    if (!replyMsg.trim()) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const { data } = await ticketService.addReply(selected.id, replyMsg.trim());
      setReplyMsg('');
      setSelected(prev => prev ? { ...prev, replies: [...(prev.replies || []), data] } : prev);
      setMsg('Respuesta agregada');
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
      setShowForm(false);
      setMsg('Ticket creado correctamente');
      setPage(1);
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

  return (
    <div style={t.page}>
      <div style={t.headerBar}>
        <div>
          <h1 style={{ ...t.font.title, margin: 0 }}>Tickets</h1>
          <span style={t.font.subtitle}>
            {isAdmin ? 'Bandeja de reclamos y solicitudes de la comunidad.' : 'Contanos qué está pasando para que administración pueda ayudarte.'}
          </span>
        </div>
        {!isAdmin && (
          <button type="button" style={showForm ? t.secondaryBtn : t.primaryBtn} onClick={() => setShowForm(prev => !prev)}>
            {showForm ? 'Cancelar' : 'Nuevo ticket'}
          </button>
        )}
      </div>

      {(msg || error) && (
        <div style={{ marginBottom: '0.75rem', ...(error ? t.toast('error') : t.toast('success')) }}>
          {error || msg}
        </div>
      )}

      {!isAdmin && showForm && (
        <section style={styles.createLayout}>
          <form onSubmit={handleCreate} style={styles.formCard}>
            <div>
              <h2 style={styles.sectionTitle}>Nuevo ticket</h2>
              <span style={t.font.subtitle}>¿Qué necesitás reportar?</span>
            </div>

            <div style={styles.categoryGrid}>
              {CATEGORY_OPTIONS.map(category => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => updateForm('category', category.value)}
                  style={form.category === category.value ? styles.categoryActive : styles.categoryCard}
                >
                  <strong>{category.label}</strong>
                  <span>{category.hint}</span>
                </button>
              ))}
            </div>

            <div style={styles.twoCols}>
              <label>
                <span style={t.font.label}>Prioridad</span>
                <select value={form.priority} onChange={(e) => updateForm('priority', e.target.value)} style={t.input}>
                  {PRIORITY_OPTIONS.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                </select>
              </label>
              <label>
                <span style={t.font.label}>Ubicación o área afectada</span>
                <input
                  value={form.location_label}
                  onChange={(e) => updateForm('location_label', e.target.value)}
                  placeholder="Ej: pasillo piso 2, cochera, SUM"
                  style={t.input}
                />
              </label>
            </div>

            <label>
              <span style={t.font.label}>Título</span>
              <input
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="Ej: pérdida de agua en pasillo del piso 2"
                required
                style={t.input}
              />
            </label>

            <label>
              <span style={t.font.label}>Descripción</span>
              <textarea
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Describí el problema con el mayor detalle posible."
                required
                rows={5}
                style={{ ...t.input, resize: 'vertical' }}
              />
            </label>

            <div style={styles.formActions}>
              <button type="button" onClick={() => setForm(initialForm)} style={t.secondaryBtn}>Limpiar</button>
              <button type="submit" disabled={saving} style={{ ...t.primaryBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enviando...' : 'Enviar ticket'}
              </button>
            </div>
          </form>

          <aside style={styles.helpBox}>
            <h3 style={styles.helpTitle}>Ejemplos frecuentes</h3>
            {EXAMPLES.map(example => (
              <button
                key={example}
                type="button"
                onClick={() => updateForm('title', example)}
                style={styles.exampleBtn}
              >
                {example}
              </button>
            ))}
          </aside>
        </section>
      )}

      <section style={styles.toolbar}>
        <div>
          <h2 style={styles.sectionTitle}>{isAdmin ? 'Bandeja de tickets' : 'Mis tickets'}</h2>
          <span style={t.font.subtitle}>{tickets.length} registros visibles</span>
        </div>
        <div style={styles.filters}>
          <select value={filters.status} onChange={(e) => { setPage(1); setFilters(prev => ({ ...prev, status: e.target.value })); }} style={t.input}>
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => { setPage(1); setFilters(prev => ({ ...prev, category: e.target.value })); }} style={t.input}>
            <option value="">Todas las categorías</option>
            {CATEGORY_OPTIONS.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => { setPage(1); setFilters(prev => ({ ...prev, priority: e.target.value })); }} style={t.input}>
            <option value="">Todas las prioridades</option>
            {PRIORITY_OPTIONS.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
          </select>
          <button type="button" onClick={() => { setPage(1); setFilters(initialFilters); }} style={t.secondaryBtn}>Limpiar</button>
        </div>
      </section>

      {loading ? (
        <div style={styles.loading}><Spinner /></div>
      ) : tickets.length === 0 ? (
        <div style={styles.emptyState}>
          <strong>No hay tickets para mostrar.</strong>
          <span>{isAdmin ? 'Cuando los residentes reporten problemas, aparecerán acá.' : 'Todavía no registraste reclamos o solicitudes.'}</span>
        </div>
      ) : (
        <div style={styles.ticketList}>
          {tickets.map(ticket => (
            <button key={ticket.id} type="button" style={styles.ticketCard} onClick={() => openTicket(ticket)}>
              <div style={styles.ticketHeader}>
                <div>
                  <strong style={styles.ticketTitle}>{ticket.title}</strong>
                  <span style={styles.meta}>
                    {ticket.unit_number || 'Sin unidad'}
                    {ticket.location_label ? ` · ${ticket.location_label}` : ''}
                    {isAdmin && ticket.user_email ? ` · ${ticket.user_email}` : ''}
                  </span>
                </div>
                <span style={badgeFor(STATUS_OPTIONS, ticket.status)}>{optionLabel(STATUS_OPTIONS, ticket.status)}</span>
              </div>
              <p style={styles.description}>{ticket.description || 'Sin descripción'}</p>
              <div style={styles.cardFooter}>
                <span style={badgeFor(CATEGORY_OPTIONS, ticket.category)}>{optionLabel(CATEGORY_OPTIONS, ticket.category)}</span>
                <span style={badgeFor(PRIORITY_OPTIONS, ticket.priority)}>{optionLabel(PRIORITY_OPTIONS, ticket.priority)}</span>
                <span style={styles.meta}>Actualizado: {formatDate(ticket.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button type="button" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1} style={t.secondaryBtn}>Anterior</button>
          <span style={styles.meta}>Pág. {page} de {totalPages}</span>
          <button type="button" onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} style={t.secondaryBtn}>Siguiente</button>
        </div>
      )}

      {selected && (
        <div style={styles.overlay} onClick={() => setSelected(null)}>
          <aside style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ ...t.font.title, margin: 0 }}>{selected.title}</h2>
                <div style={styles.chipRow}>
                  <span style={badgeFor(STATUS_OPTIONS, selected.status)}>{optionLabel(STATUS_OPTIONS, selected.status)}</span>
                  <span style={badgeFor(PRIORITY_OPTIONS, selected.priority)}>{optionLabel(PRIORITY_OPTIONS, selected.priority)}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={styles.closeBtn}>×</button>
            </div>

            <div style={styles.detailGrid}>
              <span><strong>Categoría</strong>{optionLabel(CATEGORY_OPTIONS, selected.category)}</span>
              <span><strong>Unidad</strong>{selected.unit_number || '-'}</span>
              <span><strong>Ubicación</strong>{selected.location_label || '-'}</span>
              <span><strong>Creado</strong>{formatDate(selected.created_at)}</span>
            </div>
            <p style={styles.detailDescription}>{selected.description || 'Sin descripción'}</p>

            {isAdmin && (
              <section style={styles.block}>
                <h3 style={styles.helpTitle}>Gestión</h3>
                <div style={styles.statusActions}>
                  {STATUS_OPTIONS.map(status => (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => handleStatusChange(selected.id, status.value)}
                      disabled={saving}
                      style={selected.status === status.value ? t.primaryBtn : t.secondaryBtn}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section style={styles.block}>
              <h3 style={styles.helpTitle}>Respuestas</h3>
              {!(selected.replies || []).length && <span style={styles.meta}>Sin respuestas aún.</span>}
              {(selected.replies || []).map(reply => (
                <div key={reply.id} style={{ ...styles.reply, background: reply.is_admin ? t.colors.primarySoft : t.colors.bg }}>
                  <p style={styles.replyText}>{reply.message}</p>
                  <span style={styles.meta}>{reply.is_admin ? 'Administración' : 'Residente'} · {formatDate(reply.created_at)}</span>
                </div>
              ))}
              <form onSubmit={handleReply} style={styles.replyForm}>
                <textarea
                  placeholder="Escribí una respuesta..."
                  value={replyMsg}
                  onChange={(e) => setReplyMsg(e.target.value)}
                  rows={3}
                  style={{ ...t.input, resize: 'vertical' }}
                />
                <button type="submit" disabled={saving || !replyMsg.trim()} style={t.primaryBtn}>Responder</button>
              </form>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

const styles = {
  createLayout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', alignItems: 'start', marginBottom: '0.75rem' },
  formCard: { ...t.card, padding: '0.9rem', display: 'grid', gap: '0.65rem' },
  sectionTitle: { ...t.sectionTitle, margin: 0 },
  categoryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' },
  categoryCard: { border: `1px solid ${t.colors.border}`, background: t.colors.white, borderRadius: t.radius.input, padding: '0.65rem', display: 'grid', gap: '0.2rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textSecondary },
  categoryActive: { border: `1px solid ${t.colors.primary}`, background: t.colors.primarySoft, borderRadius: t.radius.input, padding: '0.65rem', display: 'grid', gap: '0.2rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textPrimary },
  twoCols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' },
  helpBox: { ...t.card, padding: '0.9rem', display: 'grid', gap: '0.45rem' },
  helpTitle: { margin: 0, fontSize: '0.9rem', fontWeight: 700, color: t.colors.textPrimary },
  exampleBtn: { border: `1px solid ${t.colors.border}`, background: t.colors.white, borderRadius: t.radius.input, padding: '0.5rem', textAlign: 'left', cursor: 'pointer', color: t.colors.textSecondary, fontSize: '0.8rem' },
  toolbar: { ...t.card, padding: '0.8rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '0.75rem' },
  filters: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.45rem', alignItems: 'start', width: 'min(100%, 760px)' },
  loading: { ...t.card, padding: '2rem', display: 'grid', placeItems: 'center' },
  emptyState: { ...t.card, padding: '1rem', display: 'grid', gap: '0.2rem', color: t.colors.textSecondary, textAlign: 'center' },
  ticketList: { display: 'grid', gap: '0.55rem' },
  ticketCard: { ...t.card, padding: '0.8rem', display: 'grid', gap: '0.45rem', textAlign: 'left', cursor: 'pointer', borderColor: t.colors.border },
  ticketHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' },
  ticketTitle: { color: t.colors.textPrimary, fontSize: '0.95rem' },
  meta: { display: 'block', fontSize: '0.76rem', color: t.colors.textSecondary },
  description: { margin: 0, color: t.colors.textSecondary, fontSize: '0.84rem', lineHeight: 1.45 },
  cardFooter: { display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,59,94,0.18)', zIndex: 180, display: 'flex', justifyContent: 'flex-end' },
  modal: { width: 'min(560px, 100%)', height: '100%', background: t.colors.white, padding: '1.2rem', boxShadow: t.shadow.modal, overflowY: 'auto', boxSizing: 'border-box' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: t.colors.textSecondary },
  chipRow: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' },
  detailGrid: { ...t.card, padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', fontSize: '0.82rem', color: t.colors.textSecondary },
  detailDescription: { ...t.card, padding: '0.8rem', margin: '0.75rem 0', color: t.colors.textPrimary, fontSize: '0.88rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  block: { ...t.card, padding: '0.8rem', marginBottom: '0.75rem', display: 'grid', gap: '0.55rem' },
  statusActions: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  reply: { borderRadius: t.radius.input, padding: '0.6rem', display: 'grid', gap: '0.2rem' },
  replyText: { margin: 0, color: t.colors.textPrimary, fontSize: '0.84rem' },
  replyForm: { display: 'grid', gap: '0.45rem' },
};
