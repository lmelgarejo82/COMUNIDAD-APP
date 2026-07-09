const { Expense } = require('../models/Expense');
const { Notification } = require('../models/Notification');
const { pool } = require('../db');
const { invalidatePattern } = require('../cache');
const whatsapp = require('../services/whatsapp');
const path = require('path');
const fs = require('fs');

const USE_HIERARCHY = process.env.USE_HIERARCHY === 'true';

function calculateUnitAmounts(units, fixedAmt, extraAmt) {
  const weights = units.map(u => {
    if (u.coef_percent) return parseFloat(u.coef_percent) / 100;
    if (u.area_m2) return parseFloat(u.area_m2);
    return 1;
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  return units.map((u, i) => {
    const share = weights[i] / totalWeight;
    const fixedPerUnit = parseFloat((fixedAmt * share).toFixed(2));
    const extraPerUnit = parseFloat((extraAmt * share).toFixed(2));
    return {
      unit_number: u.unit_number,
      amount_owed: parseFloat((fixedPerUnit + extraPerUnit).toFixed(2)),
      fixed_part: fixedPerUnit,
      extra_part: extraPerUnit,
    };
  });
}

async function getUnitsForCommunity(communityId, client) {
  if (USE_HIERARCHY) {
    return Expense.getUnitsForSplit(communityId, client);
  }
  const unitNumbers = await Expense.getDistinctUnits(communityId, client);
  return unitNumbers.map(un => ({ unit_number: un, coef_percent: null, area_m2: null }));
}

function ensureExpenseInRequestCommunity(expense, req, res) {
  if (!expense) {
    res.status(404).json({ error: 'Expensa no encontrada' });
    return false;
  }
  if (expense.community_id !== req.communityId) {
    res.status(403).json({ error: 'No tenés permisos para esta expensa' });
    return false;
  }
  return true;
}

exports.create = async (req, res) => {
  const client = await pool.connect();
  try {
    const { description, fixedAmount, extraAmount, due_date, period } = req.body;
    const fixedAmt = parseFloat(fixedAmount || 0);
    const extraAmt = parseFloat(extraAmount || 0);
    if (!description || !due_date) {
      return res.status(400).json({ error: 'description y due_date son requeridos' });
    }
    if (fixedAmt <= 0 && extraAmt <= 0) {
      return res.status(400).json({ error: 'Al menos uno de los montos debe ser mayor a 0' });
    }
    const user = await require('../models/User').User.findById(req.user.id);
    if (!user || !req.communityId) {
      return res.status(404).json({ error: 'Usuario sin comunidad asignada' });
    }

    const units = await getUnitsForCommunity(req.communityId, client);
    if (units.length === 0) {
      return res.status(400).json({ error: 'No hay unidades registradas en la comunidad' });
    }

    const unitExpenseEntries = calculateUnitAmounts(units, fixedAmt, extraAmt);
    const totalAmount = fixedAmt + extraAmt;

    await client.query('BEGIN');
    const expense = await Expense.create({
      community_id: req.communityId,
      description, fixed_amount: fixedAmt,
      extra_amount: extraAmt, due_date, period: period || null, created_by: req.user.id,
    }, client);
    const createdUnits = await Expense.createUnitExpenses(expense.id, unitExpenseEntries, client);
    await Notification.createForCommunity(req.communityId, {
      type: 'expense', title: 'Nueva expensa',
      message: `${description} - $${totalAmount} (vence ${due_date})`,
      reference_id: expense.id, excludeUserId: req.user.id,
    }, client);
    await client.query('COMMIT');

    const unitUsers = await pool.query(
      `SELECT email, unit_number FROM users WHERE community_id = $1 AND unit_number IS NOT NULL AND unit_number != ''`,
      [req.communityId]
    );
    for (const ue of unitExpenseEntries) {
      const uu = unitUsers.rows.find(r => r.unit_number === ue.unit_number);
      if (uu) {
        const phone = await getUserPhone(uu.email);
        if (phone) {
          whatsapp.sendExpenseNotification({
            toPhone: phone,
            unitNumber: ue.unit_number,
            description,
            amount: ue.amount_owed.toFixed(2),
            dueDate: due_date,
          }).catch(() => {});
        }
      }
    }

    res.status(201).json({
      expense,
      units_count: createdUnits.length,
      units: createdUnits,
      total_amount: totalAmount,
    });
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en create expense:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

exports.update = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { description, fixedAmount, extraAmount, due_date, period } = req.body;
    const fixedAmt = parseFloat(fixedAmount || 0);
    const extraAmt = parseFloat(extraAmount || 0);

    if (!description || !due_date) {
      return res.status(400).json({ error: 'description y due_date son requeridos' });
    }

    const expense = await Expense.findById(id);
    if (!ensureExpenseInRequestCommunity(expense, req, res)) return;

    const existingFixed = parseFloat(expense.fixed_amount) || 0;
    const existingExtra = parseFloat(expense.extra_amount) || 0;
    const amountsChanged = fixedAmt !== existingFixed || extraAmt !== existingExtra;

    if (amountsChanged) {
      const units = await getUnitsForCommunity(req.communityId, client);
      if (units.length === 0) {
        return res.status(400).json({ error: 'No hay unidades registradas en la comunidad' });
      }

      const unitExpenseEntries = calculateUnitAmounts(units, fixedAmt, extraAmt);

      await client.query('BEGIN');
      await Expense.deleteUnitExpenses(id, client);
      await Expense.createUnitExpenses(id, unitExpenseEntries, client);
      await Expense.update(id, { description, fixed_amount: fixedAmt, extra_amount: extraAmt, due_date, period }, client);
      await client.query('COMMIT');
    } else {
      await Expense.update(id, { description, fixed_amount: fixedAmt, extra_amount: extraAmt, due_date, period });
    }

    const updated = await Expense.findById(id);
    res.json(updated);
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en update expense:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

exports.uploadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!ensureExpenseInRequestCommunity(expense, req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const file_url = `/uploads/${req.file.filename}`;
    await Expense.updateFile(id, file_url);
    res.json({ file_url });
  } catch (err) {
    console.error('Error en uploadFile:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listUnits = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!ensureExpenseInRequestCommunity(expense, req, res)) return;
    const units = await Expense.findUnitExpenses(id, { status: req.query.status || null });
    res.json({ expense, units });
  } catch (err) {
    console.error('Error en listUnits:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listAllUnits = async (req, res) => {
  try {
    if (!req.communityId) return res.status(404).json({ error: 'Comunidad no especificada' });
    const { rows } = await pool.query(
      `SELECT ue.*, e.description, e.due_date, e.period FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       WHERE e.community_id = $1 AND e.deleted_at IS NULL
       ${req.query.status ? 'AND ue.status = $2' : ''}
       ORDER BY e.due_date DESC, ue.unit_number`,
      req.query.status ? [req.communityId, req.query.status] : [req.communityId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error en listAllUnits:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { unitExpenseId } = req.params;
    const unit = await Expense.findUnitExpenseWithCommunity(unitExpenseId);
    if (!unit) return res.status(404).json({ error: 'Registro de expensa no encontrado' });
    if (unit.status === 'paid') return res.status(400).json({ error: 'Este pago ya fue confirmado' });
    if (req.communityId !== unit.expense_community_id) {
      return res.status(403).json({ error: 'No tenés permisos para confirmar pagos de otra comunidad' });
    }
    const confirmed = await Expense.confirmUnitExpense(unitExpenseId);

    // WhatsApp: notificar al admin que el pago fue confirmado
    const unitUser = await pool.query(
      'SELECT email FROM users WHERE unit_number = $1 AND community_id = $2 LIMIT 1',
      [unit.unit_number, unit.expense_community_id]
    );
    if (unitUser.rows[0]) {
      const admins = await pool.query(
        "SELECT email, phone FROM users WHERE community_id = $1 AND role = 'admin'", [unit.expense_community_id]
      );
      for (const a of admins.rows) {
        if (a.phone) {
          whatsapp.sendPaymentConfirmation({
            toPhone: a.phone,
            unitNumber: unit.unit_number,
            amount: parseFloat(unit.amount_owed).toFixed(2),
          }).catch(() => {});
        }
      }
    }

    res.json(confirmed);
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    console.error('Error en confirmPayment:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.myExpenses = async (req, res) => {
  try {
    const user = await require('../models/User').User.findById(req.user.id);
    if (!user || user.community_id !== req.communityId || !user.unit_number) {
      return res.status(404).json({ error: 'Usuario sin unidad asignada' });
    }
    const expenses = await Expense.findMyUnitExpenses(user.unit_number, req.communityId);

    const now = new Date();
    const result = expenses.map((item) => {
      const dueDate = new Date(item.due_date);
      const graceDays = parseInt(item.grace_days) || 5;
      const graceEnd = new Date(dueDate);
      graceEnd.setDate(graceEnd.getDate() + graceDays);

      const isOverdue = now > graceEnd && item.status !== 'paid';
      const lateFeePercent = parseFloat(item.late_fee_percent) || 0;
      const baseAmount = parseFloat(item.amount_owed);
      const lateFee = isOverdue && lateFeePercent > 0
        ? parseFloat((baseAmount * lateFeePercent / 100).toFixed(2))
        : 0;

      return {
        ...item,
        late_fee: lateFee,
        total_with_fee: parseFloat((baseAmount + lateFee).toFixed(2)),
        is_overdue: isOverdue,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error en myExpenses:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.submitPayment = async (req, res) => {
  try {
    const { unitExpenseId } = req.params;
    const unit = await Expense.findUnitExpenseById(unitExpenseId);
    if (!unit) return res.status(404).json({ error: 'Registro de expensa no encontrado' });
    if (unit.status !== 'pending') return res.status(400).json({ error: 'Esta expensa ya fue pagada o está en revisión' });
    const user = await require('../models/User').User.findById(req.user.id);
    if (!user || user.community_id !== req.communityId || user.unit_number !== unit.unit_number || unit.community_id !== req.communityId) {
      return res.status(403).json({ error: 'No podés pagar expensas de otra unidad' });
    }
    let payment_proof_url = null;
    if (req.file) payment_proof_url = `/uploads/${req.file.filename}`;
    const updated = await Expense.updateUnitStatus(unitExpenseId, 'in_review', payment_proof_url);
    res.json(updated);
  } catch (err) {
    console.error('Error en submitPayment:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listMyExpenses = async (req, res) => {
  try {
    if (!req.communityId) return res.status(404).json({ error: 'Comunidad no especificada' });
    const { page, limit } = req.query;
    const result = await Expense.findByCommunity(req.communityId, { page, limit });
    res.json(result);
  } catch (err) {
    console.error('Error en listMyExpenses:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
