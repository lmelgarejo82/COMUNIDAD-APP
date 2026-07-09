const { pool } = require('../db');

const Document = {
  async create({ community_id, title, description, file_url, uploaded_by }) {
    const { rows } = await pool.query(
      `INSERT INTO documents (community_id, title, description, file_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [community_id, title, description || null, file_url, uploaded_by]
    );
    return rows[0];
  },

  async findByCommunity(communityId) {
    const { rows } = await pool.query(
      `SELECT d.*, u.email AS uploaded_by_email
       FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.community_id = $1 ORDER BY d.created_at DESC`,
      [communityId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    return rows[0] || null;
  }
};

module.exports = { Document };
