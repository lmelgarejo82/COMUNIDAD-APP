import { useEffect, useState } from 'react';
import t from '../theme';
import { useAuth } from '../context/AuthContext';
import { accessLogService, accessPreauthorizationService } from '../services/accessLogs';
import AccessKpiCard from '../components/access/AccessKpiCard';
import AccessTabs from '../components/access/AccessTabs';
import AccessFilters from '../components/access/AccessFilters';
import AccessVisitorList from '../components/access/AccessVisitorList';
import CheckInPanel from '../components/access/CheckInPanel';
import VisitDetailPanel from '../components/access/VisitDetailPanel';
import ConfirmCheckoutModal from '../components/access/ConfirmCheckoutModal';
import UnitSearchSelect from '../components/access/UnitSearchSelect';

const preauthInitialForm = {
  visitor_name: '',
  visitor_document: '',
  visitor_phone: '',
  vehicle_plate: '',
  visit_type: 'guest',
  unit_id: null,
  destination_label: '',
  authorized_by: '',
  notes: '',
  expected_from: '',
  expected_until: '',
};

const preauthInitialFilters = {
  search: '',
  status: '',
  date_from: '',
  date_to: '',
};

const statusLabels = {
  pending: 'Pendiente',
  used: 'Usada',
  cancelled: 'Cancelada',
  expired: 'Vencida',
};

const statusColors = {
  pending: { color: t.colors.accent, bg: t.colors.accentSoft },
  used: { color: t.colors.success, bg: t.colors.successSoft },
  cancelled: { color: t.colors.textSecondary, bg: t.colors.border },
  expired: { color: t.colors.danger, bg: t.colors.dangerSoft },
};

function formatDateTime(value) {
  if (!value) return 'Sin horario definido';
  return new Date(value).toLocaleString('es-AR');
}

function toApiDateTime(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function PreauthStatusChip({ status }) {
  const normalized = status || 'pending';
  const palette = statusColors[normalized] || statusColors.pending;
  return (
    <span style={t.badge(palette.color, palette.bg)}>
      {statusLabels[normalized] || normalized}
    </span>
  );
}

export default function AccessLogs() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inside');
  const [filters, setFilters] = useState({ search: '', visit_type: '' });
  const [visits, setVisits] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [preauthOpen, setPreauthOpen] = useState(false);
  const [preauths, setPreauths] = useState([]);
  const [preauthLoading, setPreauthLoading] = useState(false);
  const [preauthFilters, setPreauthFilters] = useState(preauthInitialFilters);
  const [preauthForm, setPreauthForm] = useState(preauthInitialForm);
  const [preauthDetail, setPreauthDetail] = useState(null);
  const [detailVisit, setDetailVisit] = useState(null);
  const [checkoutVisit, setCheckoutVisit] = useState(null);

  useEffect(() => {
    load();
  }, [activeTab, filters.search, filters.visit_type]);

  useEffect(() => {
    if (preauthOpen && user?.role === 'admin') {
      loadPreauthorizations();
    }
  }, [preauthOpen, preauthFilters.search, preauthFilters.status, preauthFilters.date_from, preauthFilters.date_to]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await accessLogService.list({ view: activeTab, ...filters });
      setVisits(data.data || []);
      setKpis(data.kpis || {});
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la bitácora.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshDetail(id) {
    const { data } = await accessLogService.get(id);
    setDetailVisit(data);
  }

  async function handleCheckIn(form) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessLogService.checkIn(form);
      setMessage(data.message);
      setCheckInOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el ingreso.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUsePreauthorization(item) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessPreauthorizationService.use(item.id);
      setMessage(data.message);
      setCheckInOpen(false);
      await load();
      if (preauthOpen) await loadPreauthorizations();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo usar la preautorización.');
    } finally {
      setSaving(false);
    }
  }

  async function loadPreauthorizations() {
    setPreauthLoading(true);
    try {
      const params = {
        limit: 50,
        search: preauthFilters.search || undefined,
        status: preauthFilters.status || undefined,
        date_from: preauthFilters.date_from || undefined,
        date_to: preauthFilters.date_to || undefined,
      };
      const { data } = await accessPreauthorizationService.list(params);
      setPreauths(data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las preautorizaciones.');
    } finally {
      setPreauthLoading(false);
    }
  }

  function updatePreauthForm(field, value) {
    setPreauthForm(prev => ({ ...prev, [field]: value }));
  }

  function handlePreauthManualDestination(value) {
    setPreauthForm(prev => ({ ...prev, unit_id: null, destination_label: value }));
  }

  function handlePreauthUnitSelect(unit) {
    setPreauthForm(prev => ({
      ...prev,
      unit_id: unit.unit_id,
      destination_label: unit.display_path || unit.unit_label,
    }));
  }

  function handlePreauthUnitClear() {
    setPreauthForm(prev => ({ ...prev, unit_id: null, destination_label: '' }));
  }

  async function handleCreatePreauthorization() {
    if (!preauthForm.visitor_name.trim()) {
      setError('Ingresá el nombre del visitante.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = Object.fromEntries(
        Object.entries(preauthForm).map(([key, value]) => [key, value === '' ? null : value])
      );
      payload.expected_from = toApiDateTime(preauthForm.expected_from);
      payload.expected_until = toApiDateTime(preauthForm.expected_until);
      const { data } = await accessPreauthorizationService.create(payload);
      setMessage(data.message);
      setPreauthForm(preauthInitialForm);
      await loadPreauthorizations();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la preautorización.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPreauthorization(item) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessPreauthorizationService.cancel(item.id);
      setMessage(data.message);
      await loadPreauthorizations();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cancelar la preautorización.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckout(visit) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessLogService.checkOut(visit.id);
      setMessage(data.message);
      setCheckoutVisit(null);
      await load();
      if (detailVisit?.id === visit.id) await refreshDetail(visit.id);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la salida.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(visit) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessLogService.cancel(visit.id);
      setMessage(data.message);
      await load();
      await refreshDetail(visit.id);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cancelar el registro.');
    } finally {
      setSaving(false);
    }
  }

  async function handleObserve(visit, note) {
    if (!note?.trim()) {
      setError('Ingresá un motivo para marcar la visita como observada.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessLogService.observe(visit.id, note);
      setMessage(data.message);
      await load();
      await refreshDetail(visit.id);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo marcar la observación.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnobserve(visit) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await accessLogService.unobserve(visit.id);
      setMessage(data.message);
      await load();
      await refreshDetail(visit.id);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo quitar la observación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={t.page}>
      <div style={t.headerBar}>
        <div>
          <h1 style={{ ...t.font.title, margin: 0 }}>Accesos</h1>
          <span style={t.font.subtitle}>Bitácora de visitantes, ingresos y salidas.</span>
        </div>
        <div style={styles.headerActions}>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setPreauthOpen(prev => !prev)}
              style={t.secondaryBtn}
            >
              Preautorizaciones
            </button>
          )}
          <button type="button" onClick={() => setCheckInOpen(true)} style={t.primaryBtn}>
            Registrar ingreso
          </button>
        </div>
      </div>

      {(message || error) && (
        <div style={{ marginBottom: '0.75rem', ...(error ? t.toast('error') : t.toast('success')) }}>
          {error || message}
        </div>
      )}

      <div style={t.kpiGrid}>
        <AccessKpiCard label="Dentro" value={kpis.inside} hint="Visitas activas" color={t.colors.info} />
        <AccessKpiCard label="Ingresos hoy" value={kpis.entries_today} hint="Desde las 00:00" color={t.colors.secondary} />
        <AccessKpiCard label="Salidas hoy" value={kpis.exits_today} hint="Registradas" color={t.colors.success} />
        <AccessKpiCard label="Atención" value={kpis.observed_or_delayed} hint="Observados o demorados" color={t.colors.accent} />
      </div>

      {preauthOpen && user?.role === 'admin' && (
        <section style={styles.preauthAdmin}>
          <div style={styles.preauthHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Preautorizaciones</h2>
              <span style={t.font.subtitle}>Visitas esperadas para encontrar rápido en portería.</span>
            </div>
            <button type="button" onClick={loadPreauthorizations} disabled={preauthLoading} style={t.secondaryBtn}>
              {preauthLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          <div style={styles.preauthLayout}>
            <div style={styles.preauthCreate}>
              <h3 style={styles.subsectionTitle}>Nueva preautorización</h3>
              <div style={styles.preauthForm}>
                <label>
                  <span style={t.font.label}>Visitante</span>
                  <input value={preauthForm.visitor_name} onChange={(e) => updatePreauthForm('visitor_name', e.target.value)} placeholder="Nombre y apellido" style={t.input} />
                </label>
                <div style={styles.twoCols}>
                  <label>
                    <span style={t.font.label}>Documento</span>
                    <input value={preauthForm.visitor_document} onChange={(e) => updatePreauthForm('visitor_document', e.target.value)} style={t.input} />
                  </label>
                  <label>
                    <span style={t.font.label}>Teléfono</span>
                    <input value={preauthForm.visitor_phone} onChange={(e) => updatePreauthForm('visitor_phone', e.target.value)} style={t.input} />
                  </label>
                </div>
                <div style={styles.twoCols}>
                  <label>
                    <span style={t.font.label}>Tipo</span>
                    <select value={preauthForm.visit_type} onChange={(e) => updatePreauthForm('visit_type', e.target.value)} style={t.input}>
                      <option value="guest">Visita</option>
                      <option value="delivery">Entrega</option>
                      <option value="service">Servicio</option>
                      <option value="provider">Proveedor</option>
                      <option value="other">Otro</option>
                    </select>
                  </label>
                  <label>
                    <span style={t.font.label}>Vehículo</span>
                    <input value={preauthForm.vehicle_plate} onChange={(e) => updatePreauthForm('vehicle_plate', e.target.value.toUpperCase())} placeholder="Patente" style={t.input} />
                  </label>
                </div>
                <UnitSearchSelect
                  value={preauthForm.destination_label}
                  selectedUnitId={preauthForm.unit_id}
                  onManualChange={handlePreauthManualDestination}
                  onSelect={handlePreauthUnitSelect}
                  onClear={handlePreauthUnitClear}
                />
                <label>
                  <span style={t.font.label}>Autorizado por</span>
                  <input value={preauthForm.authorized_by} onChange={(e) => updatePreauthForm('authorized_by', e.target.value)} placeholder="Residente o administración" style={t.input} />
                </label>
                <div style={styles.twoCols}>
                  <label>
                    <span style={t.font.label}>Esperada desde</span>
                    <input type="datetime-local" value={preauthForm.expected_from} onChange={(e) => updatePreauthForm('expected_from', e.target.value)} style={t.input} />
                  </label>
                  <label>
                    <span style={t.font.label}>Esperada hasta</span>
                    <input type="datetime-local" value={preauthForm.expected_until} onChange={(e) => updatePreauthForm('expected_until', e.target.value)} style={t.input} />
                  </label>
                </div>
                <label>
                  <span style={t.font.label}>Notas</span>
                  <textarea value={preauthForm.notes} onChange={(e) => updatePreauthForm('notes', e.target.value)} rows={3} style={{ ...t.input, resize: 'vertical' }} />
                </label>
                <div style={styles.formActions}>
                  <button type="button" onClick={() => setPreauthForm(preauthInitialForm)} style={t.secondaryBtn}>
                    Limpiar
                  </button>
                  <button type="button" onClick={handleCreatePreauthorization} disabled={saving} style={t.primaryBtn}>
                    {saving ? 'Creando...' : 'Crear preautorización'}
                  </button>
                </div>
              </div>
            </div>

            <div style={styles.preauthManage}>
              <div style={styles.listHeader}>
                <h3 style={styles.subsectionTitle}>Seguimiento</h3>
                <span style={styles.countBadge}>{preauths.length} registros</span>
              </div>
              <div style={styles.filtersGrid}>
                <input value={preauthFilters.search} onChange={(e) => setPreauthFilters(p => ({ ...p, search: e.target.value }))} placeholder="Buscar visitante, documento, patente o unidad" style={t.input} />
                <select value={preauthFilters.status} onChange={(e) => setPreauthFilters(p => ({ ...p, status: e.target.value }))} style={t.input}>
                  <option value="">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="used">Usada</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="expired">Vencida</option>
                </select>
                <input type="date" value={preauthFilters.date_from} onChange={(e) => setPreauthFilters(p => ({ ...p, date_from: e.target.value }))} style={t.input} />
                <input type="date" value={preauthFilters.date_to} onChange={(e) => setPreauthFilters(p => ({ ...p, date_to: e.target.value }))} style={t.input} />
                <button type="button" onClick={() => setPreauthFilters(preauthInitialFilters)} style={t.secondaryBtn}>
                  Limpiar filtros
                </button>
              </div>

              <div style={styles.preauthList}>
                {preauthLoading && <div style={styles.emptyHint}>Cargando preautorizaciones...</div>}
                {!preauthLoading && preauths.length === 0 && (
                  <div style={styles.emptyState}>
                    <strong>No hay preautorizaciones para mostrar.</strong>
                    <span>Ajustá los filtros o creá una nueva visita esperada.</span>
                  </div>
                )}
                {!preauthLoading && preauths.map(item => {
                  const effectiveStatus = item.effective_status || item.status;
                  return (
                    <div key={item.id} style={styles.preauthRow}>
                      <div>
                        <div style={styles.rowTitle}>
                          <strong>{item.visitor_name}</strong>
                          <PreauthStatusChip status={effectiveStatus} />
                        </div>
                        <span style={styles.itemMeta}>
                          {item.destination_label || item.unit_code || 'Destino manual'} · {item.visit_type}
                        </span>
                        <span style={styles.itemMeta}>
                          {formatDateTime(item.expected_from)}
                          {item.authorized_by ? ` · Autorizado por ${item.authorized_by}` : ''}
                        </span>
                      </div>
                      <div style={styles.rowActions}>
                        <button type="button" onClick={() => setPreauthDetail(item)} style={t.secondaryBtn}>
                          Ver
                        </button>
                        {effectiveStatus === 'pending' && (
                          <button type="button" onClick={() => handleCancelPreauthorization(item)} disabled={saving} style={t.secondaryBtn}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <AccessTabs active={activeTab} onChange={setActiveTab} />
        <AccessFilters filters={filters} onChange={setFilters} onClear={() => setFilters({ search: '', visit_type: '' })} />
      </div>

      <AccessVisitorList visits={visits} loading={loading} error={error && !message ? error : ''} onSelect={setDetailVisit} />

      <CheckInPanel
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        onSubmit={handleCheckIn}
        onUsePreauthorization={handleUsePreauthorization}
        saving={saving}
      />
      <VisitDetailPanel
        visit={detailVisit}
        onClose={() => setDetailVisit(null)}
        onCheckout={setCheckoutVisit}
        onCancel={handleCancel}
        onObserve={handleObserve}
        onUnobserve={handleUnobserve}
      />
      <ConfirmCheckoutModal
        visit={checkoutVisit}
        onCancel={() => setCheckoutVisit(null)}
        onConfirm={handleCheckout}
        saving={saving}
      />
      {preauthDetail && (
        <div style={styles.detailOverlay}>
          <div style={styles.detailBox}>
            <div style={styles.detailHeader}>
              <div>
                <h2 style={styles.detailTitle}>{preauthDetail.visitor_name}</h2>
                <PreauthStatusChip status={preauthDetail.effective_status || preauthDetail.status} />
              </div>
              <button type="button" onClick={() => setPreauthDetail(null)} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.detailGrid}>
              <span><strong>Destino</strong>{preauthDetail.destination_label || preauthDetail.unit_code || 'Destino manual'}</span>
              <span><strong>Documento</strong>{preauthDetail.visitor_document || 'Sin dato'}</span>
              <span><strong>Teléfono</strong>{preauthDetail.visitor_phone || 'Sin dato'}</span>
              <span><strong>Vehículo</strong>{preauthDetail.vehicle_plate || 'Sin dato'}</span>
              <span><strong>Tipo</strong>{preauthDetail.visit_type}</span>
              <span><strong>Autorizado por</strong>{preauthDetail.authorized_by || 'Sin dato'}</span>
              <span><strong>Desde</strong>{formatDateTime(preauthDetail.expected_from)}</span>
              <span><strong>Hasta</strong>{formatDateTime(preauthDetail.expected_until)}</span>
              <span><strong>Creada por</strong>{preauthDetail.created_by_email || 'Sin dato'}</span>
              <span><strong>Usada en ingreso</strong>{preauthDetail.used_access_log_id || 'No usada'}</span>
            </div>
            {preauthDetail.notes && (
              <div style={styles.noteBox}>
                <strong>Notas</strong>
                <span>{preauthDetail.notes}</span>
              </div>
            )}
            <div style={styles.formActions}>
              {(preauthDetail.effective_status || preauthDetail.status) === 'pending' && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleCancelPreauthorization(preauthDetail);
                    setPreauthDetail(null);
                  }}
                  disabled={saving}
                  style={t.secondaryBtn}
                >
                  Cancelar pendiente
                </button>
              )}
              <button type="button" onClick={() => setPreauthDetail(null)} style={t.primaryBtn}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  headerActions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' },
  preauthAdmin: { ...t.card, padding: '0.9rem', marginBottom: '0.75rem', display: 'grid', gap: '0.7rem' },
  preauthHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' },
  sectionTitle: { ...t.sectionTitle, margin: 0 },
  subsectionTitle: { margin: 0, fontSize: '0.9rem', fontWeight: 700, color: t.colors.textPrimary },
  preauthLayout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', alignItems: 'start' },
  preauthCreate: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.75rem', display: 'grid', gap: '0.6rem' },
  preauthManage: { display: 'grid', gap: '0.6rem' },
  preauthForm: { display: 'grid', gap: '0.55rem', alignItems: 'start' },
  twoCols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  countBadge: { ...t.badge(t.colors.textSecondary, t.colors.border), whiteSpace: 'nowrap' },
  filtersGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', alignItems: 'start' },
  preauthList: { display: 'grid', gap: '0.5rem' },
  preauthRow: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.6rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.55rem', alignItems: 'center' },
  rowTitle: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' },
  rowActions: { display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' },
  itemMeta: { display: 'block', fontSize: '0.75rem', color: t.colors.textSecondary, marginTop: '2px' },
  emptyHint: { fontSize: '0.8rem', color: t.colors.textSecondary, padding: '0.5rem 0' },
  emptyState: { border: `1px dashed ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.85rem', display: 'grid', gap: '0.2rem', color: t.colors.textSecondary, fontSize: '0.82rem' },
  detailOverlay: { position: 'fixed', inset: 0, background: 'rgba(15,59,94,0.18)', zIndex: 230, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' },
  detailBox: { width: 'min(620px, 100%)', background: t.colors.white, borderRadius: t.radius.card, boxShadow: t.shadow.modal, padding: '1rem', display: 'grid', gap: '0.8rem' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' },
  detailTitle: { ...t.font.title, margin: '0 0 0.3rem' },
  closeBtn: { border: 'none', background: 'transparent', fontSize: '1.6rem', cursor: 'pointer', color: t.colors.textSecondary },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' },
  noteBox: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.65rem', display: 'grid', gap: '0.25rem', fontSize: '0.84rem' },
};
