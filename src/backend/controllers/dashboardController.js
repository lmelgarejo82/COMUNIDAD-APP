const { Dashboard } = require('../models/Dashboard');

exports.residente = async (req, res) => {
  try {
    const data = await Dashboard.residente(req.user.id, req.communityId);
    res.json(data);
  } catch (err) {
    console.error('Error en dashboard residente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.admin = async (req, res) => {
  try {
    const data = await Dashboard.admin(req.communityId);
    res.json(data);
  } catch (err) {
    console.error('Error en dashboard admin:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
