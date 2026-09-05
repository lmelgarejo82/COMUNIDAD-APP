# Manual Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete a tenant-safe resident proof submission and admin approve/reject flow whose files survive backend recreation.

**Architecture:** Reuse unit_expenses and its existing proof column. Bind all transitions to request community and active ownership, serialize conflicting payment/expense edits, and retain files only after durable association. One upload root and named Docker volume serve all existing upload routes; frontend downloads use Bearer-authenticated blobs.

**Tech Stack:** Existing Express, PostgreSQL, Multer, React/Vite, Axios, node:test and Docker; no added dependency.

**Spec:** `docs/superpowers/specs/2026-09-05-b36-1b-manual-payment-design.md`

## Global Constraints

- No new dependencies; no MercadoPago implementation or provider activation.
- `req.communityId` is the authorization scope; never trust a client filename or identity claim.
- Active dated ownership and active nondeleted same-community hierarchy are required for resident submission.
- Preserve B35F trusted associations and bearer-only downloads; no query JWT.
- Existing5MiB PDF/JPG/JPEG/PNG proof and10MiB PDF document limits remain authoritative.
- Only new migration032 may extend payment status; do not edit applied migrations.
- Commit DB before retaining an upload or attempting optional delivery.
- Failed requests leave zero partial DB writes and no unassociated upload.
- Use explicit Compose project `comunidad-app`; preserve non-QA rows/files/volumes and never emit secrets.
- TDD before production edits, fresh task review, whole-block review and green publication gate.
- Work continues under the parent controlled-pilot plan/ledger; no new approval pause or duplicate worker sequence.

## Task 4a: One durable upload root

**Files:** Modify `src/backend/services/uploadFiles.js`, `src/backend/routes/expenses.js`, `documents.js`, `tickets.js`, `announcements.js`, `docker-compose.yml`, `src/backend/.env.example`, `src/frontend/nginx.conf`. Create `src/backend/test/uploadDirectory.test.js`; keep `uploadAccess.test.js`, `uploadAssociationLifecycle.test.js` and `resetCredentialLogging.test.js` green (upload route behavior is covered in the existing upload suites).

**Interfaces:** Existing `UPLOAD_DIRECTORY`, `resolveRequestedUpload(rawPath)`, `canonicalStoredUploadUrl(value)` and `removeUploadedFile(file)` remain public with unchanged return shapes. All Multer destinations and `routes/uploads.js` consume that root.

- [ ] Add a fresh-process configured-root regression using a real temporary directory. The child must resolve and clean a real file under that directory, not inspect source text:

```js
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-uploads-'));
const child = spawnSync(process.execPath, ['-e', `
  const fs = require('node:fs');
  const path = require('node:path');
  const uploads = require('./services/uploadFiles');
  (async () => {
    const file = uploads.resolveRequestedUpload('/proof.pdf');
    fs.writeFileSync(file.absolutePath, 'synthetic proof');
    const removed = await uploads.removeUploadedFile({ path: file.absolutePath });
    process.stdout.write(JSON.stringify({
      matches: uploads.UPLOAD_DIRECTORY === path.resolve(process.env.UPLOAD_DIR),
      removed, exists: fs.existsSync(file.absolutePath)
    }));
  })().catch(() => process.exit(1));
`], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, UPLOAD_DIR: folder }, encoding: 'utf8' });
assert.equal(child.status, 0);
assert.deepEqual(JSON.parse(child.stdout), { matches: true, removed: true, exists: false });
```

The test imports node:test/assert/fs/os/path/child_process, and removes only its own mkdtemp folder in `finally`. Add outside-root/traversal denial, usable default, actual route upload/serve root consistency, and rendered Compose volume-path assertions.

- [ ] Run RED: `cd src/backend; node --require ./test/setupEnvironment.js --test test/uploadDirectory.test.js`. Require the configured-root assertion to fail against the current hardcoded root.
- [ ] Resolve a nonempty configured directory or retain the current local default, create it before accepting uploads and fail clearly if it cannot be a directory. Use the shared export in all four destinations; do not add a general uploader factory. Core resolution remains:

```js
const configured = process.env.UPLOAD_DIR;
if (configured !== undefined && configured.trim() === '') {
  throw new Error('UPLOAD_DIR debe indicar un directorio no vacío');
}
const UPLOAD_DIRECTORY = configured === undefined
  ? path.resolve(__dirname, '..', 'uploads')
  : path.resolve(configured.trim());
fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });
```

- [ ] Add Compose backend `UPLOAD_DIR: /app/uploads`, mount `upload_data:/app/uploads`, declare `upload_data:` under volumes. Inventory current container files before first mount; if nonempty, preserve exact bytes before recreation and verify afterward. No blanket deletion.
- [ ] Reproduce a valid upload larger than1MiB rejected by the existing proxy default, then add bounded `client_max_body_size 11m;` at server scope. Preserve every reset logging/proxy-header rule; backend size limits stay unchanged.
- [ ] Run focused upload tests, full backend suite, `git diff --check`; commit `fix: persist uploaded files across rebuilds`. Obtain fresh task review. Task4c supplies the final end-to-end proof recreation gate.

## Task 4b: Atomic manual proof backend

**Files:** Modify `src/backend/controllers/expenseController.js`, `src/backend/models/Expense.js`, `src/backend/routes/expenses.js`, `src/backend/models/Dashboard.js`, `src/backend/models/ChatContext.js`; extend the smallest upload lifecycle helper only if needed for deterministic failed/disconnected-request cleanup. Create `src/backend/migrations/032_manual_payment_rejection.sql` and `src/backend/test/manualPayment.test.js`; extend focused existing upload/payment/tenant tests where their existing contract changes.

**Interfaces:** Keep `submitPayment`, `confirmPayment`, and existing route URLs. Add `expenseController.rejectPayment` and admin-only `PUT /api/expenses/unit/:unitExpenseId/reject`. Success remains a unit_expenses row. Own invalid state is clear4xx; foreign/ineligible resource is safe404. Existing internal `Expense.confirmUnitExpense` used by MP remains independent from the stricter manual-review controller.

- [ ] Write controller/route RED cases using the existing `require.cache` mock pattern from `uploadAssociationLifecycle.test.js` and actual multipart requests for middleware. Minimum existing-contract failure example:

```js
const mutations = [];
const expensePath = require.resolve('../models/Expense');
const controllerPath = require.resolve('../controllers/expenseController');
require.cache[expensePath] = { id: expensePath, filename: expensePath, loaded: true, exports: {
  Expense: {
    findPayableUnitExpenseForUser: async () => ({ id: 41, status: 'pending' }),
    updateUnitStatus: async (...args) => { mutations.push(args); return { id: 41, status: 'in_review' }; }
  }
} };
delete require.cache[controllerPath];
const controller = require('../controllers/expenseController');
const res = {
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
};
await controller.submitPayment({
  params: { unitExpenseId: '41' }, user: { id: 5, role: 'residente' },
  communityId: 7, body: { payment_proof_url: '/uploads/foreign.pdf' }
}, res);
assert.equal(res.statusCode, 400);
assert.equal(mutations.length, 0);
```

Wrap the example in node:test with node:assert/strict, save/restore affected require.cache entries in test cleanup as in the cited existing harness, and stub unrelated cache/notification/DB boundaries to keep the case hermetic. Test absence of a file, not a missing helper. Add own valid file, foreign valid id, inactive/expired ownership/hierarchy, forged proof URL, all states, roles, DB/rollback/disconnect cleanup and optional-delivery failure. Record events to assert COMMIT precedes retain and any delivery attempt. Use temporary real files and clean them in `finally`.

- [ ] Run RED: `node --require ./test/setupEnvironment.js --test test/manualPayment.test.js` from backend. Require missing proof/current state/association defects to fail before edits.
- [ ] Extend only the existing CHECK using a new migration, under the project's transaction/checksum runner:

```sql
ALTER TABLE unit_expenses DROP CONSTRAINT IF EXISTS unit_expenses_status_check;
ALTER TABLE unit_expenses ADD CONSTRAINT unit_expenses_status_check
  CHECK (status IN ('pending', 'in_review', 'paid', 'rejected'));
```

Apply twice to representative QA schema to prove idempotence, preserve existing rows/old migration hashes, and reject unknown states. Discover the actual constraint name before execution; the default name comes from migration003.

- [ ] Attach `upload.single('proof')` and `trackUploadedFile` after resident authentication/authorization/scope. Require an accepted file. Generate filename with `crypto.randomUUID()` and normalized allowed extension. Form body URL never creates an association.
- [ ] Implement parent-expense-before-child locking shared by submission, manual review and amount re-split. Parent scoped lookup:

```sql
SELECT e.* FROM expenses e JOIN unit_expenses ue ON ue.expense_id = e.id
WHERE ue.id = $1 AND e.community_id = $2 AND e.deleted_at IS NULL
FOR UPDATE OF e;
```

Within the same client transaction, lock the child and bind active ownership through users/unit_ownerships/units/floors/buildings/complexes using the exact dated/active/deleted checks already in `User.findById` and `UploadAccess`. Mutate only its expected state:

```sql
UPDATE unit_expenses SET status = 'in_review', payment_proof_url = $2,
  paid_at = NULL, confirmed_at = NULL
WHERE id = $1 AND status IN ('pending', 'rejected') RETURNING *;
```

Admin approve/reject similarly binds community and requires `in_review` plus a stored proof; approve writes paid/confirmed timestamps, reject persists rejected. Capture prior proof before replacement and remove it only after committed new association. On error rollback, safely release/discard uncertain clients as Invite does; finalize failed upload cleanup even after client disconnect. Never remove a file whose association commits.

- [ ] Reproduce destructive amount edit on a proof-bearing row. Lock expense in the same order, reject amount changes when any child has proof/payment activity, preserve metadata-only edits. Make `Expense.update` honor its supplied transaction client; allowed resplit writes share it. Test notification/DB failure cannot leave a partial resplit and a concurrent submission cannot be erased.
- [ ] Replace undefined post-COMMIT `getUserPhone` call with phone in the existing scoped lookup, isolate optional delivery failures from committed success. Update only unpaid-state enumerations in Expense/Dashboard/ChatContext to include rejected. No Twilio integration activation.
- [ ] Run focused tests and full `npm test`. Live explicit Docker PostgreSQL: own/foreign ids, two racing submissions/reviews, resplit-vs-submit, migration twice and rollback/count/file evidence. Native localhost5432 is a different server and must not be used accidentally. Clean exact fixtures. Commit `feat: complete manual payment proof review`; fresh task review.

## Task 4c: Resident/admin proof UI and durable E2E

**Files:** Modify `src/frontend/src/pages/Expensas.jsx`, `src/frontend/src/services/expensas.js`; create `src/frontend/src/services/protectedUploads.js`, `src/frontend/src/utils/manualPayment.js`, `src/frontend/test/manualPayment.test.js`. Update `docs/PILOT_READINESS.md` with actual outcomes, not assumed success.

**Interfaces:** `createExpenseService(client = api)` exposes the existing expense methods and new `rejectPayment(id)`; default `expenseService` remains compatible. `downloadProtectedUpload(fileUrl, fileName, {client, browser})` permits only canonical generated `/uploads/<filename>` and uses an authenticated root-relative blob request. `validatePaymentProof(file)` returns a fixed message or null; `manualPaymentActions(status, role)` returns permitted UI actions (residente: submit for pending/rejected; admin: approve/reject for in_review; otherwise empty).

- [ ] Write RED service/action tests including actual multipart field and rejection route:

```js
const calls = [];
const client = { put: async (...args) => { calls.push(args); return { data: {} }; } };
const service = createExpenseService(client);
const proof = new File(['QA'], 'proof.pdf', { type: 'application/pdf' });
await service.submitPayment(41, proof);
assert.equal(calls[0][0], '/expenses/unit/41/pay');
assert.equal(calls[0][1].get('proof').name, 'proof.pdf');
await service.rejectPayment(41);
assert.equal(calls[1][0], '/expenses/unit/41/reject');
assert.deepEqual(manualPaymentActions('in_review', 'admin'), ['approve', 'reject']);
assert.equal(validatePaymentProof(null), 'Seleccioná un comprobante.');
```

Test configured5MiB boundary, invalid types, status presentation, canonical/external/traversal URL rejection, no query token, blob creation/click/revocation including failures. Run `node --test test/manualPayment.test.js` and observe missing behavior RED before production edits.

- [ ] Add the injectable service following `accountRecovery.js`'s established pattern. Download through the existing Axios client with root override, not a raw anchor:

```js
const { data } = await client.get(fileUrl, { baseURL: '', responseType: 'blob' });
const objectUrl = browser.URL.createObjectURL(data);
let link;
try {
  link = browser.document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
}
finally {
  try { link?.remove(); }
  finally { browser.setTimeout(() => browser.URL.revokeObjectURL(objectUrl), 0); }
}
```

Validate stored path and safe filename before request/DOM work; no query/hash/encoding traversal/external origin. Ensure URL cleanup on failed DOM creation as well. Tests inject browser/client; actual browser verifies download bytes.

- [ ] Resident pending/rejected card offers Enviar comprobante with required file/type/size text and loading/disabled/error/success. Show review/paid/rejected correctly and allow rejected resubmission. Fix current missing catch(err) load error. Admin has authenticated proof download and explicit approve/reject only in_review with per-action states. Preserve rejected/approved readback and surface blocked amount-edit errors. No unavailable MP-only path; manual remains pilot default until server capabilities are added in B36.1C.
- [ ] Run frontend tests/build and backend suite. Rebuild Docker, fresh admin invite -> resident login -> proof -> admin download/reject -> resident resubmit -> approve -> paid. Repeat desktop1366+/mobile390; foreign/expired ownership and role negatives must leave DB/files unchanged. Valid5MiB and oversized request verify proxy/backend boundaries.
- [ ] Download proof bytes, recreate backend and verify identical authorized bytes from named volume. Inventory/preserve non-QA files; cleanup only exact QA rows/files with zero residues. No JWT URLs, unexpected5xx/429 or console errors in normal journeys.
- [ ] Commit `feat: add pilot manual payment workflow`. Fresh task review then whole-block review, fresh backend/isolated Redis/frontend/build/Docker gate. Fetch/behind0/clean/diff-check, fast-forward main, test merged result, normal push and verify equality. Actual SMTP remains the accepted external observation only.

## Self-review and execution record

Spec coverage: durability/proxy limits4a; authority/transactions/states/cleanup/debt consumers4b; responsive workflow/download/persistence/security/live/publication4c. File/interface names match current repository and the declarations above. No migration in the account block is changed; migration032 is scoped to the new payment state. No provider, upload backup/trash or onboarding subsystem is added. Parent SDD ledger records task bases, rulings, RED/GREEN, reviews and publication; implementation proceeds without a new user approval pause under standing authorization.
