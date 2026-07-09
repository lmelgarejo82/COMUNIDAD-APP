const { pool } = require('../db');

const ChatContext = {
  async build(userId) {
    const userQuery = await pool.query(
      'SELECT id, email, role, unit_number, community_id FROM users WHERE id = $1', [userId]
    );
    const user = userQuery.rows[0];
    if (!user) return { user: null, context: '' };

    // Saldo pendiente
    const saldoQuery = await pool.query(
      `SELECT COALESCE(SUM(ue.amount_owed), 0) AS saldo, COUNT(*) AS pendientes
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.unit_number = $1 AND e.community_id = $2 AND ue.status IN ('pending', 'in_review')`,
      [user.unit_number, user.community_id]
    );

    // Última expensa pagada
    const lastPaid = await pool.query(
      `SELECT e.description, ue.amount_owed, e.due_date
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.unit_number = $1 AND ue.status = 'paid'
       ORDER BY ue.confirmed_at DESC LIMIT 1`,
      [user.unit_number]
    );

    // Anuncios no leídos
    const unread = await pool.query(
      `SELECT COUNT(*) AS count FROM announcements a
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $1
       WHERE a.community_id = $2 AND ar.id IS NULL AND a.deleted_at IS NULL`,
      [userId, user.community_id]
    );

    // Amenities disponibles
    const amenities = await pool.query(
      "SELECT name, description, capacity FROM amenities WHERE community_id = $1", [user.community_id]
    );

    // Próximas expensas a vencer
    const upcoming = await pool.query(
      `SELECT e.description, e.due_date, ue.amount_owed
       FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.unit_number = $1 AND e.community_id = $2 AND ue.status = 'pending'
       ORDER BY e.due_date ASC LIMIT 3`,
      [user.unit_number, user.community_id]
    );

    const s = saldoQuery.rows[0];
    const lp = lastPaid.rows[0];
    const ur = unread.rows[0];

    // Pending unit_expenses for payment (si el saldo > 0)
    let paymentUnitIds = [];
    if (parseFloat(s.saldo) > 0) {
      const pendingRows = await pool.query(
        `SELECT ue.id FROM unit_expenses ue JOIN expenses e ON ue.expense_id = e.id
         WHERE ue.unit_number = $1 AND e.community_id = $2 AND ue.status = 'pending'
         ORDER BY e.due_date ASC`,
        [user.unit_number, user.community_id]
      );
      paymentUnitIds = pendingRows.rows.map(r => r.id);
    }

    return {
      user,
      context: {
        unit_number: user.unit_number,
        role: user.role,
        saldo_pendiente: parseFloat(s.saldo),
        pendientes_count: parseInt(s.pendientes),
        ultima_expensa_pagada: lp ? `${lp.description}: $${lp.amount_owed}` : 'Ninguna',
        anuncios_no_leidos: parseInt(ur.count),
        amenities: amenities.rows.map(a => `${a.name} (capacidad: ${a.capacity})`),
        proximas_expensas: upcoming.rows.map(e => `${e.description} vence ${new Date(e.due_date).toLocaleDateString('es-AR')} - $${e.amount_owed}`),
        payment_unit_ids: paymentUnitIds,
      },
    };
  }
};

module.exports = { ChatContext };
