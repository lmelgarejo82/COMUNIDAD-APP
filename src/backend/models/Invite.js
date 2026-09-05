const { pool } = require('../db');
const crypto = require('crypto');

function normalizeToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function rollback(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    console.error('Error en rollback de invitación.');
  }
}

const Invite = {
  async create({ email, community_id, unit_id, ownership_type, created_by }) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expires = new Date(Date.now() + 7 * 24 * 3600000);
    const { rows } = await pool.query(
      `INSERT INTO invites (email, community_id, unit_number, unit_id, ownership_type, token_hash, created_by, expires_at)
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
       RETURNING id, email, community_id, unit_number, unit_id, ownership_type,
                 created_by, used, expires_at, created_at`,
      [email, community_id, unit_id, ownership_type, tokenHash, created_by, expires]
    );
    return rows[0] ? { ...rows[0], token } : undefined;
  },

  async listByCommunity(communityId) {
    const { rows } = await pool.query(
      `SELECT i.id, i.email, i.unit_id, i.unit_number, i.ownership_type,
              i.expires_at, i.used, i.created_at,
              CASE
                WHEN i.used IS TRUE THEN 'used'
                WHEN i.expires_at <= NOW() THEN 'expired'
                ELSE 'pending'
              END AS status
         FROM invites i
        WHERE i.community_id = $1
        ORDER BY i.created_at DESC, i.id DESC`,
      [communityId]
    );
    return rows;
  },

  async rotatePending(id, communityId) {
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const { rows } = await client.query(
        `SELECT i.id, i.email, i.community_id, i.unit_id, i.unit_number,
                i.ownership_type, i.expires_at, i.used, i.created_at
           FROM invites i
           JOIN units un ON un.id = i.unit_id
           JOIN floors f ON f.id = un.floor_id
           JOIN buildings b ON b.id = f.building_id
           JOIN complexes cx ON cx.id = b.complex_id
          WHERE i.id = $1
            AND i.community_id = $2
            AND i.used IS NOT TRUE
            AND i.expires_at > NOW()
            AND cx.community_id = $2
            AND COALESCE(un.is_active, TRUE) = TRUE
            AND un.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND b.deleted_at IS NULL
            AND cx.deleted_at IS NULL
          FOR UPDATE OF i, un`,
        [id, communityId]
      );
      if (!rows[0]) {
        await rollback(client);
        transactionOpen = false;
        return null;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600000);
      const update = await client.query(
        `UPDATE invites
            SET token_hash = $1, expires_at = $2
          WHERE id = $3 AND community_id = $4 AND used IS NOT TRUE
          RETURNING id, email, community_id, unit_id, unit_number,
                    ownership_type, expires_at, used, created_at`,
        [hashToken(token), expiresAt, id, communityId]
      );
      if (!update.rows[0]) throw new Error('INVITE_ROTATION_LOST');
      await client.query('COMMIT');
      transactionOpen = false;
      return { ...update.rows[0], status: 'pending', token };
    } catch (err) {
      if (transactionOpen) await rollback(client);
      throw err;
    } finally {
      client.release();
    }
  },

  async findForAcceptance(tokenInput, client) {
    const token = normalizeToken(tokenInput);
    if (!token) return null;

    const { rows } = await client.query(
      `SELECT i.id, i.email, i.community_id, i.unit_number, i.unit_id,
              i.ownership_type, i.created_by, i.used, i.expires_at, i.created_at,
              un.unit_code AS resolved_unit_number
       FROM invites i
       JOIN units un ON un.id = i.unit_id
       JOIN floors f ON f.id = un.floor_id
       JOIN buildings b ON b.id = f.building_id
       JOIN complexes cx ON cx.id = b.complex_id
       WHERE i.token_hash = $1
         AND i.used = FALSE
         AND i.expires_at > NOW()
         AND cx.community_id = i.community_id
         AND COALESCE(un.is_active, TRUE) = TRUE
         AND un.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND b.deleted_at IS NULL
         AND cx.deleted_at IS NULL
       FOR UPDATE OF i, un`,
      [hashToken(token)]
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
