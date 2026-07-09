const { pool } = require('../db');
const { Hierarchy } = require('./Hierarchy');

const USE_HIERARCHY = process.env.USE_HIERARCHY === 'true';

function getQuery(client) {
  return client || pool;
}

const Expense = {
  async create({ community_id, description, fixed_amount, extra_amount, due_date, period, created_by }, client = null) {
    const db = getQuery(client);
    const total = parseFloat(fixed_amount || 0) + parseFloat(extra_amount || 0);
    const { rows } = await db.query(
      `INSERT INTO expenses (community_id, description, amount, fixed_amount, extra_amount, due_date, period, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [community_id, description, total, fixed_amount || 0, extra_amount || 0, due_date, period || null, created_by]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM expenses WHERE id = $1 AND deleted_at IS NULL', [id]
    );
    return rows[0] || null;
  },

  async findByCommunity(community_id, { page = 1, limit = 10, status } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE e.community_id = $1 AND e.deleted_at IS NULL';
    const params = [community_id];
    let paramIdx = 2;

    if (status) {
      whereClause += ` AND EXISTS (SELECT 1 FROM unit_expenses ue WHERE ue.expense_id = e.id AND ue.status = $${paramIdx})`;
      params.push(status);
      paramIdx++;
    }

    const countRow = await pool.query(
      `SELECT COUNT(*) FROM expenses e ${whereClause}`, params
    );
    const total = parseInt(countRow.rows[0].count);

    const { rows } = await pool.query(
      `SELECT e.*, u.email AS created_by_email FROM expenses e
       LEFT JOIN users u ON e.created_by = u.id
       ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    return { data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) || 1 };
  },

  async update(id, { description, fixed_amount, extra_amount, due_date, period }) {
    const total = parseFloat(fixed_amount || 0) + parseFloat(extra_amount || 0);
    const { rows } = await pool.query(
      `UPDATE expenses SET description = $2, amount = $3, fixed_amount = $4, extra_amount = $5,
       due_date = $6, period = $7 WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, description, total, fixed_amount || 0, extra_amount || 0, due_date, period || null]
    );
    return rows[0] || null;
  },

  async deleteUnitExpenses(expense_id, client = null) {
    const db = getQuery(client);
    await db.query('DELETE FROM unit_expenses WHERE expense_id = $1', [expense_id]);
  },

  async softDelete(id) {
    const { rows } = await pool.query(
      'UPDATE expenses SET deleted_at = NOW() WHERE id = $1 RETURNING *', [id]
    );
    return rows[0] || null;
  },

  async updateFile(id, file_url) {
    const { rows } = await pool.query(
      'UPDATE expenses SET file_url = $2 WHERE id = $1 RETURNING *', [id, file_url]
    );
    return rows[0];
  },

  async getDistinctUnits(community_id, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      "SELECT DISTINCT unit_number FROM users WHERE community_id = $1 AND unit_number IS NOT NULL AND unit_number != ''",
      [community_id]
    );
    return rows.map(r => r.unit_number);
  },

  async getUnitsForSplit(community_id, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      `SELECT u.unit_code AS unit_number, u.coef_percent, u.area_m2
       FROM units u
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE cx.community_id = $1
       ORDER BY u.unit_code`,
      [community_id]
    );
    return rows;
  },

  async createUnitExpenses(expense_id, units, client = null) {
    const db = getQuery(client);

    const { rows: expRows } = await db.query(
      'SELECT community_id FROM expenses WHERE id = $1', [expense_id]
    );
    const communityId = expRows[0]?.community_id;

    let unitIdMap = {};
    if (communityId) {
      const unitNumbers = units.map(u => u.unit_number);
      unitIdMap = await Hierarchy.resolveUnitIds(communityId, unitNumbers, client);
    }

    const values = [];
    const params = [];
    units.forEach(({ unit_number, amount_owed, fixed_part, extra_part }, i) => {
      const base = i * 6;
      const unitId = unitIdMap[String(unit_number).trim()] || null;
      params.push(expense_id, unit_number, unitId, amount_owed, fixed_part || 0, extra_part || 0);
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    });

    const { rows } = await db.query(
      `INSERT INTO unit_expenses (expense_id, unit_number, unit_id, amount_owed, fixed_part, extra_part)
       VALUES ${values.join(', ')}
       RETURNING *`,
      params
    );
    return rows;
  },

  async findUnitExpenses(expense_id, filters = {}) {
    let query = 'SELECT ue.* FROM unit_expenses ue WHERE ue.expense_id = $1';
    const params = [expense_id];
    if (filters.status) { query += ' AND ue.status = $2'; params.push(filters.status); }
    query += ' ORDER BY ue.unit_number';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findMyUnitExpenses(unit_number, community_id) {
    if (USE_HIERARCHY) {
      const unitId = await Hierarchy.resolveUnitId(community_id, unit_number);
      if (!unitId) return [];
      const { rows } = await pool.query(
        `SELECT ue.*, e.description, e.due_date, e.period, e.fixed_amount, e.extra_amount,
                e.late_fee_percent, e.grace_days
         FROM unit_expenses ue
         JOIN expenses e ON ue.expense_id = e.id
         WHERE ue.unit_id = $1 AND e.community_id = $2 AND e.deleted_at IS NULL
         ORDER BY e.due_date DESC`,
        [unitId, community_id]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT ue.*, e.description, e.due_date, e.period, e.fixed_amount, e.extra_amount,
              e.late_fee_percent, e.grace_days
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.unit_number = $1 AND e.community_id = $2 AND e.deleted_at IS NULL
       ORDER BY e.due_date DESC`,
      [unit_number, community_id]
    );
    return rows;
  },

  async findUnitExpenseById(id) {
    const { rows } = await pool.query(
      `SELECT ue.*, e.description, e.due_date, e.community_id
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async updateUnitStatus(id, status, payment_proof_url = null) {
    const setFields = ['status = $2'];
    const params = [id, status];
    if (payment_proof_url) { setFields.push(`payment_proof_url = $${params.length + 1}`); params.push(payment_proof_url); }
    if (status === 'in_review') { setFields.push('paid_at = NOW()'); }
    const query = `UPDATE unit_expenses SET ${setFields.join(', ')} WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  },

  async confirmUnitExpense(id) {
    const { rows } = await pool.query(
      `UPDATE unit_expenses SET status = 'paid', confirmed_at = NOW(), paid_at = COALESCE(paid_at, NOW())
       WHERE id = $1 RETURNING *`, [id]
    );
    return rows[0];
  },

  async findUnitExpenseWithCommunity(id) {
    const { rows } = await pool.query(
      `SELECT ue.*, e.community_id AS expense_community_id
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async findDueSoon(daysFromNow) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);

    if (USE_HIERARCHY) {
      const { rows } = await pool.query(
        `SELECT ue.*, e.description, e.due_date, e.late_fee_percent, e.grace_days,
                u.email AS user_email, u.unit_number
         FROM unit_expenses ue
         JOIN expenses e ON ue.expense_id = e.id
         JOIN unit_ownerships uo ON uo.unit_id = ue.unit_id AND (uo.end_date IS NULL OR uo.end_date > NOW())
         JOIN users u ON uo.user_id = u.id
         WHERE e.due_date::date = $1::date
           AND ue.status IN ('pending', 'in_review')
           AND e.deleted_at IS NULL`,
        [targetDate.toISOString().split('T')[0]]
      );
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT ue.*, e.description, e.due_date, e.late_fee_percent, e.grace_days,
              u.email AS user_email, u.unit_number
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       JOIN users u ON u.unit_number = ue.unit_number AND u.community_id = e.community_id
       WHERE e.due_date::date = $1::date
         AND ue.status IN ('pending', 'in_review')
         AND e.deleted_at IS NULL`,
      [targetDate.toISOString().split('T')[0]]
    );
    return rows;
  },

  async findOverdue() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (USE_HIERARCHY) {
      const { rows } = await pool.query(
        `SELECT ue.*, e.description, e.due_date, e.late_fee_percent, e.grace_days,
                u.email AS user_email, u.unit_number
         FROM unit_expenses ue
         JOIN expenses e ON ue.expense_id = e.id
         JOIN unit_ownerships uo ON uo.unit_id = ue.unit_id AND (uo.end_date IS NULL OR uo.end_date > NOW())
         JOIN users u ON uo.user_id = u.id
         WHERE e.due_date::date = $1::date
           AND ue.status IN ('pending', 'in_review')
           AND e.deleted_at IS NULL`,
        [yesterday.toISOString().split('T')[0]]
      );
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT ue.*, e.description, e.due_date, e.late_fee_percent, e.grace_days,
              u.email AS user_email, u.unit_number
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       JOIN users u ON u.unit_number = ue.unit_number AND u.community_id = e.community_id
       WHERE e.due_date::date = $1::date
         AND ue.status IN ('pending', 'in_review')
         AND e.deleted_at IS NULL`,
      [yesterday.toISOString().split('T')[0]]
    );
    return rows;
  },
};

module.exports = { Expense };
