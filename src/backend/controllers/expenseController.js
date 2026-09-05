const { Expense } = require('../models/Expense');
const { Notification } = require('../models/Notification');
const { pool } = require('../db');
const { invalidatePattern } = require('../cache');
const whatsapp = require('../services/whatsapp');
const {
  canonicalStoredUploadUrl,
  removeUploadedFile,
  resolveRequestedUpload,
} = require('../services/uploadFiles');

const USE_HIERARCHY = process.env.USE_HIERARCHY === 'true';

function parsePositiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function rollbackSafely(client) {
  try {
    await client.query('ROLLBACK');
    return true;
  } catch {
    console.error('No se pudo confirmar el rollback de expensas.');
    return false;
  }
}

async function cleanupCandidateProof(req) {
  try {
    if (req.cleanupUploadedFile) {
      await req.cleanupUploadedFile();
    } else if (req.file) {
      await removeUploadedFile(req.file);
    }
  } catch {
    console.error('No se pudo limpiar un comprobante no asociado.');
  }
}

async function removeReplacedProof(fileUrl) {
  const canonical = canonicalStoredUploadUrl(fileUrl);
  if (!canonical) return;
  const resolved = resolveRequestedUpload(canonical.slice('/uploads'.length));
  if (!resolved) return;
  try {
    await removeUploadedFile({ path: resolved.absolutePath });
  } catch {
    console.error('No se pudo limpiar el comprobante reemplazado.');
  }
}

async function notifyPaymentApproval(unit, communityId) {
  try {
    const admins = await pool.query(
      "SELECT phone FROM users WHERE community_id = $1 AND role = 'admin'",
      [communityId]
    );
    await Promise.all(admins.rows
      .filter((admin) => admin.phone)
      .map((admin) => whatsapp.sendPaymentConfirmation({
        toPhone: admin.phone,
        unitNumber: unit.unit_number,
        amount: parseFloat(unit.amount_owed).toFixed(2),
      }).catch(() => {})));
  } catch {
    console.error('No se pudo enviar la notificación opcional del pago confirmado.');
  }
}

async function notifyExpenseCreated(unitExpenseEntries, { communityId, description, dueDate }) {
  try {
    const unitUsers = await pool.query(
      `SELECT phone, unit_number FROM users
       WHERE community_id = $1 AND unit_number IS NOT NULL AND unit_number != ''`,
      [communityId]
    );
    for (const unitExpense of unitExpenseEntries) {
      const unitUser = unitUsers.rows.find((row) => row.unit_number === unitExpense.unit_number);
      if (unitUser?.phone) {
        whatsapp.sendExpenseNotification({
          toPhone: unitUser.phone,
          unitNumber: unitExpense.unit_number,
          description,
          amount: unitExpense.amount_owed.toFixed(2),
          dueDate,
        }).catch(() => {});
      }
    }
  } catch {
    console.error('No se pudo procesar la notificación opcional de la expensa creada.');
  }
}

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
  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let discardClient = false;
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

    client = await pool.connect();
    const units = await getUnitsForCommunity(req.communityId, client);
    if (units.length === 0) {
      return res.status(400).json({ error: 'No hay unidades registradas en la comunidad' });
    }

    const unitExpenseEntries = calculateUnitAmounts(units, fixedAmt, extraAmt);
    const totalAmount = fixedAmt + extraAmt;

    await client.query('BEGIN');
    transactionOpen = true;
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
    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    const committedClient = client;
    client = null;
    committedClient.release();

    res.status(201).json({
      expense,
      units_count: createdUnits.length,
      units: createdUnits,
      total_amount: totalAmount,
    });
    invalidatePattern('dashboard:*').catch(() => {});
    void notifyExpenseCreated(unitExpenseEntries, {
      communityId: req.communityId,
      description,
      dueDate: due_date,
    });
  } catch (err) {
    if (client && transactionOpen && !commitAttempted) {
      discardClient = !(await rollbackSafely(client));
    } else if (client && commitAttempted) {
      discardClient = true;
    }
    console.error('Error creando la expensa.');
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) client.release(discardClient || undefined);
  }
};

exports.update = async (req, res) => {
  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let discardClient = false;
  try {
    const { id } = req.params;
    const { description, fixedAmount, extraAmount, due_date, period } = req.body;
    const fixedAmt = parseFloat(fixedAmount || 0);
    const extraAmt = parseFloat(extraAmount || 0);

    if (!description || !due_date) {
      return res.status(400).json({ error: 'description y due_date son requeridos' });
    }

    const expenseId = parsePositiveId(id);
    if (!expenseId || !req.communityId) {
      return res.status(400).json({ error: 'Expensa inválida' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    const expense = await Expense.findByIdForUpdate(expenseId, req.communityId, client);
    if (!expense) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      return res.status(404).json({ error: 'Expensa no encontrada' });
    }

    const existingFixed = parseFloat(expense.fixed_amount) || 0;
    const existingExtra = parseFloat(expense.extra_amount) || 0;
    const amountsChanged = fixedAmt !== existingFixed || extraAmt !== existingExtra;

    if (amountsChanged) {
      if (await Expense.hasUnitExpenseActivity(expenseId, client)) {
        discardClient = !(await rollbackSafely(client));
        transactionOpen = false;
        return res.status(409).json({
          error: 'No se pueden redistribuir montos con comprobantes o actividad de pago',
        });
      }
      const units = await getUnitsForCommunity(req.communityId, client);
      if (units.length === 0) {
        discardClient = !(await rollbackSafely(client));
        transactionOpen = false;
        return res.status(400).json({ error: 'No hay unidades registradas en la comunidad' });
      }

      const unitExpenseEntries = calculateUnitAmounts(units, fixedAmt, extraAmt);

      await Expense.deleteUnitExpenses(expenseId, client);
      await Expense.createUnitExpenses(expenseId, unitExpenseEntries, client);
    }

    const updated = await Expense.update(
      expenseId,
      { description, fixed_amount: fixedAmt, extra_amount: extraAmt, due_date, period },
      client
    );
    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    res.json(updated);
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    if (client && transactionOpen && !commitAttempted) {
      discardClient = !(await rollbackSafely(client));
    } else if (client && commitAttempted) {
      discardClient = true;
    }
    console.error('Error actualizando la expensa.');
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) client.release(discardClient || undefined);
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
    req.retainUploadedFile?.();
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

async function reviewPayment(req, res, action) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
  }
  const unitExpenseId = parsePositiveId(req.params.unitExpenseId);
  if (!unitExpenseId || !req.communityId) {
    return res.status(400).json({ error: 'Registro de expensa inválido' });
  }

  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let discardClient = false;
  let unit;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;

    const expense = await Expense.lockExpenseForUnitExpense(unitExpenseId, req.communityId, client);
    if (!expense) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      return res.status(404).json({ error: 'Registro de expensa no encontrado' });
    }

    unit = await Expense.findReviewableUnitExpense(unitExpenseId, req.communityId, client);
    if (!unit) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      return res.status(404).json({ error: 'Registro de expensa no encontrado' });
    }
    if (unit.status !== 'in_review') {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      return res.status(409).json({ error: 'El pago ya fue revisado o todavía no fue enviado' });
    }
    if (action === 'approve' && !canonicalStoredUploadUrl(unit.payment_proof_url)) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      return res.status(409).json({ error: 'El pago no tiene un comprobante válido para aprobar' });
    }

    const updated = await Expense.transitionManualReview(unitExpenseId, action, client);
    if (!updated) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      return res.status(409).json({ error: 'El pago fue modificado por otra solicitud' });
    }

    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    const committedClient = client;
    client = null;
    committedClient.release();

    res.json(updated);
    invalidatePattern('dashboard:*').catch(() => {});
    if (action === 'approve') void notifyPaymentApproval(unit, req.communityId);
  } catch {
    if (client && transactionOpen && !commitAttempted) {
      discardClient = !(await rollbackSafely(client));
    } else if (client && commitAttempted) {
      discardClient = true;
    }
    console.error('Error revisando el pago manual.');
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) client.release(discardClient || undefined);
  }
}

exports.confirmPayment = (req, res) => reviewPayment(req, res, 'approve');
exports.rejectPayment = (req, res) => reviewPayment(req, res, 'reject');

exports.myExpenses = async (req, res) => {
  try {
    const user = await require('../models/User').User.findById(req.user.id);
    if (!user || user.community_id !== req.communityId || !user.unit_id) {
      return res.status(404).json({ error: 'Usuario sin unidad asignada' });
    }
    const expenses = await Expense.findMyUnitExpenses(user.unit_id, req.communityId);

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
  if (req.user?.role !== 'residente') {
    await cleanupCandidateProof(req);
    return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
  }
  const unitExpenseId = parsePositiveId(req.params.unitExpenseId);
  if (!unitExpenseId || !req.communityId) {
    await cleanupCandidateProof(req);
    return res.status(400).json({ error: 'Registro de expensa inválido' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Comprobante requerido' });
  }

  const paymentProofUrl = canonicalStoredUploadUrl(`/uploads/${req.file.filename}`);
  if (!paymentProofUrl) {
    await cleanupCandidateProof(req);
    return res.status(400).json({ error: 'Comprobante inválido' });
  }

  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let discardClient = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;

    const expense = await Expense.lockExpenseForUnitExpense(unitExpenseId, req.communityId, client);
    if (!expense) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      await cleanupCandidateProof(req);
      return res.status(404).json({ error: 'Registro de expensa no encontrado' });
    }

    const unit = await Expense.findPayableUnitExpenseForUser(
      unitExpenseId,
      req.user.id,
      req.communityId,
      client
    );
    if (!unit) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      await cleanupCandidateProof(req);
      return res.status(404).json({ error: 'Registro de expensa no encontrado' });
    }
    if (!['pending', 'rejected'].includes(unit.status)) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      await cleanupCandidateProof(req);
      return res.status(409).json({ error: 'Esta expensa ya fue pagada o está en revisión' });
    }

    const updated = await Expense.transitionUnitExpenseToReview(unitExpenseId, paymentProofUrl, client);
    if (!updated) {
      discardClient = !(await rollbackSafely(client));
      transactionOpen = false;
      await cleanupCandidateProof(req);
      return res.status(409).json({ error: 'La expensa fue modificada por otra solicitud' });
    }

    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    req.retainUploadedFile?.();
    if (unit.payment_proof_url && unit.payment_proof_url !== paymentProofUrl) {
      await removeReplacedProof(unit.payment_proof_url);
    }
    res.json(updated);
    invalidatePattern('dashboard:*').catch(() => {});
  } catch {
    if (client && commitAttempted) {
      // COMMIT may have reached PostgreSQL. Preserve the unique candidate rather
      // than risk deleting a proof now referenced by a durable row.
      discardClient = true;
      req.retainUploadedFile?.();
    } else {
      if (client && transactionOpen) discardClient = !(await rollbackSafely(client));
      await cleanupCandidateProof(req);
    }
    console.error('Error enviando el comprobante de pago.');
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) client.release(discardClient || undefined);
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
