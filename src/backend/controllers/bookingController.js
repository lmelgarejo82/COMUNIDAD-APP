const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');

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
    const rows = await Booking.findByUser(req.user.id);
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

    const amenity = await Booking.getAmenityById(amenity_id);
    if (!amenity) {
      return res.status(404).json({ error: 'Amenity no encontrado' });
    }

    const rules = typeof amenity.rules === 'string' ? JSON.parse(amenity.rules) : (amenity.rules || {});
    const maxHours = rules.max_hours || 4;
    const advanceHours = rules.advance_hours || 48;
    const deposit = rules.deposit || 0;

    const from = new Date(date_from);
    const to = new Date(date_to);

    // Validar que date_from < date_to
    if (from >= to) {
      return res.status(400).json({ error: 'La fecha de fin debe ser posterior al inicio' });
    }

    // Validar anticipación mínima
    const hoursUntilStart = (from - new Date()) / (1000 * 60 * 60);
    if (hoursUntilStart < advanceHours) {
      return res.status(400).json({ error: `Debés reservar con al menos ${advanceHours}hs de anticipación` });
    }

    // Validar duración máxima
    const bookingHours = (to - from) / (1000 * 60 * 60);
    if (bookingHours > maxHours) {
      return res.status(400).json({ error: `La reserva no puede superar las ${maxHours}hs` });
    }

    // Validar solapamiento
    const overlapping = await Booking.findOverlapping(amenity_id, from, to);
    if (overlapping) {
      return res.status(409).json({ error: 'El horario seleccionado ya está reservado' });
    }

    const user = await require('../models/User').User.findById(req.user.id);
    const booking = await Booking.create({
      amenity_id,
      user_id: req.user.id,
      unit_number: user.unit_number,
      date_from: from,
      date_to: to,
      deposit_amount: deposit,
      notes: notes || null,
    });

    // Notificar a admins de la comunidad
    const admins = await require('../db').pool.query(
      "SELECT id FROM users WHERE community_id = $1 AND role = 'admin'", [req.communityId]
    );
    for (const admin of admins.rows) {
      await Notification.create({
        user_id: admin.id,
        type: 'booking',
        title: 'Nueva reserva de amenity',
        message: `${user.unit_number || req.user.email} reservó "${amenity.name}" el ${from.toLocaleDateString('es-AR')} de ${from.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} a ${to.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`,
        reference_id: booking.id,
      });
    }

    res.status(201).json(booking);
  } catch (err) {
    console.error('Error en createBooking:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'active', 'finished', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const updated = await Booking.updateStatus(id, status);

    await Notification.create({
      user_id: booking.user_id,
      type: 'booking',
      title: 'Reserva actualizada',
      message: `Tu reserva de "${booking.amenity_name}" fue ${status === 'active' ? 'aprobada' : status}`,
      reference_id: id,
    });

    res.json(updated);
  } catch (err) {
    console.error('Error en updateBookingStatus:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
