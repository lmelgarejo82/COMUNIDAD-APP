const { Ticket } = require('../models/Ticket');
const { Notification } = require('../models/Notification');
const { invalidatePattern } = require('../cache');

exports.create = async (req, res) => {
  try {
    const user = await require('../models/User').User.findById(req.user.id);
    if (user?.community_id !== req.communityId || !user?.unit_number) return res.status(404).json({ error: 'Usuario sin comunidad o unidad asignada' });
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });
    let file_url = null;
    if (req.file) file_url = `/uploads/${req.file.filename}`;
    const ticket = await Ticket.create({ community_id: req.communityId, user_id: req.user.id, unit_number: user.unit_number, title, description: description || null, file_url });
    const admins = await require('../db').pool.query("SELECT id FROM users WHERE community_id = $1 AND role = 'admin'", [req.communityId]);
    for (const admin of admins.rows) {
      await Notification.create({ user_id: admin.id, type: 'ticket_new', title: 'Nuevo ticket', message: `${user.unit_number}: ${title}`, reference_id: ticket.id });
    }
    res.status(201).json(ticket);
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    console.error('Error en create ticket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listAll = async (req, res) => {
  try {
    if (!req.communityId) return res.status(404).json({ error: 'Comunidad no especificada' });
    const { page, limit, status } = req.query;
    const result = await Ticket.findByCommunity(req.communityId, { page, limit, status });
    res.json(result);
  } catch (err) {
    console.error('Error en listAll tickets:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listMy = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await Ticket.findByUser(req.user.id, req.communityId, { page, limit });
    res.json(result);
  } catch (err) {
    console.error('Error en listMy tickets:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['sent', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }
    if (ticket.community_id !== req.communityId) {
      return res.status(403).json({ error: 'No tenés permisos para este ticket' });
    }

    const updated = await Ticket.updateStatus(id, status);

    await Notification.create({
      user_id: ticket.user_id,
      type: 'ticket_update',
      title: 'Ticket actualizado',
      message: `Tu ticket "${ticket.title}" ahora está "${status}"`,
      reference_id: id,
    });

    res.json(updated);
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    console.error('Error en updateStatus:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.addReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const isAdmin = req.user.role === 'admin';

    if (!message) {
      return res.status(400).json({ error: 'message es requerido' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }
    if (ticket.community_id !== req.communityId) {
      return res.status(403).json({ error: 'No tenés permisos para este ticket' });
    }
    if (!isAdmin && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tenés permisos para este ticket' });
    }

    let file_url = null;
    if (req.file) {
      file_url = `/uploads/${req.file.filename}`;
    }

    const reply = await Ticket.addReply({
      ticket_id: id,
      message,
      file_url,
      is_admin: isAdmin,
    });

    if (isAdmin && ticket.user_id !== req.user.id) {
      await Notification.create({
        user_id: ticket.user_id,
        type: 'ticket_reply',
        title: 'Respuesta a tu ticket',
        message: `Nueva respuesta en "${ticket.title}"`,
        reference_id: id,
      });
    }

    // Mark ticket as in_progress if admin replies and it's still 'sent'
    if (isAdmin && ticket.status === 'sent') {
      await Ticket.updateStatus(id, 'in_progress');
    }

    res.status(201).json(reply);
  } catch (err) {
    console.error('Error en addReply:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });
    const ticket = await Ticket.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (ticket.community_id !== req.communityId || (req.user.role !== 'admin' && ticket.user_id !== req.user.id)) {
      return res.status(403).json({ error: 'No tenés permisos para este ticket' });
    }
    if (ticket.status !== 'sent') return res.status(400).json({ error: 'Solo se pueden editar tickets en estado pendiente' });
    const updated = await Ticket.update(id, { title, description });
    res.json(updated);
  } catch (err) {
    console.error('Error en update ticket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
