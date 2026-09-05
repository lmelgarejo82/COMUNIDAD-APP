const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const { pool } = require('../db');

const transitions = { pending: ['active', 'cancelled'], active: ['finished', 'cancelled'] };
const statusLabels = { active: 'aprobada', finished: 'finalizada', cancelled: 'cancelada' };
const conflict = () => Object.assign(new Error('La reserva cambió de estado o la transición no está permitida'), { status: 409 });
const missingAmenity = () => Object.assign(new Error('Amenity no encontrado'), { status: 404 });

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

exports.listBookings = async (req, res) => {
  try {
    const { page, limit, status, amenity_id } = req.query;
    const result = await Booking.findByCommunity(req.communityId, { page, limit, status, amenity_id });
    res.json(result);
  } catch (err) {
    console.error('Error en listBookings:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.myBookings = async (req, res) => {
  try {
    const rows = await Booking.findByUser(req.user.id, req.communityId);
    res.json(rows);
  } catch (err) {
    console.error('Error en myBookings:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getAmenities = async (req, res) => {
  try {
    const amenities = await Booking.getAmenities(req.communityId);
    res.json(amenities);
  } catch (err) {
    console.error('Error en getAmenities:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createBooking = async (req, res) => {
  try {
    const { amenity_id, date_from, date_to, notes } = req.body;

    if (!amenity_id || !date_from || !date_to) {
      return res.status(400).json({ error: 'amenity_id, date_from y date_to son requeridos' });
    }

    const from = new Date(date_from);
    const to = new Date(date_to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
      return res.status(400).json({ error: 'Las fechas de la reserva no son válidas' });
    }
    const booking = await transaction(async client => {
      // Create and status changes take the same amenity lock before touching bookings.
      const amenity = await Booking.getAmenityById(amenity_id, req.communityId, client);
      if (!amenity) {
        throw missingAmenity();
      }

      const rules = typeof amenity.rules === 'string' ? JSON.parse(amenity.rules) : (amenity.rules || {});
      const maxHours = rules.max_hours || 4;
      const advanceHours = rules.advance_hours || 48;
      const deposit = rules.deposit || 0;

      // Validar que date_from < date_to
      if (from >= to) {
        throw Object.assign(new Error('La fecha de fin debe ser posterior al inicio'), { status: 400 });
      }

      // Validar anticipación mínima
      const hoursUntilStart = (from - new Date()) / (1000 * 60 * 60);
      if (hoursUntilStart < advanceHours) {
        throw Object.assign(new Error(`Debés reservar con al menos ${advanceHours}hs de anticipación`), { status: 400 });
      }

      // Validar duración máxima
      const bookingHours = (to - from) / (1000 * 60 * 60);
      if (bookingHours > maxHours) {
        throw Object.assign(new Error(`La reserva no puede superar las ${maxHours}hs`), { status: 400 });
      }

      // Validar solapamiento
      const overlapping = await Booking.findOverlapping(amenity_id, from, to, null, client);
      if (overlapping) {
        throw Object.assign(new Error('El horario seleccionado ya está reservado'), { status: 409 });
      }

      const user = await require('../models/User').User.findById(req.user.id, client);
      const booking = await Booking.create({
        amenity_id,
        community_id: req.communityId,
        user_id: req.user.id,
        unit_number: user.unit_number,
        date_from: from,
        date_to: to,
        deposit_amount: deposit,
        notes: notes || null,
      }, client);
      if (!booking) {
        throw missingAmenity();
      }

      // Notificar a admins de la comunidad
      const admins = await client.query(
        "SELECT id FROM users WHERE community_id = $1 AND role = 'admin'", [req.communityId]
      );
      for (const admin of admins.rows) {
        await Notification.create({
          user_id: admin.id,
          type: 'booking',
          title: 'Nueva reserva de amenity',
          message: `${user.unit_number || req.user.email} reservó "${amenity.name}" el ${from.toLocaleDateString('es-AR')} de ${from.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} a ${to.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`,
          reference_id: booking.id,
        }, client);
      }
      return booking;
    });
    res.status(201).json(booking);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error en createBooking:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, expected_status } = req.body;

    if (!['pending', 'active', 'finished', 'cancelled'].includes(status)
      || !['pending', 'active', 'finished', 'cancelled'].includes(expected_status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const updated = await transaction(async client => {
      const booking = await Booking.findById(id, req.communityId, client);
      if (!booking) {
        throw Object.assign(new Error('Reserva no encontrada'), { status: 404 });
      }
      if (booking.status !== expected_status || !transitions[expected_status]?.includes(status)) throw conflict();
      if (!await Booking.getAmenityById(booking.amenity_id, req.communityId, client)) throw missingAmenity();
      const updated = await Booking.updateStatus(id, status, req.communityId, expected_status, client);
      if (!updated) {
        throw conflict();
      }

      await Notification.create({
        user_id: booking.user_id,
        type: 'booking',
        title: 'Reserva actualizada',
        message: `Tu reserva de "${booking.amenity_name}" fue ${statusLabels[status]}`,
        reference_id: id,
      }, client);
      return updated;
    });
    res.json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error en updateBookingStatus:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
