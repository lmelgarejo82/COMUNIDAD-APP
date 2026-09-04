const { pool } = require('../db');
const crypto = require('crypto');

const Invite = {
  async create({ email, community_id, unit_id, ownership_type, created_by }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600000);
    const { rows } = await pool.query(
      `INSERT INTO invites (email, community_id, unit_number, unit_id, ownership_type, token, created_by, expires_at)
       SELECT $1, $2, un.unit_code, un.id, $4, $5, $6, $7
       FROM units un
       JOIN floors f ON f.id = un.floor_id
       JOIN buildings b ON b.id = f.building_id
       JOIN complexes cx ON cx.id = b.complex_id
       WHERE un.id = $3
         AND cx.community_id = $2
         AND COALESCE(un.is_active, TRUE) = TRUE
         AND un.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND b.deleted_at IS NULL
         AND cx.deleted_at IS NULL
       RETURNING *`,
      [email, community_id, unit_id, ownership_type, token, created_by, expires]
    );
    return rows[0];
  },

  async findForAcceptance(token, client) {
    const { rows } = await client.query(
      `SELECT i.*, un.unit_code AS resolved_unit_number
       FROM invites i
       JOIN units un ON un.id = i.unit_id
       JOIN floors f ON f.id = un.floor_id
       JOIN buildings b ON b.id = f.building_id
       JOIN complexes cx ON cx.id = b.complex_id
       WHERE i.token = $1
         AND i.used = FALSE
         AND i.expires_at > NOW()
         AND cx.community_id = i.community_id
         AND COALESCE(un.is_active, TRUE) = TRUE
         AND un.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND b.deleted_at IS NULL
         AND cx.deleted_at IS NULL
       FOR UPDATE OF i, un`,
      [token]
    );
    return rows[0] || null;
  },

  async markUsed(id, client) {
    const { rows } = await client.query(
      'UPDATE invites SET used = TRUE WHERE id = $1 AND used = FALSE RETURNING id',
      [id]
    );
    return Boolean(rows[0]);
  }
};

module.exports = { Invite };
