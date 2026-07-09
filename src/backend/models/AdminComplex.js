const { pool } = require('../db');

function getQuery(client) {
  return client || pool;
}

const AdminComplex = {
  async addAdminToComplex(adminUserId, complexId, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      `INSERT INTO admin_complexes (user_id, complex_id) VALUES ($1, $2)
       ON CONFLICT (user_id, complex_id) DO NOTHING RETURNING *`,
      [adminUserId, complexId]
    );
    return rows[0] || null;
  },

  async removeAdminFromComplex(adminUserId, complexId, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      'DELETE FROM admin_complexes WHERE user_id = $1 AND complex_id = $2 RETURNING *',
      [adminUserId, complexId]
    );
    return rows[0] || null;
  },

  async findComplexesByAdmin(adminUserId) {
    const { rows } = await pool.query(
      `SELECT cx.id, cx.name, cx.address, cx.community_id, cx.created_at,
              c.name AS community_name, c.address AS community_address,
              o.id AS organization_id, o.name AS organization_name
       FROM complexes cx
       JOIN admin_complexes ac ON ac.complex_id = cx.id
       LEFT JOIN communities c ON c.id = cx.community_id
       LEFT JOIN organizations o ON o.id = c.organization_id
       WHERE ac.user_id = $1
       ORDER BY o.name, c.name, cx.name`,
      [adminUserId]
    );
    return rows;
  },

  async verifyAdminAccess(adminUserId, complexId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM admin_complexes WHERE user_id = $1 AND complex_id = $2 LIMIT 1',
      [adminUserId, complexId]
    );
    return rows.length > 0;
  },

  async getFirstComplexForAdmin(adminUserId) {
    const complexes = await this.findComplexesByAdmin(adminUserId);
    return complexes[0] || null;
  },
};

module.exports = { AdminComplex };
