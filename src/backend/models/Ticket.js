const { pool } = require('../db');
const { Hierarchy } = require('./Hierarchy');

const Ticket = {
  async create({ community_id, user_id, unit_number, title, description, category, priority, location_label, file_url }) {
    const unitId = await Hierarchy.resolveUnitId(community_id, unit_number);
    const { rows } = await pool.query(
      `INSERT INTO tickets (community_id, user_id, unit_number, unit_id, title, description, category, priority, location_label, file_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        community_id,
        user_id,
        unit_number,
        unitId,
        title,
        description || null,
        category || 'other',
        priority || 'medium',
        location_label || null,
        file_url || null,
      ]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT t.*, u.email AS user_email FROM tickets t
       LEFT JOIN users u ON t.user_id = u.id WHERE t.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async findByCommunity(communityId, { status, category, priority, page = 1, limit = 10 } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE t.community_id = $1 AND t.deleted_at IS NULL';
    const params = [communityId];
    let paramIdx = 2;

    if (status) {
      whereClause += ` AND t.status = $${paramIdx++}`;
      params.push(status);
    }
    if (category) {
      whereClause += ` AND t.category = $${paramIdx++}`;
      params.push(category);
    }
    if (priority) {
      whereClause += ` AND t.priority = $${paramIdx++}`;
      params.push(priority);
    }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM tickets t ${whereClause}`, params
    );
    const total = parseInt(countRows[0].count);

    const { rows } = await pool.query(
      `SELECT t.*, u.email AS user_email FROM tickets t
       LEFT JOIN users u ON t.user_id = u.id
       ${whereClause}
       ORDER BY t.updated_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );
    return { data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) || 1 };
  },

  async findByUser(userId, communityId, { status, category, priority, page = 1, limit = 10 } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['user_id = $1', 'community_id = $2', 'deleted_at IS NULL'];
    const params = [userId, communityId];
    let paramIdx = 3;
    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(category);
    }
    if (priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(priority);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM tickets ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].count);
    const { rows } = await pool.query(
      `SELECT * FROM tickets ${whereClause}
       ORDER BY updated_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );
    return { data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) || 1 };
  },

  async update(id, { title, description }) {
    const { rows } = await pool.query(
      `UPDATE tickets SET title = $2, description = $3, updated_at = NOW()
       WHERE id = $1 AND status = 'sent' AND deleted_at IS NULL RETURNING *`,
      [id, title, description || null]
    );
    return rows[0] || null;
  },

  async updateStatus(id, status) {
    const { rows } = await pool.query(
      `UPDATE tickets SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, status]
    );
    return rows[0];
  },

  async addReply({ ticket_id, message, file_url, is_admin }) {
    const { rows } = await pool.query(
      `INSERT INTO ticket_replies (ticket_id, message, file_url, is_admin)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ticket_id, message, file_url || null, is_admin || false]
    );
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticket_id]);
    return rows[0];
  },

  async getReplies(ticketId) {
    const { rows } = await pool.query(
      'SELECT * FROM ticket_replies WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId]
    );
    return rows;
  }
};

module.exports = { Ticket };
