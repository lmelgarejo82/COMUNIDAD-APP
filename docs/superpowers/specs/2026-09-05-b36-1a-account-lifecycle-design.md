# B36.1A Account Lifecycle Design

## Goal

Close the account lifecycle required for a real controlled pilot:

```text
admin creates resident invite
→ resident receives email
→ resident accepts the invite and creates an account
→ resident logs in
→ resident requests password recovery
→ resident receives recovery email
→ resident changes the password in the browser
→ old JWT is rejected
→ resident logs in with the new password
```

An administrator must also be able to recover a pending resident invitation whose email was not delivered. Recovery rotates the credential in the existing row; it does not create a second invitation or expose a token.

## Repository Baseline and Confirmed Contracts

The design is based on `main` at `1ad6e3b49e4a22b6b4a53e4debfca3b24a46bc4a`, synchronized with `origin/main` and clean at inspection time.

Current authoritative components:

- `src/backend/models/Invite.js` creates SHA-256-hashed resident invite tokens, locks a token during acceptance, and marks it used once.
- `src/backend/controllers/adminController.js` creates resident invitations and sends their email after persistence.
- `src/backend/routes/admin.js` mounts admin operations under `/api/admin` with authentication, admin authorization, and `setCommunity`.
- `src/backend/controllers/authController.js` implements invite registration, login, forgot password, and reset password.
- `src/backend/routes/auth.js` exposes the public auth POST routes behind the existing auth/recovery rate limiters.
- `src/frontend/src/pages/Register.jsx` already consumes an invitation token from the URL fragment into React memory and immediately clears the fragment with `history.replaceState`.
- `src/frontend/src/pages/Login.jsx` has no recovery entry point.
- `src/frontend/src/App.jsx` has public `/login` and `/register` routes but no forgot/reset pages.
- `src/frontend/src/services/api.js` is the shared Axios client.
- `src/frontend/test/hierarchyWorkLimits.test.js` establishes the dependency-free Node test pattern for pure frontend utilities.
- `docker-compose.yml` currently hard-codes empty SMTP credentials even though `src/backend/.env.example` documents the variable names.

The live `invites` schema has `id`, `email`, `community_id`, `unit_number`, `unit_id`, `ownership_type`, `token_hash`, `used`, `expires_at`, `created_at`, and `created_by`. It has no deletion column and no durable SMTP-delivery column. The live database had zero resident invitation rows during design inspection.

## Architecture

The existing `Invite` entity remains the only invitation authority. No schema migration or new dependency is required.

The implementation has four focused boundaries:

1. `accountEmail` owns SMTP transport construction and the two account-email templates.
2. `Invite` owns tenant-scoped listing and transactional token rotation.
3. `adminController` translates model results and SMTP outcomes into privacy-preserving API responses.
4. Small frontend services/pages implement admin management and public recovery while a pure fragment helper enforces token handling.

Raw invitation and reset tokens may exist only in process memory, the intended email body, the URL fragment during initial browser navigation, and the relevant API request. Database persistence remains hash-only.

## Shared SMTP Service

Create `src/backend/services/accountEmail.js` with one Nodemailer transporter configured from:

- `EMAIL_HOST`, defaulting to `smtp.ethereal.email` as today;
- `EMAIL_PORT`, defaulting to `587` as today;
- `EMAIL_USER`;
- `EMAIL_PASS`.

It exports:

```js
sendResidentInviteEmail({ email, inviteUrl, unitNumber, ownershipType })
sendPasswordResetEmail({ email, resetUrl })
```

Both functions return the Nodemailer `sendMail` promise. They do not log credentials, tokens, email bodies, or test-message URLs. Controllers may log a generic delivery failure without including the destination URL or SMTP credentials.

Creation, resend, and password recovery reuse this service. Database success and SMTP delivery remain separate concerns.

## Resident Invite Listing

### Endpoint

```http
GET /api/admin/invites
Authorization: Bearer <admin JWT>
```

Middleware order:

```text
authenticate → authorize('admin') → setCommunity → adminController.listInvites
```

`Invite.listByCommunity(communityId)` filters on `invites.community_id = req.communityId`. It returns only:

```json
{
  "id": 42,
  "email": "resident@example.com",
  "unit_id": 11,
  "unit_number": "A-101",
  "ownership_type": "owner",
  "expires_at": "2026-09-12T12:00:00.000Z",
  "used": false,
  "status": "pending",
  "created_at": "2026-09-05T12:00:00.000Z"
}
```

Status is derived at query time:

```text
used = true                 → used
used != true and expired    → expired
otherwise                   → pending
```

The response is a JSON array ordered newest first. It never contains `token`, `token_hash`, `created_by`, secrets, or SMTP internals. Historical rows use their stored `unit_number`; no delivery state is invented.

Residents and access operators receive the existing authorization `403`. Invitations from another community are absent from the result.

## Resident Invite Resend

### Endpoint

```http
POST /api/admin/invites/:id/resend
Authorization: Bearer <admin JWT>
```

Middleware order:

```text
authenticate → authorize('admin') → setCommunity → adminController.resendInvite
```

### Transaction

`Invite.rotatePending(id, communityId)` performs:

```text
acquire PostgreSQL client
→ BEGIN
→ SELECT invitation + active unit hierarchy
   WHERE invitation.id = id
     AND invitation.community_id = communityId
     AND used IS NOT TRUE
     AND expires_at > NOW()
     AND unit still belongs to communityId
   FOR UPDATE OF invitation and unit
→ generate 32 random bytes as lowercase hexadecimal token
→ hash token with SHA-256
→ UPDATE the same invitation row
   SET token_hash = new hash,
       expires_at = now + 7 days
→ COMMIT
→ return non-secret invitation fields plus raw token to the controller in memory
```

Any failure while the transaction is open rolls back and releases the client. The raw token is never inserted into the database.

There is no deletion column in the actual schema. Therefore the eligible state is exactly: same community, unused, unexpired, and backed by an active, non-deleted unit/building/floor/complex in that same community.

Foreign, used, expired, missing, or no-longer-valid-unit invitations receive the same safe response:

```http
404
{"error":"Invitación pendiente no encontrada"}
```

This avoids confirming foreign-resource existence.

## Concurrency Semantics

Acceptance and resend lock the same invitation row. If acceptance commits first, resend observes `used` and fails safely. If resend commits first, acceptance with the previous token no longer finds a matching hash.

Concurrent resends serialize on the row lock. Each update replaces the only stored hash; the last committed rotation determines the only valid token. More than one SMTP message may be delivered during concurrent resends, and an earlier message may contain a now-stale link. This duplicate-delivery limitation is accepted for B36.1A and must be reported as an observation rather than solved with a new idempotency subsystem.

## SMTP Semantics

Invitation creation remains:

```text
persist invitation successfully
→ attempt SMTP
→ delivery success: HTTP 201, email_sent=true
→ delivery failure: HTTP 201, email_sent=false, delivery_warning
```

Invitation resend is:

```text
commit rotated hash and renewed expiry
→ attempt SMTP
→ delivery success: HTTP 200, email_sent=true
→ delivery failure: HTTP 200, email_sent=false, delivery_warning
```

The resend response contains the non-secret invitation summary and:

```json
{
  "message": "Invitación reenviada",
  "email_sent": true,
  "delivery_warning": null
}
```

On SMTP failure, `message` becomes `Invitación renovada`, `email_sent` is `false`, and `delivery_warning` is `La invitación fue renovada, pero no se pudo enviar el email.` The rotation remains committed. SMTP failure alone never produces `500`.

Validation or database failure preserves real `4xx`/`5xx` behavior and does not attempt SMTP.

Password-recovery responses remain externally indistinguishable for unknown users, known users, and SMTP delivery failure. SMTP delivery stays asynchronous after the generic response.

## Forgot Password UI

Add public route `/forgot-password` and page `src/frontend/src/pages/ForgotPassword.jsx`.

Login displays `¿Olvidaste tu contraseña?` linking to that route.

The page contains:

```text
Email
[Enviar instrucciones]
```

It sends `POST /api/auth/forgot-password` with `{ email }`. Any successful generic backend response shows the same text supplied by the API. Unknown email, known email, and background SMTP failure are therefore indistinguishable to the user.

A rate-limit or server failure shows a generic technical message. SMTP internals are never displayed. The page links back to Login and is responsive at approximately 390 px.

## Recovery Link and Reset Password UI

The emailed link changes from the current API URL to:

```text
PUBLIC_APP_URL/reset-password#token=<opaque-token>
```

The backend still accepts the reset operation at:

```http
POST /api/auth/reset-password/:token
Content-Type: application/json

{"password":"new password"}
```

The frontend adds public route `/reset-password` and page `src/frontend/src/pages/ResetPassword.jsx`.

On initial render it calls a pure helper from `src/frontend/src/utils/fragmentToken.js`:

```js
consumeFragmentToken(windowLike)
```

The helper reads `token` from `location.hash`, returns it to React state, and immediately calls `history.replaceState` with only `pathname + search`. It never reads or writes `localStorage` or `sessionStorage`.

The reset page keeps the token only in component state and renders:

```text
Nueva contraseña
Confirmar contraseña
[Cambiar contraseña]
```

Client validation requires both values, equality, and the existing minimum of six characters. Backend validation remains authoritative.

On success the page clears its token state, navigates with `replace` to `/login`, and supplies a non-sensitive navigation-state confirmation. Login displays `Contraseña actualizada. Ya podés ingresar.`

Missing, invalid, expired, or already-used tokens show a comprehensible generic error without confirming user data. A successful reset continues to increment `auth_version`; JWTs issued before the reset are rejected by existing middleware.

## Admin Invite UX

Extend `src/frontend/src/pages/InviteResidente.jsx` rather than adding a second admin page.

Below the existing creation form, render:

- a pending section;
- a history section containing used and expired rows;
- email;
- unit number;
- Propietario/Inquilino label;
- expiration;
- status;
- `Reenviar` only for pending rows.

The page loads `GET /admin/invites` whenever its selected community/complex context changes and after create or resend. It uses the existing Axios interceptor so the selected admin scope is supplied through `setCommunity` conventions.

No durable delivery badge is shown. The page keeps the latest create/resend delivery outcome only in React state for the current session:

- invitation sent;
- invitation created but delivery failed;
- resend sent;
- invitation renewed but delivery failed.

Pending/history content stacks vertically on mobile. Tokens and hashes never enter component state or rendered content.

## Roles and Tenant Isolation

- Admin: may create, list, and resend resident invitations only within `req.communityId`.
- Invitee: may accept a valid raw invitation token through public registration but cannot choose or override community, unit, role, or ownership type.
- Resident: may request and complete password recovery; cannot list or resend invitations.
- Access operator: does not participate and cannot list or resend invitations.

Every administrative invite query binds both resource identity and `req.communityId`. Related unit hierarchy is revalidated in the same community before token rotation.

## Security Invariants

B36.1A preserves:

- hash-only resident invitation persistence;
- hash-only password-reset persistence;
- one-time invite and reset consumption;
- expiration checks;
- transactional invite acceptance;
- transactional resend rotation;
- password-reset JWT revocation through `auth_version`;
- admin-defined unit and `owner | tenant` authority;
- ignored invitee identity claims;
- trusted link origin from `PUBLIC_APP_URL`;
- no dependency on `Host`, `X-Forwarded-Host`, or request protocol;
- no token/hash in admin responses, UI state, browser storage, or logs.

## Testing Strategy

Backend tests cover:

- shared SMTP service contracts without real network access;
- creation and recovery using the shared service;
- list restricted to `req.communityId`;
- no token/hash fields;
- resident/access-operator `403` route behavior;
- same-community pending resend;
- old-token invalidation and new-token acceptance;
- same row and hash-only persistence;
- foreign, used, expired, and invalid-unit rejection;
- SMTP success and success-with-warning failure semantics;
- database failure with no SMTP attempt;
- serialized resends and only one persisted hash;
- acceptance/resend locking behavior;
- trusted frontend recovery origin despite hostile headers;
- reset one-time behavior and prior-JWT revocation.

Frontend Node tests cover fragment extraction, immediate URL cleanup, missing tokens, preservation of path/query, and the absence of storage calls. Production build plus live browser QA covers page routing, forms, status messages, and responsive presentation.

## Live QA

Use users created during QA, not seeded resident identities:

1. Start Docker with explicit strong JWT/invitation secrets, `PUBLIC_APP_URL=http://localhost:8080`, and configured SMTP variables.
2. Log in as an administrator.
3. Create an owner invitation, confirm one real SMTP message is received, open the fragment link, confirm the fragment disappears immediately, register, and log in.
4. Create a second invitation while SMTP works and retain its original link only in browser memory/history.
5. Disable SMTP and resend the second invitation; confirm success with warning, one pending row, unchanged row ID, and rejection of the original link because rotation committed before delivery.
6. Restore SMTP, resend the same row again, receive the new email, and accept only the newest link.
7. Exercise two concurrent resends of a third pending invitation; confirm one row and only the last committed token works while recording duplicate delivery as an accepted observation.
8. Request password recovery from Login, receive the email, open the frontend reset page, and change the password.
9. Confirm a JWT issued before reset receives `401` and the new password logs in successfully.
10. Check admin invite management, forgot password, reset password, and registration at desktop width 1366 px or wider and mobile width approximately 390 px.
11. Remove QA users, ownerships, invitation rows, reset data, and related session fixtures; verify zero B36.1A residues.

No raw token, token hash, JWT secret, invitation secret, or SMTP credential may appear in command output or the final report.

An ephemeral SMTP inbox proves SMTP interoperability but not pilot-provider readiness. It caps the result at `GO WITH OBSERVATIONS`. Full `GO` requires delivery through the SMTP configuration intended for the pilot.

## Configuration

`docker-compose.yml` passes through `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS` using non-secret defaults only. `src/backend/.env.example` documents variable names and local defaults without usable production credentials.

SMTP is not made a startup-critical dependency in this block because creation, resend, and forgot-password explicitly preserve persistence/generic-response semantics when delivery fails.

## Out of Scope

- Database migration or second invitation entity.
- Durable SMTP delivery status.
- SMTP queue, automatic retry, or generic idempotency keys.
- Provider-specific email integration or production-provider selection.
- MercadoPago or manual payment proof.
- Ticket SLA or assignment.
- Resident-created visitor invitations.
- Automatic WhatsApp, push notifications, or AI.
- Master-ticket UI, poll administration, or general navigation redesign.
- Token/hash redesign beyond rotation of the existing SHA-256 representation.

## GO Criteria

`GO` requires a non-seeded user to complete the full account lifecycle through the browser with the SMTP configuration intended for the pilot, and an administrator to recover a pending invitation through Resend without changing its row ID or exposing credentials.

`GO WITH OBSERVATIONS` is the maximum if all code, security, regression, Docker, and browser checks pass but email delivery is proven only with an ephemeral SMTP test account.

If no real SMTP delivery can be demonstrated, B36.1A cannot be `GO`, and Comunidad App remains `NOT READY FOR PILOT`.
