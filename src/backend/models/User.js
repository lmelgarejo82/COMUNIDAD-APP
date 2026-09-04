const { pool } = require('../db');

function getQuery(client) {
  return client || pool;
}

const User = {
  async findByEmail(email, client = null) {
    const { rows } = await getQuery(client).query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findById(id, client = null) {
    const { rows } = await getQuery(client).query(
      `SELECT usr.id, usr.email, usr.role,
              active.ownership_type AS user_type,
              active.unit_number,
              active.unit_id,
              usr.community_id, usr.created_at
       FROM users usr
       LEFT JOIN LATERAL (
         SELECT uo.ownership_type, un.id AS unit_id, un.unit_code AS unit_number
         FROM unit_ownerships uo
         JOIN units un ON un.id = uo.unit_id
         JOIN floors f ON f.id = un.floor_id
         JOIN buildings b ON b.id = f.building_id
         JOIN complexes cx ON cx.id = b.complex_id
         WHERE uo.user_id = usr.id
           AND uo.unit_id = usr.unit_id
           AND cx.community_id = usr.community_id
           AND (uo.start_date IS NULL OR uo.start_date <= NOW())
           AND (uo.end_date IS NULL OR uo.end_date > NOW())
           AND COALESCE(un.is_active, TRUE) = TRUE
           AND un.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND b.deleted_at IS NULL
           AND cx.deleted_at IS NULL
         LIMIT 1
       ) active ON TRUE
       WHERE usr.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ email, password_hash, role, user_type, unit_number, unit_id, community_id }, client = null) {
    const { rows } = await getQuery(client).query(
      `INSERT INTO users (email, password_hash, role, user_type, unit_number, unit_id, community_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, role, user_type, unit_number, unit_id, community_id, created_at`,
      [email, password_hash, role, user_type === undefined ? 'owner' : user_type, unit_number, unit_id, community_id]
    );
    return rows[0];
  },

  async getAuthVersion(id, client = null) {
    const { rows } = await getQuery(client).query(
      'SELECT auth_version FROM users WHERE id = $1',
      [id]
    );
    return rows[0] ? rows[0].auth_version : null;
  },

  async hasActiveOwnership(userId, communityId, ownershipType, client = null) {
    const { rows } = await getQuery(client).query(
      `SELECT 1
       FROM unit_ownerships uo
       JOIN units un ON un.id = uo.unit_id
       JOIN floors f ON f.id = un.floor_id
       JOIN buildings b ON b.id = f.building_id
       JOIN complexes cx ON cx.id = b.complex_id
       JOIN users usr ON usr.id = uo.user_id AND usr.community_id = cx.community_id
       WHERE uo.user_id = $1
         AND cx.community_id = $2
         AND uo.ownership_type = $3
         AND (uo.start_date IS NULL OR uo.start_date <= NOW())
         AND (uo.end_date IS NULL OR uo.end_date > NOW())
         AND COALESCE(un.is_active, TRUE) = TRUE
         AND un.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND b.deleted_at IS NULL
         AND cx.deleted_at IS NULL
       LIMIT 1`,
      [userId, communityId, ownershipType]
    );
    return Boolean(rows[0]);
  },

  async setResetToken(email, tokenHash, expires) {
    const { rows } = await pool.query(
      `UPDATE users
       SET reset_token_hash = $2, reset_token_expires = $3
       WHERE email = $1
       RETURNING id, email`,
      [email, tokenHash, expires]
    );
    return rows[0] || null;
  },

  async consumeResetToken(tokenHash, passwordHash) {
    const { rows } = await pool.query(
      `UPDATE users
       SET password_hash = $2,
           reset_token_hash = NULL,
           reset_token_expires = NULL,
           auth_version = auth_version + 1
       WHERE reset_token_hash = $1
         AND reset_token_expires > NOW()
       RETURNING id, auth_version`,
      [tokenHash, passwordHash]
    );
    return rows[0] || null;
  },

  async updatePassword(id, password_hash) {
    const { rows } = await pool.query(
      `UPDATE users
       SET password_hash = $2,
           reset_token_hash = NULL,
           reset_token_expires = NULL,
           auth_version = auth_version + 1
       WHERE id = $1
       RETURNING auth_version`,
      [id, password_hash]
    );
    return rows[0] || null;
  },

  async updateProfile(id, { email }) {
    const fields = [];
    const params = [id];
    if (email !== undefined) { fields.push(`email = $${params.length + 1}`); params.push(email); }
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
