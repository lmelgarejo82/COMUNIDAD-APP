const { pool } = require('../db');

const Announcement = {
  async create({ community_id, title, message, file_url, created_by }) {
    const { rows } = await pool.query(
      `INSERT INTO announcements (community_id, title, message, file_url, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [community_id, title, message, file_url || null, created_by]
    );
    return rows[0];
  },

  async findByCommunity(community_id, { page = 1, limit = 10 } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) FROM announcements WHERE community_id = $1 AND deleted_at IS NULL',
      [community_id]
    );
    const total = parseInt(countRows[0].count);
    const { rows } = await pool.query(
      `SELECT a.*, u.email AS created_by_email FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.community_id = $1 AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
      [community_id, limit, offset]
    );
    return { data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) || 1 };
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT a.*, u.email AS created_by_email FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]
    );
    return rows[0] || null;
  },

  async getUnreadForUser(userId, communityId, { page = 1, limit = 10 } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM announcements a
       WHERE a.community_id = $1 AND a.deleted_at IS NULL`, [communityId]
    );
    const total = parseInt(countRows[0].count);
    const { rows } = await pool.query(
      `SELECT a.*, CASE WHEN ar.id IS NULL THEN TRUE ELSE FALSE END AS is_new
       FROM announcements a
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $1
       WHERE a.community_id = $2 AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`,
      [userId, communityId, limit, offset]
    );
    return { data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) || 1 };
  },

  async markAsRead(announcementId, userId) {
    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [announcementId, userId]
    );
  },

  async softDelete(id) {
    const { rows } = await pool.query(
      'UPDATE announcements SET deleted_at = NOW() WHERE id = $1 RETURNING *', [id]
    );
    return rows[0] || null;
  },

  async updateFile(id, file_url) {
    const { rows } = await pool.query(
      'UPDATE announcements SET file_url = $2 WHERE id = $1 RETURNING *', [id, file_url]
    );
    return rows[0];
  }
};

module.exports = { Announcement };
