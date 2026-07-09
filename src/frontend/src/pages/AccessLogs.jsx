import { useEffect, useState } from 'react';
import t from '../theme';
import { accessLogService } from '../services/accessLogs';
import AccessKpiCard from '../components/access/AccessKpiCard';
import AccessTabs from '../components/access/AccessTabs';
import AccessFilters from '../components/access/AccessFilters';
import AccessVisitorList from '../components/access/AccessVisitorList';
import CheckInPanel from '../components/access/CheckInPanel';
import VisitDetailPanel from '../components/access/VisitDetailPanel';
import ConfirmCheckoutModal from '../components/access/ConfirmCheckoutModal';

export default function AccessLogs() {
  const [activeTab, setActiveTab] = useState('inside');
  const [filters, setFilters] = useState({ search: '', visit_type: '' });
  const [visits, setVisits] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [checkInOpen, setCheckInOpen] = useState(false);
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
        <button type="button" onClick={() => setCheckInOpen(true)} style={t.primaryBtn}>
          Registrar ingreso
        </button>
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

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <AccessTabs active={activeTab} onChange={setActiveTab} />
        <AccessFilters filters={filters} onChange={setFilters} onClear={() => setFilters({ search: '', visit_type: '' })} />
      </div>

      <AccessVisitorList visits={visits} loading={loading} error={error && !message ? error : ''} onSelect={setDetailVisit} />

      <CheckInPanel open={checkInOpen} onClose={() => setCheckInOpen(false)} onSubmit={handleCheckIn} saving={saving} />
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
