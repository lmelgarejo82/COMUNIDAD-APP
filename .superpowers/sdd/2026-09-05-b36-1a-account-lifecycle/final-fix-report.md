# B36.1A final Critical reset-credential fix report

## Scope and result

This focused fix resolves the final-review Critical finding: a browser password-reset credential previously travelled in the request URI and could be recorded by the shipped frontend Nginx access log.

The browser now calls an additive body-token endpoint, `POST /api/auth/reset-password`, with exactly `{ token, password }`. The legacy `POST /api/auth/reset-password/:token` endpoint remains available for existing clients. Both entrypoints delegate to one controller reset routine, so validation, SHA-256 hash-only lookup, one-time consumption, `auth_version` increment/JWT revocation, safe 400 response, and success response remain identical.

The body endpoint uses only `body.token`; a query credential is not accepted as a fallback. The legacy endpoint continues to receive the decoded route parameter, including URL-encoded compatibility cases. Reset failures log only a fixed generic controller message and neither route logs request bodies or raw credentials.

## Nginx protection

The frontend proxy now has two explicit effective locations:

- An exact body-endpoint location preserves normal proxy behavior without placing its credential in the URI.
- A `^~ /api/auth/reset-password/` legacy location preserves the same proxy behavior and sets `access_log off`.

The exact body location is necessary because a trailing-slash prefix proxy location otherwise causes Nginx's automatic slash redirect for the body endpoint. The first live smoke exposed that redirect as a safe but incorrect 404; a second RED test was added before the exact-location change.

The regression test builds the frontend image and inspects `nginx -T`, rather than grepping the source file, to validate the effective loaded locations, legacy logging policy, and proxy target. A configuration assertion alone cannot demonstrate runtime log emission, so it is paired with the live log smoke below.

## TDD evidence

RED was observed before the corresponding production changes:

| Wave | Intended failures | Count |
| --- | --- | ---: |
| Browser service contract | URL still contained the credential for direct and fragment-derived resets | 2 |
| Backend route/controller contract | Body route was unavailable; missing body token could not reach the safe body-route response | 2 |
| Effective Nginx policy | No explicit legacy no-log location existed | 1 |
| Redirect regression | No exact body-route location existed to prevent the legacy-prefix redirect | 1 |
| Total intentional RED failures |  | **6** |

GREEN evidence after the final configuration change:

- Frontend account-lifecycle Node suite: 15 passed, 0 failed.
- Backend auth/recovery/session/security/configuration suite: 31 passed, 0 failed.
- Production frontend build: completed successfully.

## Live Docker evidence

Docker services were rebuilt with the existing backend deployment variables read only into the rebuild process memory; no configuration value was printed or written to a file.

Two unique synthetic invalid credentials were generated only in process memory. The live checks returned:

- Docker rebuild: true.
- `/api/health`: 200.
- Body reset endpoint: privacy-safe 400.
- Legacy reset endpoint: privacy-safe 400.
- Frontend log contains body credential: false.
- Frontend log contains legacy credential: false.

No credential, token hash, secret, or access-log line is included in this report or the recorded command output.

## Changed files

- `src/frontend/src/services/accountRecovery.js`
- `src/frontend/test/accountLifecycle.test.js`
- `src/backend/controllers/authController.js`
- `src/backend/routes/auth.js`
- `src/backend/test/authPasswordResetSecurity.test.js`
- `src/backend/test/resetCredentialLogging.test.js`
- `src/frontend/nginx.conf`

## Commit and status

Commit: `fix: keep reset tokens out of request logs` (this report is included in that focused commit).

Status: the Critical URI/access-log finding is remediated and the listed focused verification is green. Earlier browser-acceptance and pilot-SMTP evidence gaps remain outside this fix wave and are not reclassified here.
