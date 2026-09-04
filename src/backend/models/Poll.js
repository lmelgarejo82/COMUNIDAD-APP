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

  async findById(id, communityId) {
    const { rows } = await pool.query(
      `SELECT p.*, u.email AS created_by_email,
              (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) AS votes_count
       FROM polls p LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1 AND p.community_id = $2`, [id, communityId]
    );
    return rows[0] || null;
  },

  async getResults(pollId, communityId) {
    const { rows } = await pool.query(
      `SELECT pv.option_index, COUNT(*) AS count
       FROM poll_votes pv
       JOIN polls p ON p.id = pv.poll_id
       WHERE pv.poll_id = $1 AND p.community_id = $2
       GROUP BY pv.option_index ORDER BY pv.option_index`,
      [pollId, communityId]
    );
    return rows;
  },

  async hasVoted(pollId, userId, communityId) {
    const { rows } = await pool.query(
      `SELECT pv.id FROM poll_votes pv
       JOIN polls p ON p.id = pv.poll_id
       WHERE pv.poll_id = $1 AND pv.user_id = $2 AND p.community_id = $3`,
      [pollId, userId, communityId]
    );
    return rows.length > 0;
  },

  async vote(pollId, userId, optionIndex, communityId) {
    const { rows } = await pool.query(
      `INSERT INTO poll_votes (poll_id, user_id, option_index)
       SELECT p.id, $2, $3 FROM polls p
       WHERE p.id = $1 AND p.community_id = $4
       RETURNING *`,
      [pollId, userId, optionIndex, communityId]
    );
    return rows[0] || null;
  }
};

module.exports = { Poll };
