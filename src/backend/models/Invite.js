const { pool } = require('../db');
const crypto = require('crypto');
const { Hierarchy } = require('./Hierarchy');

const Invite = {
  async create({ email, community_id, unit_number, created_by }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600000);
    const unitId = await Hierarchy.resolveUnitId(community_id, unit_number);
    const { rows } = await pool.query(
      `INSERT INTO invites (email, community_id, unit_number, unit_id, token, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [email, community_id, unit_number, unitId, token, created_by, expires]
    );
    return rows[0];
  },

  async findByToken(token) {
    const { rows } = await pool.query(
      'SELECT * FROM invites WHERE token = $1 AND used = FALSE AND expires_at > NOW()', [token]
    );
    return rows[0] || null;
  },

  async markUsed(token) {
    await pool.query("UPDATE invites SET used = TRUE WHERE token = $1", [token]);
  }
};

module.exports = { Invite };
