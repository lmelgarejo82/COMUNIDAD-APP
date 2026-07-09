const { pool } = require('../db');

const Audit = {
  async log({ user_id, action, details, ip_address }) {
    const { rows } = await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, action, JSON.stringify(details || {}), ip_address || null]
    );
    return rows[0];
  },

  async findByCommunity(communityId, { limit = 100, action, from, to } = {}) {
    let query = `SELECT al.*, u.email AS user_email, u.role
                 FROM audit_logs al
                 JOIN users u ON al.user_id = u.id
                 WHERE u.community_id = $1`;
    const params = [communityId];
    let paramIdx = 2;

    if (action) {
      query += ` AND al.action = $${paramIdx++}`;
      params.push(action);
    }
    if (from) {
      query += ` AND al.created_at >= $${paramIdx++}::timestamp`;
      params.push(from);
    }
    if (to) {
      query += ` AND al.created_at <= $${paramIdx++}::timestamp`;
      params.push(to);
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramIdx++}`;
    params.push(parseInt(limit));

    const { rows } = await pool.query(query, params);
    return rows;
  }
};

module.exports = { Audit };
