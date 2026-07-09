const { pool } = require('../db');

function authorize(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (roles.includes(req.user.role)) {
      return next();
    }

    // 'superadmin' is a privilege, not a role. Check is_super_admin flag.
    if (roles.includes('superadmin') && req.user.role === 'admin') {
      const { rows } = await pool.query(
        'SELECT is_super_admin FROM users WHERE id = $1', [req.user.id]
      );
      if (rows[0]?.is_super_admin) {
        return next();
      }
    }

    return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
  };
}

module.exports = { authorize };
