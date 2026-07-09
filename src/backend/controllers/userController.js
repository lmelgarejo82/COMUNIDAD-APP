const { User } = require('../models/User');
const bcrypt = require('bcryptjs');

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    console.error('Error en me:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const { email, currentPassword, newPassword, unit_number } = req.body;

    const user = await User.findByEmail(req.user.email);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (email) {
      const existing = await User.findByEmail(email);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ error: 'El email ya está en uso' });
      }
      await User.updateProfile(user.id, { email, unit_number: unit_number || user.unit_number });
    } else if (unit_number) {
      await User.updateProfile(user.id, { unit_number });
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'La contraseña actual es requerida para cambiarla' });
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      const hash = await bcrypt.hash(newPassword, 10);
      await User.updatePassword(user.id, hash);
    }

    const updated = await User.findById(req.user.id);
    res.json(updated);
  } catch (err) {
    console.error('Error en updateMe:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
