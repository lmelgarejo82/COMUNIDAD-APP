const { pool } = require('../db');

const User = {
  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT id, email, role, user_type, unit_number, community_id, created_at FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create({ email, password_hash, role, user_type, unit_number, community_id }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, user_type, unit_number, community_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, user_type, unit_number, community_id, created_at`,
      [email, password_hash, role, user_type || 'owner', unit_number, community_id]
    );
    return rows[0];
  },

  async setResetToken(email, token, expires) {
    const { rowCount } = await pool.query(
      'UPDATE users SET reset_token = $2, reset_token_expires = $3 WHERE email = $1',
      [email, token, expires]
    );
    return rowCount > 0;
  },

  async findByResetToken(token) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    return rows[0] || null;
  },

  async updatePassword(id, password_hash) {
    const { rowCount } = await pool.query(
      'UPDATE users SET password_hash = $2, reset_token = NULL, reset_token_expires = NULL WHERE id = $1',
      [id, password_hash]
    );
    return rowCount > 0;
  },

  async updateProfile(id, { email, unit_number }) {
    const fields = [];
    const params = [id];
    if (email !== undefined) { fields.push(`email = $${params.length + 1}`); params.push(email); }
    if (unit_number !== undefined) { fields.push(`unit_number = $${params.length + 1}`); params.push(unit_number); }
    if (fields.length === 0) return null;
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $1 RETURNING id, email, role, unit_number, community_id, created_at`,
      params
    );
    return rows[0] || null;
  }
};

const Community = {
  async findByAccessCode(code) {
    const { rows } = await pool.query('SELECT * FROM communities WHERE access_code = $1', [code]);
    return rows[0] || null;
  }
};

module.exports = { User, Community };
