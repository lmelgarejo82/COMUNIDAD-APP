const { pool } = require('../db');

const Organization = {
  async findByCommunity(communityId) {
    const { rows } = await pool.query(
      `SELECT o.*
       FROM organizations o
       JOIN communities c ON c.organization_id = o.id
       WHERE c.id = $1`,
      [communityId]
    );
    return rows[0] || null;
  },
};

module.exports = { Organization };
