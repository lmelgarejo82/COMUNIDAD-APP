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
  const [preauthForm, setPreauthForm] = useState({
    visitor_name: '',
    visitor_document: '',
    visitor_phone: '',
    vehicle_plate: '',
    visit_type: 'guest',
    destination_label: '',
    authorized_by: '',
    notes: '',
    expected_from: '',
    expected_until: '',
  });
  const [detailVisit, setDetailVisit] = useState(null);
  const [checkoutVisit, setCheckoutVisit] = useState(null);

  useEffect(() => {
    load();
  }, [activeTab, filters.search, filters.visit_type]);

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
    try {
      const { data } = await accessPreauthorizationService.list({ limit: 30 });
      setPreauths(data.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las preautorizaciones.');
    }
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
      const { data } = await accessPreauthorizationService.create(payload);
      setMessage(data.message);
      setPreauthForm({
        visitor_name: '',
        visitor_document: '',
        visitor_phone: '',
        vehicle_plate: '',
        visit_type: 'guest',
        destination_label: '',
        authorized_by: '',
        notes: '',
        expected_from: '',
        expected_until: '',
      });
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
              onClick={() => {
                setPreauthOpen(prev => !prev);
                if (!preauthOpen) loadPreauthorizations();
              }}
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
          </div>
          <div style={styles.preauthForm}>
            <input value={preauthForm.visitor_name} onChange={(e) => setPreauthForm(p => ({ ...p, visitor_name: e.target.value }))} placeholder="Visitante" style={t.input} />
            <input value={preauthForm.visitor_document} onChange={(e) => setPreauthForm(p => ({ ...p, visitor_document: e.target.value }))} placeholder="Documento" style={t.input} />
            <input value={preauthForm.vehicle_plate} onChange={(e) => setPreauthForm(p => ({ ...p, vehicle_plate: e.target.value.toUpperCase() }))} placeholder="Patente" style={t.input} />
            <select value={preauthForm.visit_type} onChange={(e) => setPreauthForm(p => ({ ...p, visit_type: e.target.value }))} style={t.input}>
              <option value="guest">Visita</option>
              <option value="delivery">Entrega</option>
              <option value="service">Servicio</option>
              <option value="provider">Proveedor</option>
              <option value="other">Otro</option>
            </select>
            <input value={preauthForm.destination_label} onChange={(e) => setPreauthForm(p => ({ ...p, destination_label: e.target.value }))} placeholder="Destino o unidad" style={t.input} />
            <input value={preauthForm.authorized_by} onChange={(e) => setPreauthForm(p => ({ ...p, authorized_by: e.target.value }))} placeholder="Autorizado por" style={t.input} />
            <input type="datetime-local" value={preauthForm.expected_from} onChange={(e) => setPreauthForm(p => ({ ...p, expected_from: e.target.value }))} style={t.input} />
            <input type="datetime-local" value={preauthForm.expected_until} onChange={(e) => setPreauthForm(p => ({ ...p, expected_until: e.target.value }))} style={t.input} />
            <button type="button" onClick={handleCreatePreauthorization} disabled={saving} style={t.primaryBtn}>
              Crear
            </button>
          </div>
          <div style={styles.preauthList}>
            {preauths.length === 0 && <div style={styles.emptyHint}>Todavía no hay preautorizaciones.</div>}
            {preauths.map(item => (
              <div key={item.id} style={styles.preauthRow}>
                <div>
                  <strong>{item.visitor_name}</strong>
                  <span style={styles.itemMeta}>
                    {item.destination_label || item.unit_code || 'Sin destino'} · {item.effective_status || item.status}
                  </span>
                  <span style={styles.itemMeta}>
                    {item.expected_from ? new Date(item.expected_from).toLocaleString('es-AR') : 'Sin horario definido'}
                    {item.authorized_by ? ` · Autorizado por ${item.authorized_by}` : ''}
                  </span>
                </div>
                {item.status === 'pending' && (
                  <button type="button" onClick={() => handleCancelPreauthorization(item)} disabled={saving} style={t.secondaryBtn}>
                    Cancelar
                  </button>
                )}
              </div>
            ))}
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
    </div>
  );
}

const styles = {
  headerActions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' },
  preauthAdmin: { ...t.card, padding: '0.9rem', marginBottom: '0.75rem', display: 'grid', gap: '0.7rem' },
  preauthHeader: { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' },
  sectionTitle: { ...t.sectionTitle, margin: 0 },
  preauthForm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.5rem', alignItems: 'start' },
  preauthList: { display: 'grid', gap: '0.5rem' },
  preauthRow: { border: `1px solid ${t.colors.border}`, borderRadius: t.radius.input, padding: '0.6rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.55rem', alignItems: 'center' },
  itemMeta: { display: 'block', fontSize: '0.75rem', color: t.colors.textSecondary, marginTop: '2px' },
  emptyHint: { fontSize: '0.8rem', color: t.colors.textSecondary, padding: '0.5rem 0' },
};
