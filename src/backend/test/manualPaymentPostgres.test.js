const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const enabled = process.env.MANUAL_PAYMENT_POSTGRES_QA === 'true';

test('manual payment PostgreSQL locking, migration and cleanup contract', { skip: !enabled }, async (t) => {
  const { pool } = require('../db');
  const { Expense } = require('../models/Expense');
  const cachePath = require.resolve('../cache');
  require.cache[cachePath] = {
    id: cachePath,
    filename: cachePath,
    loaded: true,
    exports: { invalidatePattern: async () => {} },
  };
  const marker = `qa4b_${Date.now()}_${process.pid}`;
  const emails = {
    admin: `${marker}_admin@example.test`,
    resident: `${marker}_resident@example.test`,
  };
  const createdFiles = new Set();
  let communityId;
  let unitId;
  let floorId;
  let expenseId;
  let unitExpenseId;

  const aggregate = async () => {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count, COUNT(payment_proof_url)::int AS proofs
       FROM unit_expenses GROUP BY status ORDER BY status`
    );
    return rows;
  };
  const before = await aggregate();

  async function cleanup() {
    for (const filename of createdFiles) {
      const absolutePath = path.join(process.env.UPLOAD_DIR, filename);
      await fs.promises.rm(absolutePath, { force: true });
    }
    if (communityId) {
      await pool.query('DELETE FROM expenses WHERE community_id = $1', [communityId]);
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
      await pool.query('DELETE FROM complexes WHERE community_id = $1', [communityId]);
      await pool.query('DELETE FROM communities WHERE id = $1', [communityId]);
    }
  }

  try {
    await t.test('migration is repeatable and preserves all existing rows', async () => {
      const migration = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '032_manual_payment_rejection.sql'),
        'utf8'
      );
      await pool.query(migration);
      await pool.query(migration);
      assert.deepEqual(await aggregate(), before);

      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = 'unit_expenses'::regclass
           AND conname = 'unit_expenses_status_check'`
      );
      assert.match(rows[0].definition, /rejected/);

    });

    const community = await pool.query(
      `INSERT INTO communities (name, access_code)
       VALUES ($1, $2) RETURNING id`,
      [`QA 4b ${marker}`, marker]
    );
    communityId = community.rows[0].id;
    const users = await pool.query(
      `INSERT INTO users (email, password_hash, role, unit_number, community_id)
       VALUES ($1, 'qa-not-a-login', 'admin', NULL, $3),
              ($2, 'qa-not-a-login', 'residente', 'QA-1', $3)
       RETURNING id, email`,
      [emails.admin, emails.resident, communityId]
    );
    const residentId = users.rows.find((row) => row.email === emails.resident).id;
    const adminId = users.rows.find((row) => row.email === emails.admin).id;
    const complex = await pool.query(
      'INSERT INTO complexes (name, community_id) VALUES ($1, $2) RETURNING id',
      [`QA complex ${marker}`, communityId]
    );
    const building = await pool.query(
      'INSERT INTO buildings (complex_id, name) VALUES ($1, $2) RETURNING id',
      [complex.rows[0].id, `QA building ${marker}`]
    );
    const floor = await pool.query(
      'INSERT INTO floors (building_id, number, name) VALUES ($1, 1, $2) RETURNING id',
      [building.rows[0].id, `QA floor ${marker}`]
    );
    floorId = floor.rows[0].id;
    const unit = await pool.query(
      `INSERT INTO units (floor_id, unit_code, is_active)
       VALUES ($1, 'QA-1', TRUE) RETURNING id`,
      [floorId]
    );
    unitId = unit.rows[0].id;
    await pool.query('UPDATE users SET unit_id = $1 WHERE id = $2', [unitId, residentId]);
    await pool.query(
      `INSERT INTO unit_ownerships (unit_id, user_id, ownership_type, start_date)
       VALUES ($1, $2, 'owner', NOW() - INTERVAL '1 day')`,
      [unitId, residentId]
    );
    await pool.query(
      'INSERT INTO admin_complexes (user_id, complex_id) VALUES ($1, $2)',
      [adminId, complex.rows[0].id]
    );
    const expense = await pool.query(
      `INSERT INTO expenses
         (community_id, description, amount, fixed_amount, extra_amount, due_date, created_by)
       VALUES ($1, $2, 100, 100, 0, CURRENT_DATE + 10, $3)
       RETURNING id`,
      [communityId, marker, adminId]
    );
    expenseId = expense.rows[0].id;
    const unitExpense = await pool.query(
      `INSERT INTO unit_expenses
         (expense_id, unit_number, unit_id, amount_owed, fixed_part, extra_part)
       VALUES ($1, 'QA-1', $2, 100, 100, 0)
       RETURNING id`,
      [expenseId, unitId]
    );
    unitExpenseId = unitExpense.rows[0].id;

    await t.test('schema accepts rejected and rejects an unknown status', async () => {
      await pool.query("UPDATE unit_expenses SET status = 'rejected' WHERE id = $1", [unitExpenseId]);
      await assert.rejects(
        pool.query("UPDATE unit_expenses SET status = 'unknown_qa_state' WHERE id = $1", [unitExpenseId]),
        { code: '23514' }
      );
      await pool.query(
        "UPDATE unit_expenses SET status = 'pending' WHERE id = $1",
        [unitExpenseId]
      );
    });

    await t.test('expired ownership and inactive or deleted hierarchy cannot acquire the payable row', async () => {
      async function payable() {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await Expense.lockExpenseForUnitExpense(unitExpenseId, communityId, client);
          const row = await Expense.findPayableUnitExpenseForUser(
            unitExpenseId,
            residentId,
            communityId,
            client
          );
          await client.query('ROLLBACK');
          return row;
        } finally {
          client.release();
        }
      }

      await pool.query(
        'UPDATE unit_ownerships SET end_date = NOW() - INTERVAL \'1 second\' WHERE unit_id = $1 AND user_id = $2',
        [unitId, residentId]
      );
      assert.equal(await payable(), null);
      await pool.query(
        'UPDATE unit_ownerships SET end_date = NULL WHERE unit_id = $1 AND user_id = $2',
        [unitId, residentId]
      );

      await pool.query('UPDATE units SET is_active = FALSE WHERE id = $1', [unitId]);
      assert.equal(await payable(), null);
      await pool.query('UPDATE units SET is_active = TRUE WHERE id = $1', [unitId]);

      await pool.query('UPDATE floors SET deleted_at = NOW() WHERE id = $1', [floorId]);
      assert.equal(await payable(), null);
      await pool.query('UPDATE floors SET deleted_at = NULL WHERE id = $1', [floorId]);
      assert.equal((await payable()).id, unitExpenseId);
    });

    async function submitCandidate(proofUrl) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const parent = await Expense.lockExpenseForUnitExpense(unitExpenseId, communityId, client);
        if (!parent) {
          await client.query('ROLLBACK');
          return false;
        }
        const row = await Expense.findPayableUnitExpenseForUser(
          unitExpenseId,
          residentId,
          communityId,
          client
        );
        if (!row || !['pending', 'rejected'].includes(row.status)) {
          await client.query('ROLLBACK');
          return false;
        }
        const updated = await Expense.transitionUnitExpenseToReview(unitExpenseId, proofUrl, client);
        await client.query(updated ? 'COMMIT' : 'ROLLBACK');
        return Boolean(updated);
      } finally {
        client.release();
      }
    }

    await t.test('two submissions serialize with exactly one winner and foreign scope remains hidden', async () => {
      const candidates = ['/uploads/qa-race-a.pdf', '/uploads/qa-race-b.pdf'];
      const results = await Promise.all(candidates.map(submitCandidate));
      assert.equal(results.filter(Boolean).length, 1);
      const { rows } = await pool.query(
        'SELECT status, payment_proof_url, paid_at, confirmed_at FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.equal(rows[0].status, 'in_review');
      assert.equal(candidates.includes(rows[0].payment_proof_url), true);
      assert.equal(rows[0].paid_at, null);
      assert.equal(rows[0].confirmed_at, null);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        assert.equal(
          await Expense.lockExpenseForUnitExpense(unitExpenseId, communityId + 1000000, client),
          null
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    async function reviewCandidate(action) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const parent = await Expense.lockExpenseForUnitExpense(unitExpenseId, communityId, client);
        const row = parent
          ? await Expense.findReviewableUnitExpense(unitExpenseId, communityId, client)
          : null;
        if (!row || row.status !== 'in_review') {
          await client.query('ROLLBACK');
          return false;
        }
        const updated = await Expense.transitionManualReview(unitExpenseId, action, client);
        await client.query(updated ? 'COMMIT' : 'ROLLBACK');
        return Boolean(updated);
      } finally {
        client.release();
      }
    }

    await t.test('two reviews serialize with exactly one approval winner', async () => {
      const results = await Promise.all([reviewCandidate('approve'), reviewCandidate('approve')]);
      assert.equal(results.filter(Boolean).length, 1);
      const { rows } = await pool.query(
        'SELECT status, paid_at, confirmed_at FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.equal(rows[0].status, 'paid');
      assert.ok(rows[0].paid_at);
      assert.ok(rows[0].confirmed_at);
    });

    await t.test('proofless historical review can be rejected but not approved', async () => {
      await pool.query(
        `UPDATE unit_expenses SET status = 'in_review', payment_proof_url = NULL,
          paid_at = NULL, confirmed_at = NULL WHERE id = $1`,
        [unitExpenseId]
      );
      assert.equal(await reviewCandidate('approve'), false);
      assert.equal(await reviewCandidate('reject'), true);
      const { rows } = await pool.query(
        'SELECT status, payment_proof_url FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.deepEqual(rows[0], { status: 'rejected', payment_proof_url: null });
    });

    await t.test('submission wins the parent lock before resplit so proof activity cannot be erased', async () => {
      await pool.query(
        `UPDATE unit_expenses SET status = 'pending', payment_proof_url = NULL,
          paid_at = NULL, confirmed_at = NULL WHERE id = $1`,
        [unitExpenseId]
      );
      const submitClient = await pool.connect();
      const editClient = await pool.connect();
      try {
        await submitClient.query('BEGIN');
        await Expense.lockExpenseForUnitExpense(unitExpenseId, communityId, submitClient);

        let editQueryStarted;
        const started = new Promise((resolve) => { editQueryStarted = resolve; });
        const edit = (async () => {
          await editClient.query('BEGIN');
          editQueryStarted();
          const locked = await Expense.findByIdForUpdate(expenseId, communityId, editClient);
          const activity = await Expense.hasUnitExpenseActivity(expenseId, editClient);
          await editClient.query('ROLLBACK');
          return { locked: Boolean(locked), activity };
        })();
        await started;
        await new Promise((resolve) => setImmediate(resolve));

        const payable = await Expense.findPayableUnitExpenseForUser(
          unitExpenseId,
          residentId,
          communityId,
          submitClient
        );
        assert.equal(payable.status, 'pending');
        await Expense.transitionUnitExpenseToReview(
          unitExpenseId,
          '/uploads/qa-resplit-race.pdf',
          submitClient
        );
        await submitClient.query('COMMIT');

        assert.deepEqual(await edit, { locked: true, activity: true });
        const { rows } = await pool.query(
          'SELECT status, payment_proof_url FROM unit_expenses WHERE id = $1',
          [unitExpenseId]
        );
        assert.deepEqual(rows[0], {
          status: 'in_review',
          payment_proof_url: '/uploads/qa-resplit-race.pdf',
        });
      } finally {
        submitClient.release();
        editClient.release();
      }
    });

    await t.test('failed resplit transaction restores the deleted child and metadata edit preserves proof', async () => {
      await pool.query(
        `UPDATE unit_expenses SET status = 'pending', payment_proof_url = NULL,
          paid_at = NULL, confirmed_at = NULL WHERE id = $1`,
        [unitExpenseId]
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await Expense.findByIdForUpdate(expenseId, communityId, client);
        assert.equal(await Expense.hasUnitExpenseActivity(expenseId, client), false);
        await Expense.deleteUnitExpenses(expenseId, client);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      let row = await pool.query(
        'SELECT id, status, payment_proof_url FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.deepEqual(row.rows[0], { id: unitExpenseId, status: 'pending', payment_proof_url: null });

      await pool.query(
        `UPDATE unit_expenses SET status = 'in_review', payment_proof_url = '/uploads/qa-metadata-proof.pdf'
         WHERE id = $1`,
        [unitExpenseId]
      );
      const controller = require('../controllers/expenseController');
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await controller.update({
        params: { id: String(expenseId) },
        communityId,
        body: {
          description: `${marker} metadata`,
          fixedAmount: 100,
          extraAmount: 0,
          due_date: '2026-10-01',
          period: '2026-09',
        },
      }, res);
      assert.equal(res.statusCode, 200);
      row = await pool.query(
        'SELECT status, payment_proof_url FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.deepEqual(row.rows[0], {
        status: 'in_review',
        payment_proof_url: '/uploads/qa-metadata-proof.pdf',
      });
    });

    await t.test('known rollback restores the row and controller cleanup removes a real candidate file', async () => {
      await pool.query(
        `UPDATE unit_expenses SET status = 'pending', payment_proof_url = NULL,
          paid_at = NULL, confirmed_at = NULL WHERE id = $1`,
        [unitExpenseId]
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await Expense.lockExpenseForUnitExpense(unitExpenseId, communityId, client);
        await Expense.findPayableUnitExpenseForUser(unitExpenseId, residentId, communityId, client);
        await Expense.transitionUnitExpenseToReview(
          unitExpenseId,
          '/uploads/qa-rolled-back.pdf',
          client
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      let row = await pool.query(
        'SELECT status, payment_proof_url FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.deepEqual(row.rows[0], { status: 'pending', payment_proof_url: null });

      await pool.query('UPDATE units SET is_active = FALSE WHERE id = $1', [unitId]);
      const filename = `${crypto.randomUUID()}.pdf`;
      createdFiles.add(filename);
      const absolutePath = path.join(process.env.UPLOAD_DIR, filename);
      await fs.promises.writeFile(absolutePath, 'synthetic qa proof');
      const controller = require('../controllers/expenseController');
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await controller.submitPayment({
        params: { unitExpenseId: String(unitExpenseId) },
        user: { id: residentId, role: 'residente' },
        communityId,
        body: {},
        file: { filename, path: absolutePath },
        async cleanupUploadedFile() { await fs.promises.rm(absolutePath, { force: true }); },
        retainUploadedFile() { throw new Error('inactive ownership must not retain'); },
      }, res);
      assert.equal(res.statusCode, 404);
      assert.equal(fs.existsSync(absolutePath), false);
      row = await pool.query(
        'SELECT status, payment_proof_url FROM unit_expenses WHERE id = $1',
        [unitExpenseId]
      );
      assert.deepEqual(row.rows[0], { status: 'pending', payment_proof_url: null });
      await pool.query('UPDATE units SET is_active = TRUE WHERE id = $1', [unitId]);
    });
  } finally {
    await cleanup();
    assert.deepEqual(await aggregate(), before);
    if (communityId) {
      const residue = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM communities WHERE id = $1) AS communities,
           (SELECT COUNT(*)::int FROM users WHERE email = ANY($2::text[])) AS users,
           (SELECT COUNT(*)::int FROM expenses WHERE description = $3) AS expenses`,
        [communityId, Object.values(emails), marker]
      );
      assert.deepEqual(residue.rows[0], { communities: 0, users: 0, expenses: 0 });
    }
    await pool.end();
  }
});
