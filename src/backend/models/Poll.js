const { pool } = require('../db');

const Poll = {
  async create({ community_id, title, description, options, created_by, expires_at }) {
    const { rows } = await pool.query(
      `INSERT INTO polls (community_id, title, description, options, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [community_id, title, description || null, JSON.stringify(options), created_by, expires_at || null]
    );
    return rows[0];
  },

  async findByCommunity(communityId) {
    const { rows } = await pool.query(
      `SELECT p.*, u.email AS created_by_email,
              (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) AS votes_count
       FROM polls p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.community_id = $1
       ORDER BY p.created_at DESC`,
      [communityId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT p.*, u.email AS created_by_email,
              (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) AS votes_count
       FROM polls p LEFT JOIN users u ON p.created_by = u.id WHERE p.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async getResults(pollId) {
    const { rows } = await pool.query(
      `SELECT option_index, COUNT(*) AS count FROM poll_votes WHERE poll_id = $1 GROUP BY option_index ORDER BY option_index`,
      [pollId]
    );
    return rows;
  },

  async hasVoted(pollId, userId) {
    const { rows } = await pool.query(
      'SELECT id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, userId]
    );
    return rows.length > 0;
  },

  async vote(pollId, userId, optionIndex) {
    const { rows } = await pool.query(
      `INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES ($1, $2, $3) RETURNING *`,
      [pollId, userId, optionIndex]
    );
    return rows[0];
  }
};

module.exports = { Poll };
