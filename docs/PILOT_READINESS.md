# Controlled pilot readiness — 2026-09-05

This records verified behavior, not a production certification. B36.1A account lifecycle verification covers `9027180`; the payment, visible-feature and full-pilot acceptance gates are separate subsequent blocks.

## Account lifecycle gate

- Backend: **290 passed, 0 failed, 0 skipped**, including real Redis integration against a disposable isolated Redis instance. Frontend: **24 passed, 0 failed**; production build successful.
- Production Docker rebuild succeeded. Public `/api/health` and SPA recovery route returned **200**; the served frontend asset matched the fresh build.
- Fresh, non-seeded users in two isolated QA communities exercised owner and tenant invitation onboarding, login/logout, invite listing, resend, forgot/reset and role/scope rejection.
- Admin list returns no token/hash. Resends preserve one row, invalidate the old credential and commit before SMTP. Concurrent resends returned `200/200` and delivered two messages, but acceptance was `400/201`: exactly one persisted credential remained valid. Duplicate delivery is an accepted pilot observation.
- Forced SMTP failure on resend returned `200`, `email_sent=false` and a visible warning, while the invitation remained pending. Restoration and resend delivered a usable replacement.
- Known/unknown forgot requests returned the same generic `200` response. Host and forwarded-host headers did not change the configured recovery-link origin.
- Reset success cleared hash/expiry and advanced the authentication version. Previous JWT and old password were rejected; new login succeeded and token reuse failed.
- Browser evidence covers desktop1440x900/mobile390x844, loading/disabled/error/empty/success/warning states, lazy-route hard refresh and no horizontal overflow. No unexpected console/network failure remained; deliberately tested validation/auth responses and a controlled502 are not normal navigation.
- Exact QA fixtures were removed. Docker and native PostgreSQL marker checks each returned zero users/invites/communities/organizations; dependent hierarchy/membership rows were transactionally removed. Upload residue was zero. Mailpit was removed and original SMTP settings restored.

### Current security and deployment contracts

The supported reset API is **`POST /api/auth/reset-password` with JSON `{token,password}`**. The obsolete path-token route has no consumer and is removed. This supersedes the historical compatibility route in the original B36.1A design/plan. Nginx rejects case-insensitive and normalized legacy descendants without credential-bearing access/error logs; body reset strips query parameters and does not log its request URL. Behavioral Docker regressions exercise lowercase, uppercase, mixed and encoded variants and synthetic-credential absence from logs.

Registration and reset consume fragment credentials in memory, immediately remove the URL fragment and handle a new fragment while the same page remains mounted. No invitation/reset token is stored in localStorage, sessionStorage or IndexedDB. Admin-defined community/unit/owner-or-tenant claims remain server authoritative.

Registration and Reset invalidate superseded requests on credential replacement/unmount. Deferred component and browser checks prove an old success/error cannot change session, navigation, messages or the newer request's loading state. This suppresses obsolete client effects, not already-started server transactions. Temporary response mocks were removed; running Nginx configuration was compared with the repository and matched exactly. The log regression now waits for the actual synthetic upstream through the proxy with a bounded, credential-free readiness probe.

Git checkout now preserves LF for shell scripts and SQL migrations. A fresh Windows `core.autocrlf=true` checkout is tested. No migration/checksum algorithm or stored history was rewritten: all26 applied checksums inspected during diagnosis matched committed LF bytes and none matched the accidental CRLF checkout. The rebuilt backend subsequently accepted all31 current migrations.

## External SMTP gate

**NO VALIDADO — EXTERNAL CREDENTIAL REQUIRED.** Account email behavior was verified through ephemeral Mailpit, not the real pilot provider. Deployment remains env-driven through `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` and trusted `PUBLIC_APP_URL`. Do not put credentials in this document, committed files or logs. Real-provider receipt of invitation and recovery messages is required before claiming full SMTP validation.

Account code publication can be **GO WITH OBSERVATIONS** for this external dependency. It does not establish whole-pilot readiness or validate payment/AI/WhatsApp integrations.
