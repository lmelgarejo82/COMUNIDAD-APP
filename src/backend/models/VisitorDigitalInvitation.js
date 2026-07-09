const crypto = require('crypto');
const { pool } = require('../db');
const { VisitorAccessLog } = require('./VisitorAccessLog');
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

function normalizeToken(input) {
  const value = String(input || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    const cleaned = value.replace(/^.*\/invitacion\//, '').trim();
    return cleaned || null;
  }
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
  normalizeToken,

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

  async findByTokenForCommunity(tokenInput, communityId) {
    const token = normalizeToken(tokenInput);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const { rows } = await pool.query(
      `SELECT vdi.*,
              CASE
                WHEN vdi.revoked_at IS NOT NULL THEN 'revoked'
                WHEN vdi.expires_at < NOW() THEN 'expired'
                WHEN vp.status = 'used' THEN 'used'
                ELSE 'active'
              END AS status,
              vp.id AS preauthorization_id,
              vp.visitor_name,
              vp.visitor_document,
              vp.visit_type,
              vp.unit_id,
              vp.destination_label,
              vp.authorized_by,
              vp.expected_from,
              vp.expected_until,
              vp.status AS preauthorization_status,
              vp.used_access_log_id,
              CASE
                WHEN vp.status = 'pending' AND vp.expected_until IS NOT NULL AND vp.expected_until < NOW()
                THEN 'expired'
                ELSE vp.status
              END AS preauthorization_effective_status
       FROM visitor_digital_invitations vdi
       JOIN visitor_preauthorizations vp ON vp.id = vdi.preauthorization_id
       WHERE vdi.token_hash = $1
         AND vdi.community_id = $2
         AND vp.community_id = $2`,
      [tokenHash, communityId]
    );
    return rows[0] || null;
  },

  validateInvitationRecord(record) {
    if (!record) {
      const error = new Error('INVITATION_INVALID');
      error.code = 'INVITATION_INVALID';
      throw error;
    }

    if (record.revoked_at || new Date(record.expires_at).getTime() < Date.now()) {
      const error = new Error('INVITATION_INVALID');
      error.code = 'INVITATION_INVALID';
      throw error;
    }

    const preauthStatus = record.preauthorization_effective_status || record.preauthorization_status;
    if (preauthStatus === 'cancelled' || preauthStatus === 'expired') {
      const error = new Error('INVITATION_INVALID');
      error.code = 'INVITATION_INVALID';
      throw error;
    }

    if (preauthStatus !== 'pending' && preauthStatus !== 'used') {
      const error = new Error('INVITATION_INVALID');
      error.code = 'INVITATION_INVALID';
      throw error;
    }

    return record;
  },

  toValidationSummary(record) {
    const document = record.visitor_document ? String(record.visitor_document) : null;
    const maskedDocument = document && document.length > 3
      ? `${'*'.repeat(Math.max(document.length - 3, 0))}${document.slice(-3)}`
      : document;

    return {
      invitation_id: record.id,
      preauthorization_id: record.preauthorization_id,
      visitor_name: record.visitor_name,
      visitor_document: maskedDocument,
      visit_type: record.visit_type,
      unit_id: record.unit_id,
      destination_label: record.destination_label,
      authorized_by: record.authorized_by,
      expected_from: record.expected_from,
      expected_until: record.expected_until,
      status: record.status,
      access_log_id: record.used_access_log_id || null,
    };
  },

  async validateToken({ token, communityId }) {
    const record = await this.findByTokenForCommunity(token, communityId);
    this.validateInvitationRecord(record);
    return this.toValidationSummary(record);
  },

  async useToken({ token, communityId, userId }) {
    const record = await this.findByTokenForCommunity(token, communityId);
    this.validateInvitationRecord(record);

    if (record.preauthorization_status === 'used' && record.used_access_log_id) {
      const visit = await VisitorAccessLog.findByIdForCommunity(record.used_access_log_id, communityId);
      return {
        alreadyUsed: true,
        invitation: this.toValidationSummary(record),
        visit,
      };
    }

    const result = await VisitorPreauthorization.use({
      id: record.preauthorization_id,
      communityId,
      userId,
    });

    return {
      alreadyUsed: Boolean(result?.alreadyUsed),
      invitation: {
        ...this.toValidationSummary(record),
        status: 'used',
        access_log_id: result?.visit?.id || record.used_access_log_id || null,
      },
      visit: result?.visit || null,
      preauthorization: result?.preauthorization || null,
    };
  },
};

module.exports = { VisitorDigitalInvitation };
