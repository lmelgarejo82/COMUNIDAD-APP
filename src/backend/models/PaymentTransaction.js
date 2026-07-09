const { pool } = require('../db');

const PaymentTransaction = {
  async create({ unit_expense_id, preference_id, external_reference, fee_amount }) {
    const { rows } = await pool.query(
      `INSERT INTO payment_transactions (unit_expense_id, preference_id, external_reference, fee_amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [unit_expense_id, preference_id, external_reference, fee_amount || 0]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM payment_transactions WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  async findByPreferenceId(preferenceId) {
    const { rows } = await pool.query(
      'SELECT * FROM payment_transactions WHERE preference_id = $1', [preferenceId]
    );
    return rows[0] || null;
  },

  async findByExternalReference(externalReference) {
    const { rows } = await pool.query(
      'SELECT * FROM payment_transactions WHERE external_reference = $1',
      [externalReference]
    );
    return rows[0] || null;
  },

  async findByPaymentId(paymentId) {
    const { rows } = await pool.query(
      'SELECT * FROM payment_transactions WHERE payment_id = $1',
      [String(paymentId)]
    );
    return rows[0] || null;
  },

  async updateStatus(preferenceId, status, paymentId = null, mpResponse = {}) {
    const { rows } = await pool.query(
      `UPDATE payment_transactions SET status = $2, payment_id = $3, mercadopago_response = $4, updated_at = NOW()
       WHERE preference_id = $1 RETURNING *`,
      [preferenceId, status, paymentId, JSON.stringify(mpResponse)]
    );
    return rows[0] || null;
  },

  async updateStatusById(id, status, paymentId = null, mpResponse = {}) {
    const { rows } = await pool.query(
      `UPDATE payment_transactions
       SET status = $2,
           payment_id = COALESCE(payment_id, $3),
           mercadopago_response = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, paymentId ? String(paymentId) : null, JSON.stringify(mpResponse)]
    );
    return rows[0] || null;
  },

  async findByUnitExpense(unitExpenseId) {
    const { rows } = await pool.query(
      'SELECT * FROM payment_transactions WHERE unit_expense_id = $1 ORDER BY created_at DESC', [unitExpenseId]
    );
    return rows;
  }
};

module.exports = { PaymentTransaction };
