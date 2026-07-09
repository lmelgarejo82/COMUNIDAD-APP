const { pool } = require('../db');

function getQuery(client) {
  return client || pool;
}

const Notification = {
  async create({ user_id, type, title, message, reference_id }, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, reference_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, type, title, message || null, reference_id || null]
    );
    return rows[0];
  },

  async createForCommunity(communityId, { type, title, message, reference_id, excludeUserId }, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query('SELECT id FROM users WHERE community_id = $1', [communityId]);
    const userIds = rows.map(r => r.id).filter(id => id !== excludeUserId);
    const results = [];
    for (const userId of userIds) {
      const notif = await this.create({ user_id: userId, type, title, message, reference_id }, client);
      results.push(notif);
    }
    return results;
  },

  async findByUser(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    return rows;
  },

  async countUnread(userId) {
    const { rows } = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return parseInt(rows[0].count);
  },

  async markAsRead(id, userId) {
    const { rows } = await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async markAllAsRead(userId) {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
      [userId]
    );
  }
};

module.exports = { Notification };
