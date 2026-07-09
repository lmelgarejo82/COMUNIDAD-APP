const { Notification } = require('../models/Notification');

exports.list = async (req, res) => {
  try {
    const notifications = await Notification.findByUser(req.user.id);
    res.json(notifications);
  } catch (err) {
    console.error('Error en list notifications:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.count = async (req, res) => {
  try {
    const count = await Notification.countUnread(req.user.id);
    res.json({ count });
  } catch (err) {
    console.error('Error en count notifications:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.markAsRead(id, req.user.id);
    if (!notif) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    res.json(notif);
  } catch (err) {
    console.error('Error en markRead:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.markAllAsRead(req.user.id);
    res.json({ message: 'Todas las notificaciones marcadas como leídas' });
  } catch (err) {
    console.error('Error en markAllRead:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
