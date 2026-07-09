import { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { bookingService } from '../services/bookings';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/errors';
import Spinner from '../components/Spinner';

moment.locale('es', {
  months: 'enero_febrero_marzo_abril_mayo_junio_julio_agosto_septiembre_octubre_noviembre_diciembre'.split('_'),
  monthsShort: 'ene_feb_mar_abr_may_jun_jul_ago_sep_oct_nov_dic'.split('_'),
  weekdays: 'domingo_lunes_martes_miércoles_jueves_viernes_sábado'.split('_'),
  weekdaysShort: 'dom_lun_mar_mié_jue_vie_sáb'.split('_'),
  weekdaysMin: 'do_lu_ma_mi_ju_vi_sá'.split('_'),
});
const localizer = momentLocalizer(moment);

const STATUS_COLORS = {
  pending: '#fd7e14',
  active: '#198754',
  finished: '#6c757d',
  cancelled: '#dc3545',
};

export default function Amenities() {
  const { user } = useAuth();
  const [amenities, setAmenities] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ amenity_id: '', notes: '' });
  const [msg, setMsg] = useState('');

  const isAdmin = user?.role === 'admin';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [amenitiesRes, bookingsRes] = await Promise.all([
        bookingService.getAmenities(),
        isAdmin ? bookingService.listBookings() : bookingService.listMy(),
      ]);
      setAmenities(amenitiesRes.data);
      const rows = isAdmin ? bookingsRes.data.data || [] : bookingsRes.data;
      const evts = rows.map((b) => ({
        id: b.id,
        title: `${b.amenity_name || 'Amenity'} — ${b.unit_number || b.user_email}`,
        start: new Date(b.date_from),
        end: new Date(b.date_to),
        resource: b,
      }));
      setEvents(evts);
    } catch {
      setMsg('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleSelectSlot({ start, end }) {
    setSelectedSlot({ start, end });
    setShowForm(true);
    setMsg('');
  }

  function handleSelectEvent(event) {
    const b = event.resource;
    if (isAdmin) {
      const actions = [];
      if (b.status === 'pending') actions.push('active');
      actions.push('cancelled');
      if (b.status === 'active') actions.push('finished');
      const next = actions[0];
      if (next && window.confirm(`¿Cambiar estado a "${next}"?`)) {
        bookingService.updateStatus(b.id, next).then(loadData);
      }
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMsg('');
    try {
      await bookingService.create({
        amenity_id: parseInt(form.amenity_id),
        date_from: selectedSlot.start.toISOString(),
        date_to: selectedSlot.end.toISOString(),
        notes: form.notes,
      });
      setMsg('Reserva creada. El admin la revisará.');
      setShowForm(false);
      setForm({ amenity_id: '', notes: '' });
      loadData();
    } catch (err) {
      setMsg(getErrorMessage(err, 'Error al crear reserva'));
    }
  }

  function eventPropGetter(event) {
    const status = event.resource?.status || 'pending';
    return {
      style: {
        backgroundColor: STATUS_COLORS[status] || '#0d6efd',
        borderRadius: '4px',
        opacity: status === 'cancelled' ? 0.5 : 0.9,
        color: '#fff',
        border: 'none',
        fontSize: '0.75rem',
        padding: '2px 4px',
      },
    };
  }

  if (loading) return <div style={s.container}><Spinner /></div>;

  return (
    <div style={s.container}>
      <h2 style={s.heading}>{isAdmin ? 'Reservas de Amenities' : 'Reservar Amenity'}</h2>
      {msg && <p style={s.msg}>{msg}</p>}

      <div style={s.calendarWrap}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          selectable={!isAdmin}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          style={{ height: 500 }}
          views={['month', 'week', 'day']}
          messages={{
            today: 'Hoy',
            previous: 'Anterior',
            next: 'Siguiente',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
          }}
        />
      </div>

      {!isAdmin && (
        <div style={s.legend}>
          <span><span style={{ ...s.dot, background: STATUS_COLORS.pending }} /> Pendiente</span>
          <span><span style={{ ...s.dot, background: STATUS_COLORS.active }} /> Aprobada</span>
          <span><span style={{ ...s.dot, background: STATUS_COLORS.finished }} /> Finalizada</span>
          <span><span style={{ ...s.dot, background: STATUS_COLORS.cancelled }} /> Cancelada</span>
        </div>
      )}

      {isAdmin && amenities.length > 0 && (
        <div style={s.amenityList}>
          <h3 style={s.subheading}>Amenities</h3>
          {amenities.map((a) => (
            <div key={a.id} style={s.amenityCard}>
              <strong>{a.name}</strong>
              <p style={s.amenityDesc}>{a.description}</p>
              <small style={s.amenityRules}>
                Máx. {a.rules?.max_hours || 4}hs · Anticipación: {a.rules?.advance_hours || 48}hs · Depósito: ${a.rules?.deposit || 0}
              </small>
            </div>
          ))}
        </div>
      )}

      {showForm && !isAdmin && (
        <div style={s.overlay} onClick={() => setShowForm(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Nueva reserva</h3>
            <p style={s.modalInfo}>
              {selectedSlot?.start.toLocaleString('es-AR')} → {selectedSlot?.end.toLocaleString('es-AR')}
            </p>
            <form onSubmit={handleCreate}>
              <label style={s.label}>Amenity</label>
              <select value={form.amenity_id} onChange={(e) => setForm({ ...form, amenity_id: e.target.value })} required style={s.select}>
                <option value="">Seleccionar...</option>
                {amenities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label style={s.label}>Notas (opcional)</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...s.input, resize: 'vertical' }} />
              <button type="submit" style={s.submitBtn}>Reservar</button>
              <button type="button" onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { padding: '1rem 1.5rem 3rem', maxWidth: '1100px', margin: '0 auto' },
  heading: { fontSize: '1.5rem', color: '#2c3e50', marginBottom: '1rem' },
  msg: { background: '#d1e7dd', color: '#0f5132', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '0.75rem' },
  calendarWrap: { background: '#fff', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  legend: { display: 'flex', gap: '1.25rem', padding: '0.75rem 0', flexWrap: 'wrap', fontSize: '0.8rem', color: '#6c757d' },
  dot: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', marginRight: '0.3rem', verticalAlign: 'middle' },
  amenityList: { marginTop: '1.5rem' },
  subheading: { fontSize: '1.1rem', color: '#2c3e50', marginBottom: '0.75rem' },
  amenityCard: { background: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '0.5rem' },
  amenityDesc: { fontSize: '0.85rem', color: '#6c757d', marginTop: '0.25rem' },
  amenityRules: { fontSize: '0.75rem', color: '#adb5bd' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', padding: '1.5rem', borderRadius: '8px', maxWidth: '450px', width: '95%' },
  modalTitle: { marginBottom: '0.5rem' },
  modalInfo: { fontSize: '0.85rem', color: '#6c757d', marginBottom: '1rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#495057', display: 'block', marginBottom: '0.2rem' },
  select: { width: '100%', padding: '0.5rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '0.75rem', boxSizing: 'border-box' },
  input: { width: '100%', padding: '0.5rem', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '0.75rem', boxSizing: 'border-box' },
  submitBtn: { padding: '0.6rem 1.25rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', marginRight: '0.5rem', minHeight: '44px' },
  cancelBtn: { padding: '0.6rem 1.25rem', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', minHeight: '44px' },
};
