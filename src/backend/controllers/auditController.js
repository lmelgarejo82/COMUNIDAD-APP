const { Audit } = require('../models/Audit');

exports.list = async (req, res) => {
  try {
    const { action, from, to, limit } = req.query;
    const rows = await Audit.findByCommunity(req.communityId, { action, from, to, limit: limit || 100 });
    res.json(rows);
  } catch (err) {
    console.error('Error en audit list:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
