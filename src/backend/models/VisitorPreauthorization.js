const { pool } = require('../db');
const { VisitorAccessLog } = require('./VisitorAccessLog');

const baseSelect = `
  SELECT vp.*,
         c.name AS community_name,
         cx.name AS complex_name,
         u.unit_code,
         b.name AS building_name,
         f.number AS floor_number,
         creator.email AS created_by_email,
         canceller.email AS cancelled_by_email,
         CASE
           WHEN vp.status = 'pending' AND vp.expected_until IS NOT NULL AND vp.expected_until < NOW()
           THEN 'expired'
           ELSE vp.status
         END AS effective_status
  FROM visitor_preauthorizations vp
  JOIN communities c ON c.id = vp.community_id
  LEFT JOIN complexes cx ON cx.id = vp.complex_id
  LEFT JOIN units u ON u.id = vp.unit_id
  LEFT JOIN floors f ON f.id = u.floor_id
  LEFT JOIN buildings b ON b.id = f.building_id
  LEFT JOIN users creator ON creator.id = vp.created_by
  LEFT JOIN users canceller ON canceller.id = vp.cancelled_by
`;

function getQuery(client) {
  return client || pool;
}

function normalizeLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 30;
  return Math.min(parsed, 100);
}

function normalizeOffset(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function findUnitInCommunity(communityId, unitId, client = null) {
  if (!unitId) return null;
  const db = getQuery(client);
  const { rows } = await db.query(
    `SELECT u.id, u.unit_code, cx.id AS complex_id, cx.name AS complex_name
     FROM units u
     JOIN floors f ON f.id = u.floor_id
     JOIN buildings b ON b.id = f.building_id
     JOIN complexes cx ON cx.id = b.complex_id
     WHERE u.id = $1
       AND cx.community_id = $2
       AND COALESCE(u.is_active, TRUE) = TRUE
       AND cx.deleted_at IS NULL`,
    [unitId, communityId]
  );
  return rows[0] || null;
}

async function findComplexInCommunity(communityId, complexId, client = null) {
  if (!complexId) return null;
  const db = getQuery(client);
  const { rows } = await db.query(
    'SELECT id, name FROM complexes WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL',
    [complexId, communityId]
  );
  return rows[0] || null;
}

async function findByIdForCommunity(id, communityId, client = null) {
  const db = getQuery(client);
  const { rows } = await db.query(
    `${baseSelect}
     WHERE vp.id = $1 AND vp.community_id = $2`,
    [id, communityId]
  );
  return rows[0] || null;
}

const VisitorPreauthorization = {
  async validateDestination({ communityId, complexId, unitId }, client = null) {
    let resolvedComplexId = complexId || null;

    if (complexId) {
      const complex = await findComplexInCommunity(communityId, complexId, client);
      if (!complex) {
        const error = new Error('COMPLEX_FORBIDDEN');
        error.code = 'COMPLEX_FORBIDDEN';
        throw error;
      }
    }

    if (unitId) {
      const unit = await findUnitInCommunity(communityId, unitId, client);
      if (!unit) {
        const error = new Error('UNIT_FORBIDDEN');
        error.code = 'UNIT_FORBIDDEN';
        throw error;
      }
      if (complexId && unit.complex_id !== complexId) {
        const error = new Error('UNIT_COMPLEX_MISMATCH');
        error.code = 'UNIT_COMPLEX_MISMATCH';
        throw error;
      }
      resolvedComplexId = unit.complex_id;
    }

    return { complexId: resolvedComplexId, unitId: unitId || null };
  },

  async list(communityId, filters = {}) {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where = ['vp.community_id = $1'];
    const params = [communityId];
    let idx = 2;

    if (filters.status) {
      where.push(`vp.status = $${idx++}`);
      params.push(filters.status);
    }

    if (filters.complex_id) {
      where.push(`vp.complex_id = $${idx++}`);
      params.push(parseInt(filters.complex_id, 10));
    }

    if (filters.search) {
      where.push(`(
        vp.visitor_name ILIKE $${idx}
        OR vp.visitor_document ILIKE $${idx}
        OR vp.vehicle_plate ILIKE $${idx}
        OR vp.destination_label ILIKE $${idx}
        OR u.unit_code ILIKE $${idx}
      )`);
      params.push(`%${String(filters.search).trim()}%`);
      idx += 1;
    }

    params.push(limit, offset);
    const { rows } = await pool.query(
      `${baseSelect}
       WHERE ${where.join(' AND ')}
       ORDER BY vp.created_at DESC, vp.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    return rows;
  },

  async searchPending(communityId, filters = {}) {
    const limit = normalizeLimit(filters.limit || 10);
    const where = [
      'vp.community_id = $1',
      "vp.status = 'pending'",
      '(vp.expected_until IS NULL OR vp.expected_until >= NOW())',
    ];
    const params = [communityId];
    let idx = 2;

    if (filters.complex_id) {
      where.push(`vp.complex_id = $${idx++}`);
      params.push(parseInt(filters.complex_id, 10));
    }

    const search = String(filters.q || filters.search || '').trim();
    if (search) {
      where.push(`(
        vp.visitor_name ILIKE $${idx}
        OR vp.visitor_document ILIKE $${idx}
        OR vp.vehicle_plate ILIKE $${idx}
        OR vp.destination_label ILIKE $${idx}
        OR u.unit_code ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx += 1;
    }

    params.push(limit);
    const { rows } = await pool.query(
      `${baseSelect}
       WHERE ${where.join(' AND ')}
       ORDER BY vp.expected_from NULLS LAST, vp.created_at DESC, vp.id DESC
       LIMIT $${idx}`,
      params
    );
    return rows;
  },

  findByIdForCommunity,

  async create(data) {
    const { complexId, unitId } = await this.validateDestination({
      communityId: data.community_id,
      complexId: data.complex_id,
      unitId: data.unit_id,
    });

    const { rows } = await pool.query(
      `INSERT INTO visitor_preauthorizations (
         community_id, complex_id, unit_id, visitor_name, visitor_document, visitor_phone,
         vehicle_plate, visit_type, destination_label, authorized_by, notes,
         expected_from, expected_until, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        data.community_id,
        complexId,
        unitId,
        data.visitor_name,
        data.visitor_document || null,
        data.visitor_phone || null,
        data.vehicle_plate || null,
        data.visit_type,
        data.destination_label || null,
        data.authorized_by || null,
        data.notes || null,
        data.expected_from || null,
        data.expected_until || null,
        data.created_by || null,
      ]
    );
    return this.findByIdForCommunity(rows[0].id, data.community_id);
  },

  async cancel({ id, communityId, userId }) {
    const { rows } = await pool.query(
      `UPDATE visitor_preauthorizations
       SET status = 'cancelled', cancelled_by = $1, cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $2
         AND community_id = $3
         AND status = 'pending'
       RETURNING id`,
      [userId || null, id, communityId]
    );

    if (!rows[0]) {
      const existing = await this.findByIdForCommunity(id, communityId);
      if (!existing) return null;
      return { ...existing, alreadyFinal: existing.status !== 'pending' };
    }

    return this.findByIdForCommunity(id, communityId);
  },

  async use({ id, communityId, userId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `${baseSelect}
         WHERE vp.id = $1 AND vp.community_id = $2
         FOR UPDATE OF vp`,
        [id, communityId]
      );
      const preauthorization = rows[0] || null;
      if (!preauthorization) {
        await client.query('ROLLBACK');
        return null;
      }

      if (preauthorization.status === 'used' && preauthorization.used_access_log_id) {
        await client.query('COMMIT');
        const visit = await VisitorAccessLog.findByIdForCommunity(preauthorization.used_access_log_id, communityId);
        return { preauthorization, visit, alreadyUsed: true };
      }

      if (preauthorization.status !== 'pending') {
        const error = new Error('PREAUTH_NOT_PENDING');
        error.code = 'PREAUTH_NOT_PENDING';
        throw error;
      }

      if (preauthorization.expected_until && new Date(preauthorization.expected_until).getTime() < Date.now()) {
        await client.query(
          `UPDATE visitor_preauthorizations
           SET status = 'expired', updated_at = NOW()
           WHERE id = $1 AND community_id = $2`,
          [id, communityId]
        );
        const error = new Error('PREAUTH_EXPIRED');
        error.code = 'PREAUTH_EXPIRED';
        throw error;
      }

      const { rows: visitRows } = await client.query(
        `INSERT INTO visitor_access_logs (
           community_id, complex_id, unit_id, visitor_name, visitor_document, visitor_phone,
           vehicle_plate, visit_type, destination_label, authorized_by, notes,
           entry_at, created_by, preauthorization_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13)
         RETURNING id`,
        [
          preauthorization.community_id,
          preauthorization.complex_id,
          preauthorization.unit_id,
          preauthorization.visitor_name,
          preauthorization.visitor_document,
          preauthorization.visitor_phone,
          preauthorization.vehicle_plate,
          preauthorization.visit_type,
          preauthorization.destination_label,
          preauthorization.authorized_by,
          preauthorization.notes,
          userId || null,
          preauthorization.id,
        ]
      );

      await client.query(
        `UPDATE visitor_preauthorizations
         SET status = 'used',
             used_access_log_id = $1,
             used_at = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND community_id = $3`,
        [visitRows[0].id, id, communityId]
      );

      await client.query('COMMIT');

      const [updated, visit] = await Promise.all([
        this.findByIdForCommunity(id, communityId),
        VisitorAccessLog.findByIdForCommunity(visitRows[0].id, communityId),
      ]);
      return { preauthorization: updated, visit, alreadyUsed: false };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = { VisitorPreauthorization };
