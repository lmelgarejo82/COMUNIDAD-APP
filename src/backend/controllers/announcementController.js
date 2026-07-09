const { Announcement } = require('../models/Announcement');
const { Notification } = require('../models/Notification');

exports.create = async (req, res) => {
  try {
    if (!req.communityId) return res.status(404).json({ error: 'Comunidad no especificada' });
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title y message son requeridos' });
    let file_url = null;
    if (req.file) file_url = `/uploads/${req.file.filename}`;
    const announcement = await Announcement.create({ community_id: req.communityId, title, message, file_url, created_by: req.user.id });
    await Notification.createForCommunity(req.communityId, {
      type: 'announcement', title: 'Nuevo anuncio', message: title,
      reference_id: announcement.id, excludeUserId: req.user.id,
    });
    res.status(201).json(announcement);
  } catch (err) {
    console.error('Error en create announcement:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listForAdmin = async (req, res) => {
  try {
    if (!req.communityId) return res.status(404).json({ error: 'Comunidad no especificada' });
    const { page, limit } = req.query;
    const result = await Announcement.findByCommunity(req.communityId, { page, limit });
    res.json(result);
  } catch (err) {
    console.error('Error en list announcements:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listForResident = async (req, res) => {
  try {
    if (!req.communityId) return res.status(404).json({ error: 'Comunidad no especificada' });
    const { page, limit } = req.query;
    const result = await Announcement.getUnreadForUser(req.user.id, req.communityId, { page, limit });
    res.json(result);
  } catch (err) {
    console.error('Error en list announcements resident:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    await Announcement.markAsRead(req.params.id, req.user.id);
    res.json({ message: 'Marcado como leído' });
  } catch (err) {
    console.error('Error en markAsRead:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.delete = async (req, res) => {
  try {
    const deleted = await Announcement.softDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Anuncio no encontrado' });
    res.json({ message: 'Anuncio eliminado' });
  } catch (err) {
    console.error('Error en delete announcement:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
