const { pool } = require('../db');

const DELAYED_HOURS = 4;

const baseSelect = `
  SELECT val.*,
         c.name AS community_name,
         cx.name AS complex_name,
         u.unit_code,
         b.name AS building_name,
         f.number AS floor_number,
         creator.email AS created_by_email,
         exiter.email AS exited_by_email,
         canceller.email AS cancelled_by_email,
         observer.email AS observed_by_email,
         (val.observed_at IS NOT NULL) AS is_observed,
         (
           val.status = 'inside'
           AND val.entry_at <= NOW() - ($1::int * INTERVAL '1 hour')
         ) AS is_delayed
  FROM visitor_access_logs val
  JOIN communities c ON c.id = val.community_id
  LEFT JOIN complexes cx ON cx.id = val.complex_id
  LEFT JOIN units u ON u.id = val.unit_id
  LEFT JOIN floors f ON f.id = u.floor_id
  LEFT JOIN buildings b ON b.id = f.building_id
  LEFT JOIN users creator ON creator.id = val.created_by
  LEFT JOIN users exiter ON exiter.id = val.exited_by
  LEFT JOIN users canceller ON canceller.id = val.cancelled_by
  LEFT JOIN users observer ON observer.id = val.observed_by
`;

function normalizeLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 100);
}

function normalizeOffset(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function buildWhere(communityId, filters = {}, startIndex = 2) {
  const where = ['val.community_id = $' + startIndex];
  const params = [communityId];
  let idx = startIndex + 1;

  if (filters.view === 'inside') {
    where.push("val.status = 'inside'");
  } else if (filters.view === 'history') {
    where.push("val.status IN ('exited', 'cancelled')");
  } else if (filters.view === 'observed') {
    where.push(`(val.observed_at IS NOT NULL OR (val.status = 'inside' AND val.entry_at <= NOW() - ($1::int * INTERVAL '1 hour')))`);
  }

  if (filters.status && ['inside', 'exited', 'cancelled'].includes(filters.status)) {
    where.push(`val.status = $${idx++}`);
    params.push(filters.status);
  }

  if (filters.visit_type) {
    where.push(`val.visit_type = $${idx++}`);
    params.push(filters.visit_type);
  }

  if (filters.complex_id) {
    where.push(`val.complex_id = $${idx++}`);
    params.push(parseInt(filters.complex_id, 10));
  }

  if (filters.unit_id) {
    where.push(`val.unit_id = $${idx++}`);
    params.push(parseInt(filters.unit_id, 10));
  }

  if (filters.date_from) {
    where.push(`val.entry_at >= $${idx++}`);
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    where.push(`val.entry_at < ($${idx++}::date + INTERVAL '1 day')`);
    params.push(filters.date_to);
  }

  if (filters.search) {
    where.push(`(
      val.visitor_name ILIKE $${idx}
      OR val.visitor_document ILIKE $${idx}
      OR val.vehicle_plate ILIKE $${idx}
      OR val.destination_label ILIKE $${idx}
      OR u.unit_code ILIKE $${idx}
    )`);
    params.push(`%${filters.search}%`);
    idx += 1;
  }

  return { where, params, nextIndex: idx };
}

const VisitorAccessLog = {
  DELAYED_HOURS,

  async list(communityId, filters = {}) {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const { where, params, nextIndex } = buildWhere(communityId, filters);
    const listParams = [DELAYED_HOURS, ...params, limit, offset];

    const dataQuery = `
      ${baseSelect}
      WHERE ${where.join(' AND ')}
      ORDER BY val.entry_at DESC, val.id DESC
      LIMIT $${nextIndex} OFFSET $${nextIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM visitor_access_logs val
      LEFT JOIN units u ON u.id = val.unit_id
      WHERE ${where.join(' AND ')}
        AND $1::int IS NOT NULL
    `;

    const kpiQuery = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'inside')::int AS inside,
        COUNT(*) FILTER (WHERE entry_at::date = CURRENT_DATE)::int AS entries_today,
        COUNT(*) FILTER (WHERE exit_at::date = CURRENT_DATE)::int AS exits_today,
        COUNT(*) FILTER (
          WHERE observed_at IS NOT NULL
             OR (status = 'inside' AND entry_at <= NOW() - ($1::int * INTERVAL '1 hour'))
        )::int AS observed_or_delayed
      FROM visitor_access_logs
      WHERE community_id = $2
    `;

    const [dataResult, countResult, kpiResult] = await Promise.all([
      pool.query(dataQuery, listParams),
      pool.query(countQuery, [DELAYED_HOURS, ...params]),
      pool.query(kpiQuery, [DELAYED_HOURS, communityId]),
    ]);

    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
      kpis: kpiResult.rows[0] || { inside: 0, entries_today: 0, exits_today: 0, observed_or_delayed: 0 },
    };
  },

  async findByIdForCommunity(id, communityId) {
    const { rows } = await pool.query(
      `${baseSelect} WHERE val.id = $2 AND val.community_id = $3`,
      [DELAYED_HOURS, id, communityId]
    );
    return rows[0] || null;
  },

  async create(data) {
    const { rows } = await pool.query(
      `INSERT INTO visitor_access_logs (
         community_id, complex_id, unit_id, visitor_name, visitor_document, visitor_phone,
         vehicle_plate, visit_type, destination_label, authorized_by, notes, entry_at, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, NOW()),$13)
       RETURNING *`,
      [
        data.community_id,
        data.complex_id || null,
        data.unit_id || null,
        data.visitor_name,
        data.visitor_document || null,
        data.visitor_phone || null,
        data.vehicle_plate || null,
        data.visit_type,
        data.destination_label || null,
        data.authorized_by || null,
        data.notes || null,
        data.entry_at || null,
        data.created_by || null,
      ]
    );
    return this.findByIdForCommunity(rows[0].id, data.community_id);
  },

  async checkOut({ id, communityId, userId }) {
    const existing = await this.findByIdForCommunity(id, communityId);
    if (!existing) return null;
    if (existing.status === 'exited') return { ...existing, alreadyExited: true };
    if (existing.status === 'cancelled') {
      const error = new Error('VISIT_CANCELLED');
      error.code = 'VISIT_CANCELLED';
      throw error;
    }

    await pool.query(
      `UPDATE visitor_access_logs
       SET status = 'exited', exit_at = NOW(), exited_by = $1, updated_at = NOW()
       WHERE id = $2 AND community_id = $3 AND status = 'inside'`,
      [userId || null, id, communityId]
    );
    return this.findByIdForCommunity(id, communityId);
  },

  async cancel({ id, communityId, userId }) {
    const existing = await this.findByIdForCommunity(id, communityId);
    if (!existing) return null;
    if (existing.status === 'cancelled') return { ...existing, alreadyCancelled: true };
    if (existing.status === 'exited') {
      const error = new Error('VISIT_EXITED');
      error.code = 'VISIT_EXITED';
      throw error;
    }

    await pool.query(
      `UPDATE visitor_access_logs
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, updated_at = NOW()
       WHERE id = $2 AND community_id = $3 AND status = 'inside'`,
      [userId || null, id, communityId]
    );
    return this.findByIdForCommunity(id, communityId);
  },

  async observe({ id, communityId, userId, note }) {
    const { rows } = await pool.query(
      `UPDATE visitor_access_logs
       SET observed_at = NOW(), observed_by = $1, observation_note = $2, updated_at = NOW()
       WHERE id = $3 AND community_id = $4
       RETURNING id`,
      [userId || null, note, id, communityId]
    );
    if (!rows[0]) return null;
    return this.findByIdForCommunity(id, communityId);
  },

  async unobserve({ id, communityId }) {
    const { rows } = await pool.query(
      `UPDATE visitor_access_logs
       SET observed_at = NULL, observed_by = NULL, observation_note = NULL, updated_at = NOW()
       WHERE id = $1 AND community_id = $2
       RETURNING id`,
      [id, communityId]
    );
    if (!rows[0]) return null;
    return this.findByIdForCommunity(id, communityId);
  },
};

module.exports = { VisitorAccessLog };
