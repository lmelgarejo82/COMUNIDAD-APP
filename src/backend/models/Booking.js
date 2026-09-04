const { pool } = require('../db');
const { Hierarchy } = require('./Hierarchy');

const Booking = {
  async findOverlapping(amenityId, dateFrom, dateTo, excludeId = null) {
    let query = `SELECT COUNT(*) AS count FROM bookings
                 WHERE amenity_id = $1 AND status IN ('pending', 'active')
                 AND date_from < $3 AND date_to > $2`;
    const params = [amenityId, dateFrom, dateTo];
    if (excludeId) {
      query += ' AND id != $4';
      params.push(excludeId);
    }
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count) > 0;
  },

  async create({ amenity_id, community_id, user_id, unit_number, date_from, date_to, deposit_amount, notes }) {
    const unitId = await Hierarchy.resolveUnitId(community_id, unit_number);

    const { rows } = await pool.query(
      `INSERT INTO bookings (amenity_id, user_id, unit_number, unit_id, date_from, date_to, deposit_amount, notes)
       SELECT a.id, $2, $3, $4, $5, $6, $7, $8
       FROM amenities a
       WHERE a.id = $1 AND a.community_id = $9
       RETURNING *`,
      [amenity_id, user_id, unit_number, unitId, date_from, date_to, deposit_amount || 0, notes || null, community_id]
    );
    return rows[0] || null;
  },

  async findByCommunity(communityId, { status, amenity_id, page = 1, limit = 50 } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE a.community_id = $1';
    const params = [communityId];
    let idx = 2;

    if (status) { where += ` AND b.status = $${idx++}`; params.push(status); }
    if (amenity_id) { where += ` AND b.amenity_id = $${idx++}`; params.push(amenity_id); }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM bookings b JOIN amenities a ON b.amenity_id = a.id ${where}`, params
    );
    const total = parseInt(countRows[0].count);

    const { rows } = await pool.query(
      `SELECT b.*, a.name AS amenity_name, u.email AS user_email
       FROM bookings b
       JOIN amenities a ON b.amenity_id = a.id
       LEFT JOIN users u ON b.user_id = u.id
       ${where}
       ORDER BY b.date_from DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return { data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) || 1 };
  },

  async findByUser(userId, communityId) {
    const { rows } = await pool.query(
      `SELECT b.*, a.name AS amenity_name
       FROM bookings b JOIN amenities a ON b.amenity_id = a.id
       WHERE b.user_id = $1 AND a.community_id = $2
       ORDER BY b.date_from DESC LIMIT 50`,
      [userId, communityId]
    );
    return rows;
  },

  async findById(id, communityId) {
    const { rows } = await pool.query(
      `SELECT b.*, a.name AS amenity_name, a.rules, u.email AS user_email
       FROM bookings b
       JOIN amenities a ON b.amenity_id = a.id
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = $1 AND a.community_id = $2`, [id, communityId]
    );
    return rows[0] || null;
  },

  async updateStatus(id, status, communityId) {
    const { rows } = await pool.query(
      `UPDATE bookings b SET status = $2, updated_at = NOW()
       FROM amenities a
       WHERE b.id = $1 AND b.amenity_id = a.id AND a.community_id = $3
       RETURNING b.*`, [id, status, communityId]
    );
    return rows[0] || null;
  },

  async getAmenities(communityId) {
    const { rows } = await pool.query(
      'SELECT * FROM amenities WHERE community_id = $1 ORDER BY name', [communityId]
    );
    return rows;
  },

  async getAmenityById(id, communityId) {
    const { rows } = await pool.query(
      'SELECT * FROM amenities WHERE id = $1 AND community_id = $2',
      [id, communityId]
    );
    return rows[0] || null;
  }
};

module.exports = { Booking };
