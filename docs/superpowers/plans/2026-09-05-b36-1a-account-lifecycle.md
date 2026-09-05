# B36.1A Account Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete resident invitation recovery and browser-based password recovery without exposing credentials or weakening tenant, one-time-token, or session-revocation guarantees.

**Architecture:** A shared `accountEmail` service owns SMTP transport and templates. The existing `Invite` model gains tenant-scoped listing and row-locked token rotation; thin admin controllers expose additive endpoints. The React app gains an invite-management list and two public recovery pages, using a pure fragment-consumption helper so recovery tokens live only in component memory.

**Tech Stack:** Node.js 22, Express 4, PostgreSQL 18, Nodemailer 9, Node test runner, React 19, React Router 7, Axios, Vite 6, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-05-b36-1a-account-lifecycle-design.md`

## Global Constraints

- Do not add a database migration or a second invitation entity.
- Do not add dependencies.
- Preserve hash-only storage, one-time consumption, expiration, `req.communityId`, admin-defined membership claims, and JWT revocation after reset.
- Build every sensitive URL exclusively from validated `PUBLIC_APP_URL`; request headers must not influence links.
- Never return, render, store, or log invitation/reset tokens, token hashes, JWT secrets, invitation secrets, or SMTP credentials.
- SMTP failure after invitation persistence/rotation is an HTTP success with `email_sent=false`; database and validation failures retain real `4xx`/`5xx` responses.
- Keep frontend token fragments in React memory only and remove them from the address bar immediately.
- Preserve existing API contracts and make additions only.
- Validate desktop at 1366 px or wider and mobile at approximately 390 px.
- Write and run each RED test before modifying the corresponding production file.
- Use exact, focused commits; do not push.

---

## File Map

### Create

- `src/backend/services/accountEmail.js` — shared SMTP transport and account-email templates.
- `src/backend/test/accountEmailService.test.js` — transport/template contract tests.
- `src/backend/test/adminInviteLifecycle.test.js` — invite listing, resend, privacy, tenancy, SMTP, and route-role tests.
- `src/backend/test/accountLifecycleConfig.test.js` — Compose SMTP pass-through contract.
- `src/frontend/src/services/accountRecovery.js` — forgot/reset API calls.
- `src/frontend/src/utils/fragmentToken.js` — fragment-to-memory extraction and immediate URL cleanup.
- `src/frontend/src/utils/invitePresentation.js` — deterministic pending/history partition and labels.
- `src/frontend/src/pages/ForgotPassword.jsx` — public recovery-request form.
- `src/frontend/src/pages/ResetPassword.jsx` — public password-reset form.
- `src/frontend/test/accountLifecycle.test.js` — pure frontend account-flow tests.

### Modify

- `src/backend/models/Invite.js` — tenant-scoped listing and transactional rotation.
- `src/backend/controllers/adminController.js` — shared mail use, list, and resend handlers.
- `src/backend/controllers/authController.js` — shared mail use and trusted frontend reset link.
- `src/backend/routes/admin.js` — `GET /invites` and `POST /invites/:id/resend`.
- `src/backend/test/b35cTenantIsolation.test.js` — creation-email mocks moved to the shared service boundary.
- `src/backend/test/authPasswordResetSecurity.test.js` — shared-service mock and frontend fragment-link expectations.
- `src/frontend/src/pages/InviteResidente.jsx` — responsive invite management.
- `src/frontend/src/pages/Login.jsx` — forgot link and post-reset confirmation.
- `src/frontend/src/App.jsx` — public forgot/reset routes.
- `docker-compose.yml` — SMTP variable pass-through.
- `src/backend/.env.example` — non-secret SMTP configuration guidance.

---

### Task 1: Shared Account SMTP Service

**Files:**

- Create: `src/backend/services/accountEmail.js`
- Create: `src/backend/test/accountEmailService.test.js`
- Modify: `src/backend/controllers/adminController.js:4-11,52-75`
- Modify: `src/backend/controllers/authController.js:4-17,25-45`
- Modify: `src/backend/test/b35cTenantIsolation.test.js:13-16,285-294`
- Modify: `src/backend/test/authPasswordResetSecurity.test.js:5-9,25-42`

**Interfaces:**

- Produces: `sendResidentInviteEmail({ email, inviteUrl, unitNumber, ownershipType }) => Promise<unknown>`.
- Produces: `sendPasswordResetEmail({ email, resetUrl }) => Promise<unknown>`.
- Controllers consume those functions and remain responsible for trusted URL construction and HTTP semantics.

- [ ] **Step 1: Write the failing SMTP service tests**

Create `src/backend/test/accountEmailService.test.js` with a Nodemailer module mock that captures `createTransport` configuration and `sendMail` payloads. Include these concrete assertions:

```js
test('resident invite email uses configured SMTP and contains the supplied fragment link', async () => {
  process.env.EMAIL_HOST = 'smtp.example.test';
  process.env.EMAIL_PORT = '2525';
  process.env.EMAIL_USER = 'mailer-user';
  process.env.EMAIL_PASS = 'mailer-pass';

  const service = loadServiceWithCapturedTransport();
  await service.sendResidentInviteEmail({
    email: 'resident@example.test',
    inviteUrl: 'https://app.example.test/register#token=' + 'a'.repeat(64),
    unitNumber: 'A-101',
    ownershipType: 'tenant',
  });

  assert.deepEqual(capturedTransport, {
    host: 'smtp.example.test',
    port: 2525,
    auth: { user: 'mailer-user', pass: 'mailer-pass' },
  });
  assert.equal(capturedMail.to, 'resident@example.test');
  assert.match(capturedMail.html, /register#token=/);
  assert.match(capturedMail.html, /A-101/);
  assert.match(capturedMail.html, /Inquilino/);
});

test('password reset email contains only the supplied trusted frontend URL', async () => {
  const service = loadServiceWithCapturedTransport();
  await service.sendPasswordResetEmail({
    email: 'resident@example.test',
    resetUrl: 'https://app.example.test/reset-password#token=' + 'b'.repeat(64),
  });

  assert.match(capturedMail.html, /https:\/\/app\.example\.test\/reset-password#token=/);
  assert.doesNotMatch(capturedMail.html, /api\/auth\/reset-password/);
});
```

The helper must restore environment variables and `require.cache` after every test.

- [ ] **Step 2: Run RED for the missing service**

Run:

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/accountEmailService.test.js
```

Expected: FAIL because `../services/accountEmail` does not exist.

- [ ] **Step 3: Implement the minimal shared service**

Create `src/backend/services/accountEmail.js` with this public shape:

```js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: Number.parseInt(process.env.EMAIL_PORT || '587', 10),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

async function sendResidentInviteEmail({ email, inviteUrl, unitNumber, ownershipType }) {
  return transporter.sendMail({
    from: '"Comunidad App" <noreply@comunidad.app>',
    to: email,
    subject: 'Invitación a Comunidad App',
    html: `<h2>Fuiste invitado a Comunidad App</h2>
      <p>Hacé clic en el siguiente enlace para registrarte:</p>
      <a href="${inviteUrl}">${inviteUrl}</a>
      <p><strong>Unidad asignada:</strong> ${unitNumber}</p>
      <p><strong>Tipo:</strong> ${ownershipType === 'owner' ? 'Propietario' : 'Inquilino'}</p>
      <p>Este enlace expira en 7 días.</p>`,
  });
}

async function sendPasswordResetEmail({ email, resetUrl }) {
  return transporter.sendMail({
    from: '"Comunidad App" <noreply@comunidad.app>',
    to: email,
    subject: 'Restablecer contraseña',
    html: `<h2>Restablecimiento de contraseña</h2>
      <p>Hacé clic en el siguiente enlace para restablecer tu contraseña:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>Este enlace expira en 1 hora.</p>
      <p>Si no solicitaste este cambio, ignorá este mensaje.</p>`,
  });
}

module.exports = { sendResidentInviteEmail, sendPasswordResetEmail };
```

Do not add logging to this service.

- [ ] **Step 4: Rewire existing controllers and test mocks**

Replace the admin controller's local Nodemailer transport with:

```js
const { sendResidentInviteEmail } = require('../services/accountEmail');
```

Replace the auth controller's local transport with:

```js
const { sendPasswordResetEmail } = require('../services/accountEmail');
```

Creation calls `sendResidentInviteEmail` with the existing trusted invite URL. `scheduleResetEmail` calls `sendPasswordResetEmail`. Remove `nodemailer.getTestMessageUrl(info)` logging. Update existing controller test loaders to mock `../services/accountEmail`, not `nodemailer`.

- [ ] **Step 5: Run focused GREEN**

Run:

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/accountEmailService.test.js test/b35cTenantIsolation.test.js test/authPasswordResetSecurity.test.js
```

Expected: all selected tests pass with no raw token or credential printed.

- [ ] **Step 6: Commit the service boundary**

```powershell
git add src/backend/services/accountEmail.js src/backend/test/accountEmailService.test.js src/backend/controllers/adminController.js src/backend/controllers/authController.js src/backend/test/b35cTenantIsolation.test.js src/backend/test/authPasswordResetSecurity.test.js
git commit -m "refactor: centralize account email delivery"
```

---

### Task 2: Tenant-Scoped Administrative Invite Listing

**Files:**

- Modify: `src/backend/models/Invite.js:14-76`
- Modify: `src/backend/controllers/adminController.js`
- Modify: `src/backend/routes/admin.js:9-11`
- Create: `src/backend/test/adminInviteLifecycle.test.js`

**Interfaces:**

- Produces: `Invite.listByCommunity(communityId) => Promise<InviteSummary[]>`.
- Produces: `adminController.listInvites(req, res)` returning an array of non-secret summaries.
- Produces: authenticated admin route `GET /api/admin/invites`.

- [ ] **Step 1: Write RED model and controller tests**

Add tests that execute the real model/controller with database and service boundaries mocked:

```js
test('admin listing binds req.communityId and omits invitation credentials', async () => {
  let receivedCommunity;
  const controller = loadAdminController({
    inviteImpl: {
      async listByCommunity(communityId) {
        receivedCommunity = communityId;
        return [{
          id: 41,
          email: 'resident@example.test',
          unit_id: 11,
          unit_number: 'A-101',
          ownership_type: 'owner',
          expires_at: '2026-09-12T12:00:00.000Z',
          used: false,
          status: 'pending',
          created_at: '2026-09-05T12:00:00.000Z',
        }];
      },
    },
  });
  const res = response();

  await controller.listInvites({ communityId: 7, user: { id: 2, role: 'admin' } }, res);

  assert.equal(receivedCommunity, 7);
  assert.equal(res.statusCode, 200);
  assert.equal(Object.hasOwn(res.body[0], 'token'), false);
  assert.equal(Object.hasOwn(res.body[0], 'token_hash'), false);
});

test('Invite.listByCommunity filters by community and derives pending expired used', async () => {
  const Invite = loadInviteModel(capturingPool);
  await Invite.listByCommunity(7);
  assert.match(capturedSql, /i\.community_id\s*=\s*\$1/i);
  assert.match(capturedSql, /WHEN i\.used IS TRUE THEN 'used'/i);
  assert.match(capturedSql, /i\.expires_at <= NOW\(\).*'expired'/i);
  assert.doesNotMatch(capturedSql, /token_hash|\bi\.token\b/i);
  assert.deepEqual(capturedParams, [7]);
});
```

The model fake returns one local row and one would-be foreign row only when no community parameter is supplied, proving the production query passes the tenant argument.

- [ ] **Step 2: Run RED for absent listing interfaces**

Run:

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/adminInviteLifecycle.test.js
```

Expected: FAIL because `Invite.listByCommunity` and `adminController.listInvites` do not exist.

- [ ] **Step 3: Implement `Invite.listByCommunity`**

Add this query without selecting `token_hash`:

```js
async listByCommunity(communityId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.email, i.unit_id, i.unit_number, i.ownership_type,
            i.expires_at, i.used, i.created_at,
            CASE
              WHEN i.used IS TRUE THEN 'used'
              WHEN i.expires_at <= NOW() THEN 'expired'
              ELSE 'pending'
            END AS status
       FROM invites i
      WHERE i.community_id = $1
      ORDER BY i.created_at DESC, i.id DESC`,
    [communityId]
  );
  return rows;
}
```

- [ ] **Step 4: Implement controller and route**

Add:

```js
exports.listInvites = async (req, res) => {
  try {
    res.json(await Invite.listByCommunity(req.communityId));
  } catch (err) {
    console.error('Error en listInvites:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
```

Register before parameterized resend routes:

```js
router.get('/invites', authenticate, authorize('admin'), setCommunity, adminController.listInvites);
```

- [ ] **Step 5: Add route-role RED/GREEN assertions**

Mount `routes/admin.js` with mocked authentication roles and assert:

```js
assert.equal((await requestAdminRoute('admin', 'GET', '/invites')).status, 200);
assert.equal((await requestAdminRoute('residente', 'GET', '/invites')).status, 403);
assert.equal((await requestAdminRoute('access_operator', 'GET', '/invites')).status, 403);
```

Run the focused file after writing the assertions; they must fail before the route is registered and pass afterward.

- [ ] **Step 6: Run focused GREEN**

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/adminInviteLifecycle.test.js
```

Expected: all listing, privacy, tenant, and role tests pass.

- [ ] **Step 7: Commit listing**

```powershell
git add src/backend/models/Invite.js src/backend/controllers/adminController.js src/backend/routes/admin.js src/backend/test/adminInviteLifecycle.test.js
git commit -m "feat: list resident invitations"
```

---

### Task 3: Transactional Invite Token Rotation and Resend

**Files:**

- Modify: `src/backend/models/Invite.js`
- Modify: `src/backend/controllers/adminController.js`
- Modify: `src/backend/routes/admin.js`
- Modify: `src/backend/test/adminInviteLifecycle.test.js`
- Modify: `src/backend/test/b35bIdentityModels.test.js`
- Modify: `src/backend/test/b35bOnboarding.test.js`

**Interfaces:**

- Produces: `Invite.rotatePending(id, communityId) => Promise<(InviteSummary & { token: string }) | null>`.
- Produces: `adminController.resendInvite(req, res)`.
- Produces: authenticated admin route `POST /api/admin/invites/:id/resend`.
- Consumes: `sendResidentInviteEmail` from Task 1.

- [ ] **Step 1: Write RED transaction tests**

Use a transaction-client fake that records SQL and returns a local pending invitation only for `[id, communityId]`. Assert:

```js
test('rotatePending locks and updates the same local pending row with hash only', async () => {
  const rotated = await Invite.rotatePending(41, 7);
  assert.equal(events[0], 'BEGIN');
  assert.match(lockCall.sql, /WHERE i\.id = \$1[\s\S]*i\.community_id = \$2/i);
  assert.match(lockCall.sql, /i\.used IS NOT TRUE[\s\S]*i\.expires_at > NOW\(\)/i);
  assert.match(lockCall.sql, /FOR UPDATE OF i, un/i);
  assert.match(updateCall.sql, /UPDATE invites[\s\S]*token_hash = \$1[\s\S]*expires_at = \$2/i);
  assert.equal(updateCall.params[0], sha256(rotated.token));
  assert.notEqual(updateCall.params[0], rotated.token);
  assert.equal(updateCall.params[2], 41);
  assert.equal(updateCall.params[3], 7);
  assert.equal(events.at(-2), 'COMMIT');
  assert.equal(events.at(-1), 'RELEASE');
});
```

Add separate tests for foreign ID, used, expired, inactive/foreign unit, update failure rollback, and `release()` on every path. Each rejection must perform no update and return `null` or throw only for a real database failure.

- [ ] **Step 2: Run RED for missing rotation**

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/adminInviteLifecycle.test.js
```

Expected: FAIL because `Invite.rotatePending` does not exist.

- [ ] **Step 3: Implement `Invite.rotatePending`**

Add a local rollback helper that cannot mask the original database error:

```js
async function rollback(client) {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.error('Error en rollback de invitación:', rollbackError.message);
  }
}
```

Then implement:

```js
async rotatePending(id, communityId) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const { rows } = await client.query(
      `SELECT i.id, i.email, i.community_id, i.unit_id, i.unit_number,
              i.ownership_type, i.expires_at, i.used, i.created_at
         FROM invites i
         JOIN units un ON un.id = i.unit_id
         JOIN floors f ON f.id = un.floor_id
         JOIN buildings b ON b.id = f.building_id
         JOIN complexes cx ON cx.id = b.complex_id
        WHERE i.id = $1
          AND i.community_id = $2
          AND i.used IS NOT TRUE
          AND i.expires_at > NOW()
          AND cx.community_id = $2
          AND COALESCE(un.is_active, TRUE) = TRUE
          AND un.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND b.deleted_at IS NULL
          AND cx.deleted_at IS NULL
        FOR UPDATE OF i, un`,
      [id, communityId]
    );
    if (!rows[0]) {
      await rollback(client);
      transactionOpen = false;
      return null;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000);
    const update = await client.query(
      `UPDATE invites
          SET token_hash = $1, expires_at = $2
        WHERE id = $3 AND community_id = $4 AND used IS NOT TRUE
        RETURNING id, email, community_id, unit_id, unit_number,
                  ownership_type, expires_at, used, created_at`,
      [tokenHash, expiresAt, id, communityId]
    );
    if (!update.rows[0]) throw new Error('INVITE_ROTATION_LOST');
    await client.query('COMMIT');
    transactionOpen = false;
    return { ...update.rows[0], status: 'pending', token };
  } catch (err) {
    if (transactionOpen) await rollback(client);
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Write RED controller semantics tests**

Add explicit tests:

```js
test('same-community pending resend commits rotation then reports SMTP success', async () => {
  await controller.resendInvite(requestFor(41, 7), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email_sent, true);
  assert.equal(res.body.delivery_warning, null);
  assert.equal(Object.hasOwn(res.body, 'token'), false);
  assert.equal(Object.hasOwn(res.body, 'token_hash'), false);
  assert.match(sentMail.inviteUrl, /\/register#token=/);
});

test('SMTP failure after resend remains success with the rotated row', async () => {
  await controller.resendInvite(requestFor(41, 7), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Invitación renovada');
  assert.equal(res.body.email_sent, false);
  assert.match(res.body.delivery_warning, /renovada.*no se pudo enviar/i);
  assert.equal(rotationCalls, 1);
});

test('foreign used expired or missing invite has one safe response and no SMTP attempt', async () => {
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Invitación pendiente no encontrada' });
  assert.equal(emailAttempts, 0);
});
```

Also test a thrown database error produces `500` and no email attempt.

- [ ] **Step 5: Implement controller and route**

Create a private `buildInviteUrl(token)` using `getPublicAppOrigin()`, then add:

```js
exports.resendInvite = async (req, res) => {
  try {
    const invite = await Invite.rotatePending(req.params.id, req.communityId);
    if (!invite) {
      return res.status(404).json({ error: 'Invitación pendiente no encontrada' });
    }

    let emailSent = false;
    let deliveryWarning = null;
    try {
      await sendResidentInviteEmail({
        email: invite.email,
        inviteUrl: buildInviteUrl(invite.token).toString(),
        unitNumber: invite.unit_number,
        ownershipType: invite.ownership_type,
      });
      emailSent = true;
    } catch (emailError) {
      deliveryWarning = 'La invitación fue renovada, pero no se pudo enviar el email.';
      console.error('Invitación renovada; falló el envío de email:', emailError.message);
    }

    const { token, community_id, ...summary } = invite;
    return res.json({
      ...summary,
      message: emailSent ? 'Invitación reenviada' : 'Invitación renovada',
      email_sent: emailSent,
      delivery_warning: deliveryWarning,
    });
  } catch (err) {
    console.error('Error en resendInvite:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
```

Register:

```js
router.post('/invites/:id/resend', authenticate, authorize('admin'), setCommunity, adminController.resendInvite);
```

Do not log `invite`, `token`, URLs, request bodies, or email bodies.

Run the route test RED before registering the endpoint, then assert the final authorization contract:

```js
assert.equal((await requestAdminRoute('admin', 'POST', '/invites/41/resend')).status, 200);
assert.equal((await requestAdminRoute('residente', 'POST', '/invites/41/resend')).status, 403);
assert.equal((await requestAdminRoute('access_operator', 'POST', '/invites/41/resend')).status, 403);
```

- [ ] **Step 6: Test old-token invalidation and acceptance compatibility**

Extend model/onboarding tests with a fake persistence record:

```js
const oldToken = '1'.repeat(64);
const oldHash = sha256(oldToken);
const rotated = await Invite.rotatePending(41, 7);
assert.notEqual(persistedHash, oldHash);
assert.equal(await findByPresentedToken(oldToken), null);
assert.equal((await findByPresentedToken(rotated.token)).id, 41);
```

Retain the existing assertions that acceptance locks the invitation, creates one user/ownership, marks it used, commits once, and rejects reuse.

- [ ] **Step 7: Test concurrency semantics**

Use a shared row-lock fake to hold the first `SELECT ... FOR UPDATE` until the second rotation has started. Release it, let both rotations complete in order, and assert:

```js
assert.equal(first.id, 41);
assert.equal(second.id, 41);
assert.notEqual(first.token, second.token);
assert.equal(persistedHash, sha256(second.token));
assert.equal(await findByPresentedToken(first.token), null);
assert.equal((await findByPresentedToken(second.token)).id, 41);
assert.equal(insertCount, 0);
```

This models PostgreSQL row-lock serialization; Task 8 repeats it against Docker PostgreSQL.

- [ ] **Step 8: Run focused GREEN**

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/adminInviteLifecycle.test.js test/b35bIdentityModels.test.js test/b35bOnboarding.test.js test/b35cTenantIsolation.test.js
```

Expected: all selected tests pass; no plaintext credential is persisted or printed.

- [ ] **Step 9: Commit secure resend**

```powershell
git add src/backend/models/Invite.js src/backend/controllers/adminController.js src/backend/routes/admin.js src/backend/test/adminInviteLifecycle.test.js src/backend/test/b35bIdentityModels.test.js src/backend/test/b35bOnboarding.test.js
git commit -m "feat: rotate and resend resident invitations"
```

---

### Task 4: Responsive Admin Invite Management

**Files:**

- Create: `src/frontend/src/utils/invitePresentation.js`
- Create: `src/frontend/test/accountLifecycle.test.js`
- Modify: `src/frontend/src/pages/InviteResidente.jsx`

**Interfaces:**

- Produces: `partitionInvites(invites) => { pending, history }`.
- Produces: `inviteStatusLabel(status) => string`.
- Consumes: `GET /admin/invites` and `POST /admin/invites/:id/resend` through the existing `api` client.

- [ ] **Step 1: Write RED presentation tests**

Create `src/frontend/test/accountLifecycle.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionInvites, inviteStatusLabel } from '../src/utils/invitePresentation.js';

test('invite presentation separates pending from immutable history', () => {
  const rows = [
    { id: 1, status: 'pending' },
    { id: 2, status: 'used' },
    { id: 3, status: 'expired' },
  ];
  assert.deepEqual(partitionInvites(rows), {
    pending: [rows[0]],
    history: [rows[1], rows[2]],
  });
});

test('invite status labels expose only user-facing state', () => {
  assert.equal(inviteStatusLabel('pending'), 'Pendiente');
  assert.equal(inviteStatusLabel('used'), 'Usada');
  assert.equal(inviteStatusLabel('expired'), 'Vencida');
});
```

- [ ] **Step 2: Run RED for missing presentation utility**

```powershell
cd src/frontend
node --test test/accountLifecycle.test.js
```

Expected: FAIL because `invitePresentation.js` does not exist.

- [ ] **Step 3: Implement the presentation utility**

```js
export function partitionInvites(invites) {
  return invites.reduce((groups, invite) => {
    groups[invite.status === 'pending' ? 'pending' : 'history'].push(invite);
    return groups;
  }, { pending: [], history: [] });
}

export function inviteStatusLabel(status) {
  return { pending: 'Pendiente', used: 'Usada', expired: 'Vencida' }[status] || 'Desconocida';
}
```

- [ ] **Step 4: Write the admin page behavior before implementation**

Extend `InviteResidente` state with:

```js
const [invites, setInvites] = useState([]);
const [listLoading, setListLoading] = useState(true);
const [listError, setListError] = useState('');
const [resendingId, setResendingId] = useState(null);
```

Define exact API operations:

```js
async function loadInvites() {
  setListLoading(true);
  setListError('');
  try {
    const { data } = await api.get('/admin/invites');
    setInvites(data);
  } catch (err) {
    setListError(getErrorMessage(err, 'No pudimos cargar las invitaciones.'));
  } finally {
    setListLoading(false);
  }
}

async function handleResend(inviteId) {
  const { data } = await api.post(`/admin/invites/${inviteId}/resend`);
  setMsgType(data.email_sent ? 'success' : 'warning');
  setMsg(data.email_sent
    ? 'Invitación reenviada correctamente.'
    : data.delivery_warning || 'La invitación fue renovada, pero no se pudo enviar el email.');
  await loadInvites();
}
```

Call `loadInvites()` on mount and whenever the selected complex from `useCommunity()` changes. Reuse it after successful creation.

- [ ] **Step 5: Render pending and history sections**

Render cards with email, `unit_number`, owner/tenant label, localized expiration, status, and a `Reenviar` button only when `status === 'pending'`. Use a responsive grid:

```js
listGrid: {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '0.75rem',
},
```

Never render or destructure `token`/`token_hash`. Disable only the row currently resending.

- [ ] **Step 6: Run frontend tests and production build**

```powershell
cd src/frontend
node --test test/*.test.js
npm run build
```

Expected: all frontend Node tests and the Vite production build pass.

- [ ] **Step 7: Commit admin UI**

```powershell
git add src/frontend/src/utils/invitePresentation.js src/frontend/test/accountLifecycle.test.js src/frontend/src/pages/InviteResidente.jsx
git commit -m "feat: manage resident invitations"
```

---

### Task 5: Forgot Password Request UI

**Files:**

- Create: `src/frontend/src/services/accountRecovery.js`
- Create: `src/frontend/src/pages/ForgotPassword.jsx`
- Modify: `src/frontend/src/pages/Login.jsx`
- Modify: `src/frontend/src/App.jsx`
- Modify: `src/frontend/test/accountLifecycle.test.js`

**Interfaces:**

- Produces: `createAccountRecoveryService(client)` with `request(email)` and `reset(token, password)`.
- Produces: public route `/forgot-password`.
- Consumes: `POST /api/auth/forgot-password`.

- [ ] **Step 1: Write RED API-service tests**

Append:

```js
import { createAccountRecoveryService } from '../src/services/accountRecovery.js';

test('account recovery service sends only the email on forgot request', async () => {
  const calls = [];
  const service = createAccountRecoveryService({
    post: async (...args) => { calls.push(args); return { data: { message: 'generic' } }; },
  });
  await service.request('resident@example.test');
  assert.deepEqual(calls, [['/auth/forgot-password', { email: 'resident@example.test' }]]);
});

test('account recovery service sends the encoded token only in the reset path', async () => {
  const calls = [];
  const service = createAccountRecoveryService({
    post: async (...args) => { calls.push(args); return { data: { message: 'updated' } }; },
  });
  await service.reset('token/with spaces', 'Secure123!');
  assert.deepEqual(calls, [[
    '/auth/reset-password/token%2Fwith%20spaces',
    { password: 'Secure123!' },
  ]]);
});
```

- [ ] **Step 2: Run RED for missing recovery service**

```powershell
cd src/frontend
node --test test/accountLifecycle.test.js
```

Expected: FAIL because `accountRecovery.js` does not exist.

- [ ] **Step 3: Implement account recovery service**

```js
import api from './api';

export function createAccountRecoveryService(client = api) {
  return {
    request(email) {
      return client.post('/auth/forgot-password', { email });
    },
    reset(token, password) {
      return client.post(`/auth/reset-password/${encodeURIComponent(token)}`, { password });
    },
  };
}

export default createAccountRecoveryService();
```

- [ ] **Step 4: Implement public Forgot Password page**

Create a responsive card matching Login/Register. On submit:

```js
try {
  const { data } = await accountRecovery.request(email);
  setMessage(data.message);
  setError('');
} catch (err) {
  setMessage('');
  setError(getErrorMessage(err, 'No pudimos procesar la solicitud. Intentá nuevamente.'));
}
```

Render email, `Enviar instrucciones`, the generic success text, technical error text, and a Login link. Do not vary success UI by account existence.

- [ ] **Step 5: Add Login link and public route**

Import `ForgotPassword`, add:

```jsx
<Route path="/forgot-password" element={<ForgotPassword />} />
```

and add to Login:

```jsx
<p style={styles.link}><Link to="/forgot-password">¿Olvidaste tu contraseña?</Link></p>
```

- [ ] **Step 6: Run frontend GREEN and build**

```powershell
cd src/frontend
node --test test/*.test.js
npm run build
```

Expected: tests and build pass; `/forgot-password` is present in the generated route graph.

- [ ] **Step 7: Commit forgot-password UI**

```powershell
git add src/frontend/src/services/accountRecovery.js src/frontend/src/pages/ForgotPassword.jsx src/frontend/src/pages/Login.jsx src/frontend/src/App.jsx src/frontend/test/accountLifecycle.test.js
git commit -m "feat: add password recovery request"
```

---

### Task 6: Trusted Recovery Fragment and Reset Password UI

**Files:**

- Create: `src/frontend/src/utils/fragmentToken.js`
- Create: `src/frontend/src/pages/ResetPassword.jsx`
- Modify: `src/frontend/src/pages/Login.jsx`
- Modify: `src/frontend/src/App.jsx`
- Modify: `src/frontend/test/accountLifecycle.test.js`
- Modify: `src/backend/controllers/authController.js:214-237`
- Modify: `src/backend/test/authPasswordResetSecurity.test.js:45-180`

**Interfaces:**

- Produces: `consumeFragmentToken(windowLike) => string | null`.
- Produces: public route `/reset-password`.
- Consumes: `accountRecovery.reset(token, password)` from Task 5.
- Backend continues consuming `POST /api/auth/reset-password/:token`.

- [ ] **Step 1: Write RED fragment-security tests**

Append:

```js
import { consumeFragmentToken } from '../src/utils/fragmentToken.js';

test('fragment token is returned and immediately removed without storage access', () => {
  const replacements = [];
  const windowLike = {
    location: { hash: '#token=' + 'c'.repeat(64), pathname: '/reset-password', search: '?source=email' },
    history: { replaceState: (...args) => replacements.push(args) },
    localStorage: { setItem: () => assert.fail('must not use localStorage') },
    sessionStorage: { setItem: () => assert.fail('must not use sessionStorage') },
  };
  assert.equal(consumeFragmentToken(windowLike), 'c'.repeat(64));
  assert.deepEqual(replacements, [[null, '', '/reset-password?source=email']]);
});

test('missing fragment token returns null and leaves the URL untouched', () => {
  let replaced = false;
  const windowLike = {
    location: { hash: '', pathname: '/reset-password', search: '' },
    history: { replaceState: () => { replaced = true; } },
  };
  assert.equal(consumeFragmentToken(windowLike), null);
  assert.equal(replaced, false);
});
```

- [ ] **Step 2: Write RED trusted-link backend assertion**

Change existing recovery expectations from the API link to:

```js
assert.match(mail.html, /https:\/\/trusted\.example\.test\/reset-password#token=[a-f0-9]{64}/);
assert.doesNotMatch(mail.html, /api\/auth\/reset-password|host-attacker|forwarded-attacker/);
```

Extract the test token only inside test memory from `/#token=([a-f0-9]{64})/` so the existing one-time reset controller test can submit it without logging it.

- [ ] **Step 3: Run both RED suites**

```powershell
cd src/frontend
node --test test/accountLifecycle.test.js
cd ../backend
node --require ./test/setupEnvironment.js --test test/authPasswordResetSecurity.test.js
```

Expected: frontend fails because `fragmentToken.js` is missing; backend fails because email still contains the API URL.

- [ ] **Step 4: Implement fragment helper**

```js
export function consumeFragmentToken(windowLike) {
  const hash = windowLike.location.hash;
  if (!hash) return null;
  const token = new URLSearchParams(hash.slice(1)).get('token');
  if (!token) return null;
  windowLike.history.replaceState(
    null,
    '',
    `${windowLike.location.pathname}${windowLike.location.search}`
  );
  return token;
}
```

Do not reference either browser storage API in production code.

- [ ] **Step 5: Change backend link construction**

Use:

```js
const resetUrl = new URL('/reset-password', `${getPublicAppOrigin()}/`);
resetUrl.hash = `token=${encodeURIComponent(resetToken)}`;
```

Pass `resetUrl.toString()` to `sendPasswordResetEmail`. Keep the public reset API route and generic forgot response unchanged.

- [ ] **Step 6: Implement Reset Password page**

Initialize memory and clear the URL synchronously:

```js
const [resetToken, setResetToken] = useState(() => consumeFragmentToken(window));
```

Validate non-empty fields, minimum six characters, and equality before calling:

```js
await accountRecovery.reset(resetToken, password);
setResetToken(null);
navigate('/login', {
  replace: true,
  state: { passwordReset: true },
});
```

Map any backend `400` to `El enlace es inválido, venció o ya fue utilizado.` and other failures through a generic technical message. A missing token renders the same invalid-link text and disables submission.

- [ ] **Step 7: Add route and Login confirmation**

Register:

```jsx
<Route path="/reset-password" element={<ResetPassword />} />
```

Use `useLocation()` in Login and render only this fixed message when `location.state?.passwordReset === true`:

```text
Contraseña actualizada. Ya podés ingresar.
```

Do not render arbitrary navigation-state strings.

- [ ] **Step 8: Run focused GREEN**

```powershell
cd src/frontend
node --test test/*.test.js
npm run build
cd ../backend
node --require ./test/setupEnvironment.js --test test/authPasswordResetSecurity.test.js test/authSessionRevocation.test.js test/passwordRecoveryModel.test.js
```

Expected: fragment, trusted-origin, one-time reset, session revocation, frontend tests, and build all pass.

- [ ] **Step 9: Commit browser recovery flow**

```powershell
git add src/frontend/src/utils/fragmentToken.js src/frontend/src/pages/ResetPassword.jsx src/frontend/src/pages/Login.jsx src/frontend/src/App.jsx src/frontend/test/accountLifecycle.test.js src/backend/controllers/authController.js src/backend/test/authPasswordResetSecurity.test.js
git commit -m "feat: complete browser password recovery"
```

---

### Task 7: Docker SMTP Configuration Pass-Through

**Files:**

- Create: `src/backend/test/accountLifecycleConfig.test.js`
- Modify: `docker-compose.yml:40-45`
- Modify: `src/backend/.env.example:9-12`

**Interfaces:**

- Produces: Compose inputs `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS`.
- Consumes: the same variables in `accountEmail.js`.

- [ ] **Step 1: Write RED configuration test**

Create a Node test that reads the repository Compose file and asserts exact pass-through without embedded credentials:

```js
test('Docker passes SMTP configuration without committed credentials', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docker-compose.yml'), 'utf8');
  assert.match(compose, /EMAIL_HOST:\s*\$\{EMAIL_HOST:-smtp\.ethereal\.email\}/);
  assert.match(compose, /EMAIL_PORT:\s*['"]?\$\{EMAIL_PORT:-587\}['"]?/);
  assert.match(compose, /EMAIL_USER:\s*['"]?\$\{EMAIL_USER:-\}['"]?/);
  assert.match(compose, /EMAIL_PASS:\s*['"]?\$\{EMAIL_PASS:-\}['"]?/);
  assert.doesNotMatch(compose, /EMAIL_(?:USER|PASS):\s*[^$\s][^\r\n]*/);
});
```

- [ ] **Step 2: Run RED against hard-coded empty values**

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/accountLifecycleConfig.test.js
```

Expected: FAIL because Compose currently hard-codes SMTP values.

- [ ] **Step 3: Implement non-secret Compose pass-through**

Replace the four entries with:

```yaml
EMAIL_HOST: ${EMAIL_HOST:-smtp.ethereal.email}
EMAIL_PORT: '${EMAIL_PORT:-587}'
EMAIL_USER: '${EMAIL_USER:-}'
EMAIL_PASS: '${EMAIL_PASS:-}'
```

Keep values empty by default. Do not make SMTP startup-critical because delivery failure is an explicit supported state.

- [ ] **Step 4: Clarify `.env.example` without a credential value**

Document that `EMAIL_USER`/`EMAIL_PASS` must be set for real delivery and that ephemeral test SMTP does not satisfy pilot-provider readiness. Keep both values empty.

- [ ] **Step 5: Run configuration GREEN and Compose rendering check**

Use temporary process-environment values that are not real credentials and do not print the rendered environment:

```powershell
cd src/backend
node --require ./test/setupEnvironment.js --test test/accountLifecycleConfig.test.js
cd ../..
$env:EMAIL_HOST='smtp.example.test'
$env:EMAIL_PORT='2525'
$env:EMAIL_USER='synthetic-user'
$env:EMAIL_PASS='synthetic-pass'
docker compose config --quiet
Remove-Item Env:EMAIL_HOST,Env:EMAIL_PORT,Env:EMAIL_USER,Env:EMAIL_PASS
```

Expected: test passes and `docker compose config --quiet` exits zero without printing values.

- [ ] **Step 6: Commit SMTP configuration**

```powershell
git add docker-compose.yml src/backend/.env.example src/backend/test/accountLifecycleConfig.test.js
git commit -m "chore: configure account email delivery"
```

---

### Task 8: Full Regression, Docker, and Live Account E2E

**Files:**

- Verify only; no planned production edit.

**Interfaces:**

- Consumes all interfaces from Tasks 1-7.
- Produces verification evidence and a cleaned live environment.

- [ ] **Step 1: Run full automated verification**

```powershell
cd src/backend
npm test
cd ../frontend
node --test test/*.test.js
npm run build
cd ../..
git diff --check
```

Expected: zero failed backend/frontend tests, successful Vite build, and clean whitespace check. Record exact pass/skip totals.

- [ ] **Step 2: Rebuild Docker with explicit safe configuration**

Set strong ephemeral JWT and invitation secrets plus `PUBLIC_APP_URL=http://localhost:8080` without printing them. Set SMTP variables from the approved pilot SMTP account or an ephemeral test account. Then run:

```powershell
docker compose up -d --build
docker compose ps
```

Expected: frontend/backend up, PostgreSQL/Redis healthy, and no secret printed. Confirm `GET http://localhost:8080/api/health` returns `200`.

- [ ] **Step 3: Verify successful invite onboarding with a non-seeded user**

Generate a unique QA email in process memory. Through the browser:

1. Log in as admin.
2. Create an owner invite in the selected community.
3. Confirm the API/UI reports `email_sent=true`.
4. Receive the SMTP message and open `/register#token=...` without copying the token into terminal output.
5. Confirm the address bar immediately becomes `/register`.
6. Register and confirm unit, community, role, and owner classification came only from the invitation.
7. Log out and log in with the new credentials.

- [ ] **Step 4: Verify resend, failure semantics, and old-link invalidation**

Use a second unique QA email. First create it while SMTP works and retain the original email link only in browser memory/history. Then:

1. Disable SMTP delivery and press `Reenviar`.
2. Confirm HTTP success, `email_sent=false`, the delivery warning, unchanged invitation row ID, and exactly one invitation row for the email.
3. Open the original link and confirm safe rejection because the failed-delivery resend still committed rotation.
4. Restore SMTP and press `Reenviar` again.
5. Receive the new email, confirm the same row ID, and accept the newest link successfully.

For concurrency, issue two resend requests simultaneously against a third pending QA invitation while capturing both SMTP messages. Confirm one database row, two serialized updates, and that only the link from the last committed hash can register. Duplicate email delivery is recorded as the accepted B36.1A observation.

- [ ] **Step 5: Verify foreign and role boundaries live**

Using two communities and valid foreign IDs:

- local admin list contains only local invitations;
- local admin resend of a foreign invitation returns safe `404`;
- resident and access operator receive `403` for list and resend;
- foreign invitation row and hash remain unchanged.

Inspect only equality/count/status evidence; never print hashes.

- [ ] **Step 6: Verify browser password recovery and JWT revocation**

For the new resident:

1. Capture an existing JWT only in process memory.
2. Use the Login recovery link and request instructions.
3. Confirm the UI shows the same generic message used for an unknown email.
4. Receive the real SMTP recovery email.
5. Open `/reset-password#token=...`; confirm the fragment is immediately absent and storage contains no reset token.
6. Submit matching new passwords and confirm redirect to Login with the fixed success message.
7. Confirm the old JWT receives `401` from `/api/users/me` without printing it.
8. Confirm the old password fails and the new password logs in.
9. Reuse the reset link and confirm the generic invalid/expired/used message.

- [ ] **Step 7: Validate desktop and mobile UX**

At 1366 px or wider and approximately 390×844, inspect:

- admin invite creation, pending list, history list, delivery warnings, and resend disabled/loading state;
- Login forgot-password link and reset-success message;
- forgot-password form and generic confirmation;
- reset-password validation, missing/invalid-token state, and successful redirect;
- register fragment cleanup.

Confirm no horizontal overflow, clipped actions, token display, or secret-bearing URL after initial load. Reset browser viewport when finished.

- [ ] **Step 8: Clean QA fixtures with exact identities**

Record the exact QA invitation IDs and user IDs during creation. In one database transaction, delete only dependent QA rows for those exact IDs in foreign-key order, then delete the exact QA users and invites. Roll back if any selected row does not carry the recorded QA email. Verify:

```sql
SELECT count(*) FROM users WHERE email IN (the exact QA email values);
SELECT count(*) FROM invites WHERE email IN (the exact QA email values);
```

Expected: both counts are zero. Do not use a broad wildcard or touch seeded/user-owned data.

- [ ] **Step 9: Final repository evidence**

```powershell
git diff --check
git status -sb
git log --oneline --max-count=10
docker compose ps
```

Expected: only the focused B36.1A commits are ahead of `origin/main`, worktree clean, stack healthy, and no push performed.

- [ ] **Step 10: Apply the GO gate**

- `GO`: complete lifecycle and resend proven with the SMTP configuration intended for the pilot.
- `GO WITH OBSERVATIONS`: implementation and all security/live checks pass, but delivery is proven only with ephemeral SMTP; Comunidad App remains `NOT READY FOR PILOT`.
- `NO-GO`: any failed test, credential exposure, tenant/role bypass, token reuse, partial transaction, missing real SMTP proof, or incomplete cleanup not covered by the allowed observation.

---

## Execution Order and Commit Boundaries

1. `refactor: centralize account email delivery`
2. `feat: list resident invitations`
3. `feat: rotate and resend resident invitations`
4. `feat: manage resident invitations`
5. `feat: add password recovery request`
6. `feat: complete browser password recovery`
7. `chore: configure account email delivery`
8. Full verification and live QA; no additional commit unless verification exposes a defect, in which case reproduce it RED and amend the owning focused task rather than creating unrelated work.

Do not push any commit during B36.1A implementation.
