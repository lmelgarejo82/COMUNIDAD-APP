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
import PreauthorizationAdminPanel from '../components/access/preauthorizations/PreauthorizationAdminPanel';
import {
  preauthInitialFilters,
  preauthInitialForm,
  toApiDateTime,
} from '../components/access/preauthorizations/preauthorizationUtils';

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
      if (preauthDetail?.id === item.id) setPreauthDetail(null);
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
        <PreauthorizationAdminPanel
          items={preauths}
          loading={preauthLoading}
          saving={saving}
          filters={preauthFilters}
          form={preauthForm}
          detail={preauthDetail}
          onRefresh={loadPreauthorizations}
          onFilterChange={setPreauthFilters}
          onFormChange={setPreauthForm}
          onFormReset={() => setPreauthForm(preauthInitialForm)}
          onCreate={handleCreatePreauthorization}
          onCancel={handleCancelPreauthorization}
          onDetail={setPreauthDetail}
          onCloseDetail={() => setPreauthDetail(null)}
        />
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
};
