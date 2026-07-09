const { pool } = require('../db');

const Report = {
  async delinquency(communityId, month) {
    const [year, m] = (month || '').split('-').map(Number);
    const startDate = year && m ? `${year}-${String(m).padStart(2, '0')}-01` : null;

    let whereClause = 'WHERE e.community_id = $1 AND e.deleted_at IS NULL AND ue.status != \'paid\'';
    const params = [communityId];
    let paramIdx = 2;

    if (startDate) {
      whereClause += ` AND e.due_date >= $${paramIdx}::date`;
      params.push(startDate);
      paramIdx++;
      whereClause += ` AND e.due_date < ($${paramIdx - 1}::date + interval '1 month')`;
    }

    const { rows } = await pool.query(
      `SELECT ue.unit_number,
              COALESCE(u.email, '-') AS email,
              ue.amount_owed,
              e.due_date,
              e.late_fee_percent,
              e.grace_days,
              ue.status
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       LEFT JOIN users u ON u.unit_number = ue.unit_number AND u.community_id = e.community_id
       ${whereClause}
       ORDER BY ue.unit_number, e.due_date`,
      params
    );

    return rows;
  },

  async cashflow(communityId, month) {
    const [year, m] = (month || '').split('-').map(Number);
    const startDate = year && m ? `${year}-${String(m).padStart(2, '0')}-01` : null;

    let dateFilter = '';
    const params = [communityId];
    if (startDate) {
      dateFilter = ` AND e.due_date >= $2::date AND e.due_date < ($2::date + interval '1 month')`;
      params.push(startDate);
    }

    // Ingresos del mes (pagos confirmados)
    const incomeQuery = await pool.query(
      `SELECT 'Fijo' AS category, COALESCE(SUM(ue.fixed_part), 0) AS total
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE e.community_id = $1 AND ue.status = 'paid'${dateFilter}`,
      params
    );

    const extraIncome = await pool.query(
      `SELECT 'Extraordinario' AS category, COALESCE(SUM(ue.extra_part), 0) AS total
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE e.community_id = $1 AND ue.status = 'paid'${dateFilter}`,
      params
    );

    // Gastos del mes (total de expensas emitidas)
    const expenseQuery = await pool.query(
      `SELECT 'Fijo' AS category, COALESCE(SUM(e.fixed_amount), 0) AS total
       FROM expenses e WHERE e.community_id = $1 AND e.deleted_at IS NULL${dateFilter}`,
      params
    );

    const extraExpenseQuery = await pool.query(
      `SELECT 'Extraordinario' AS category, COALESCE(SUM(e.extra_amount), 0) AS total
       FROM expenses e WHERE e.community_id = $1 AND e.deleted_at IS NULL${dateFilter}`,
      params
    );

    const pendingQuery = await pool.query(
      `SELECT COALESCE(SUM(ue.amount_owed), 0) AS total
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE e.community_id = $1 AND ue.status != 'paid' AND e.deleted_at IS NULL${dateFilter}`,
      params
    );

    return {
      income: [
        { category: 'Cuota Fija', amount: parseFloat(incomeQuery.rows[0].total) },
        { category: 'Extraordinario', amount: parseFloat(extraIncome.rows[0].total) },
      ],
      expenses: [
        { category: 'Cuota Fija', amount: parseFloat(expenseQuery.rows[0].total) },
        { category: 'Extraordinario', amount: parseFloat(extraExpenseQuery.rows[0].total) },
      ],
      pending: parseFloat(pendingQuery.rows[0].total),
    };
  }
};

module.exports = { Report };
