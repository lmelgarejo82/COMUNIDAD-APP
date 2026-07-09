const crypto = require('crypto');
const { pool } = require('../db');
const { VisitorPreauthorization } = require('./VisitorPreauthorization');

const DEFAULT_TOKEN_TTL_HOURS = 24;

const baseSelect = `
  SELECT vdi.*,
         CASE
           WHEN vdi.revoked_at IS NOT NULL THEN 'revoked'
           WHEN vdi.expires_at < NOW() THEN 'expired'
           ELSE 'active'
         END AS status,
         creator.email AS created_by_email,
         revoker.email AS revoked_by_email
  FROM visitor_digital_invitations vdi
  LEFT JOIN users creator ON creator.id = vdi.created_by
  LEFT JOIN users revoker ON revoker.id = vdi.revoked_by
`;

function hashToken(token) {
  const secret = process.env.JWT_SECRET || process.env.INVITATION_TOKEN_SECRET;
  if (secret) {
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function resolveExpiration(preauthorization, requestedExpiresAt = null) {
  const now = Date.now();
  const requested = requestedExpiresAt ? new Date(requestedExpiresAt) : null;
  if (requested && Number.isFinite(requested.getTime())) return requested;

  const expectedUntil = preauthorization.expected_until ? new Date(preauthorization.expected_until) : null;
  if (expectedUntil && expectedUntil.getTime() > now) return expectedUntil;

  return new Date(now + DEFAULT_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

async function getPendingPreauthorization(id, communityId) {
  const preauthorization = await VisitorPreauthorization.findByIdForCommunity(id, communityId);
  if (!preauthorization) return null;

  const effectiveStatus = preauthorization.effective_status || preauthorization.status;
  if (effectiveStatus !== 'pending') {
    const error = new Error('PREAUTH_NOT_PENDING');
    error.code = 'PREAUTH_NOT_PENDING';
    error.preauthorization = preauthorization;
    throw error;
  }

  return preauthorization;
}

const VisitorDigitalInvitation = {
  hashToken,

  async list({ preauthorizationId, communityId }) {
    const { rows } = await pool.query(
      `${baseSelect}
       WHERE vdi.preauthorization_id = $1
         AND vdi.community_id = $2
       ORDER BY vdi.created_at DESC, vdi.id DESC`,
      [preauthorizationId, communityId]
    );
    return rows;
  },

  async create({ preauthorizationId, communityId, userId, expiresAt = null }) {
    const preauthorization = await getPendingPreauthorization(preauthorizationId, communityId);
    if (!preauthorization) return null;

    const expiration = resolveExpiration(preauthorization, expiresAt);
    if (expiration.getTime() <= Date.now()) {
      const error = new Error('INVITATION_EXPIRATION_INVALID');
      error.code = 'INVITATION_EXPIRATION_INVALID';
      throw error;
    }

    const token = createToken();
    const tokenHash = hashToken(token);
    const tokenHint = token.slice(0, 8);

    const { rows } = await pool.query(
      `INSERT INTO visitor_digital_invitations (
         community_id, preauthorization_id, token_hash, token_hint, expires_at, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [communityId, preauthorizationId, tokenHash, tokenHint, expiration.toISOString(), userId || null]
    );

    const invitation = await this.findByIdForCommunity(rows[0].id, preauthorizationId, communityId);
    return { invitation, token };
  },

  async findByIdForCommunity(id, preauthorizationId, communityId) {
    const { rows } = await pool.query(
      `${baseSelect}
       WHERE vdi.id = $1
         AND vdi.preauthorization_id = $2
         AND vdi.community_id = $3`,
      [id, preauthorizationId, communityId]
    );
    return rows[0] || null;
  },

  async revoke({ id, preauthorizationId, communityId, userId }) {
    const existing = await this.findByIdForCommunity(id, preauthorizationId, communityId);
    if (!existing) return null;
    if (existing.revoked_at) return { ...existing, alreadyRevoked: true };

    await pool.query(
      `UPDATE visitor_digital_invitations
       SET revoked_at = NOW(), revoked_by = $1, updated_at = NOW()
       WHERE id = $2
         AND preauthorization_id = $3
         AND community_id = $4
         AND revoked_at IS NULL`,
      [userId || null, id, preauthorizationId, communityId]
    );

    return this.findByIdForCommunity(id, preauthorizationId, communityId);
  },
};

module.exports = { VisitorDigitalInvitation };
