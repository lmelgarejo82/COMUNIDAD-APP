const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../db');

router.get('/admin/phone', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT phone FROM users WHERE community_id = $1 AND role = 'admin' AND phone IS NOT NULL LIMIT 1",
      [req.user.community_id || (await pool.query('SELECT community_id FROM users WHERE id = $1', [req.user.id])).rows[0]?.community_id]
    );
    // Fallback lookup if community_id not in JWT
    let phone = rows[0]?.phone;
    if (!phone) {
      const uid = req.user.id;
      const { rows: r2 } = await pool.query(
        "SELECT u.phone FROM users u WHERE u.role = 'admin' AND u.community_id = (SELECT community_id FROM users WHERE id = $1) AND u.phone IS NOT NULL LIMIT 1",
        [uid]
      );
      phone = r2[0]?.phone || null;
    }
    res.json({ phone });
  } catch (err) {
    console.error('Error en get admin phone:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
