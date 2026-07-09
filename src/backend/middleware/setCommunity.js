const { User } = require('../models/User');
const { AdminComplex } = require('../models/AdminComplex');
const { pool } = require('../db');

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function isSuperAdmin(userId) {
  const { rows } = await pool.query(
    'SELECT is_super_admin FROM users WHERE id = $1',
    [userId]
  );
  return Boolean(rows[0]?.is_super_admin);
}

async function findAccessibleComplexByCommunity(adminUserId, communityId) {
  const { rows } = await pool.query(
    `SELECT cx.id, cx.community_id
     FROM complexes cx
     JOIN admin_complexes ac ON ac.complex_id = cx.id
     WHERE ac.user_id = $1
       AND cx.community_id = $2
       AND cx.deleted_at IS NULL
     ORDER BY cx.id
     LIMIT 1`,
    [adminUserId, communityId]
  );
  return rows[0] || null;
}

async function findCommunityForComplex(complexId) {
  const { rows } = await pool.query(
    'SELECT id, community_id FROM complexes WHERE id = $1 AND deleted_at IS NULL',
    [complexId]
  );
  return rows[0] || null;
}

async function communityExists(communityId) {
  const { rows } = await pool.query(
    'SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL',
    [communityId]
  );
  return Boolean(rows[0]);
}

async function setCommunity(req, res, next) {
  try {
    const requestedComplexId = req.query.complex ? parsePositiveInt(req.query.complex) : null;
    const requestedCommunityId = req.query.community ? parsePositiveInt(req.query.community) : null;

    if ((req.query.complex && !requestedComplexId) || (req.query.community && !requestedCommunityId)) {
      return res.status(400).json({ error: 'Contexto de comunidad inválido' });
    }

    if (req.user.role === 'admin') {
      const superAdmin = await isSuperAdmin(req.user.id);

      if (requestedComplexId) {
        const complex = await findCommunityForComplex(requestedComplexId);
        if (!complex) return res.status(404).json({ error: 'Complejo no encontrado' });

        const hasAccess = superAdmin || await AdminComplex.verifyAdminAccess(req.user.id, requestedComplexId);
        if (!hasAccess) {
          return res.status(403).json({ error: 'No tenés acceso a este complejo' });
        }

        req.communityId = complex.community_id;
        req.complexId = complex.id;
        req.scope = 'complex';
        return next();
      }

      if (requestedCommunityId) {
        if (!(await communityExists(requestedCommunityId))) {
          return res.status(404).json({ error: 'Comunidad no encontrada' });
        }

        const accessibleComplex = superAdmin
          ? null
          : await findAccessibleComplexByCommunity(req.user.id, requestedCommunityId);
        if (!superAdmin && !accessibleComplex) {
          return res.status(403).json({ error: 'No tenés acceso a esta comunidad' });
        }

        req.communityId = requestedCommunityId;
        if (accessibleComplex) req.complexId = accessibleComplex.id;
        req.scope = 'community';
        return next();
      }

      const firstComplex = await AdminComplex.getFirstComplexForAdmin(req.user.id);
      if (firstComplex) {
        req.communityId = firstComplex.community_id;
        req.complexId = firstComplex.id;
        req.scope = 'complex';
        return next();
      }

      const user = await User.findById(req.user.id);
      if (user?.community_id) {
        req.communityId = user.community_id;
        req.scope = 'legacy-user-community';
        return next();
      }
    }

    const user = await User.findById(req.user.id);
    if (!user?.community_id) {
      return res.status(400).json({ error: 'Comunidad no especificada. Seleccioná una comunidad o complejo.' });
    }

    if (requestedComplexId) {
      return res.status(403).json({ error: 'No tenés acceso a este complejo' });
    }

    if (requestedCommunityId && requestedCommunityId !== user.community_id) {
      return res.status(403).json({ error: 'No tenés acceso a esta comunidad' });
    }

    req.communityId = user.community_id;
    req.scope = 'user-community';
    next();
  } catch (err) {
    console.error('Error en setCommunity:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { setCommunity };
