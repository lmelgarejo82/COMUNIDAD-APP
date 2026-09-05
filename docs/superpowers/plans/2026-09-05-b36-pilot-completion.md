# Controlled Pilot Completion

## Authority and global constraints

Execute the user's AUTONOMOUS PILOT COMPLETION request of 2026-09-05. Preserve the existing B36.1A chain based on 2983666. The account design and plan in this directory remain authoritative except where the new request explicitly supersedes them: body-only reset, autonomous technical rulings, normal verified pushes, and external SMTP absence is the only permitted publication observation. No destructive changes to non-QA data, secrets in output, dependencies, forced pushes, or unrelated feature expansion.

Use systematic debugging, RED before changed behavior, focused commits, fresh task review and whole-branch review. Record decisions and evidence. Worktree: `.worktrees/b36-pilot-completion`, branch `codex/b36-pilot-completion`. Safety tag: `safety/b36-pilot-start-2983666`.

### Task 1: Close reset credential logging

Inspect `src/backend/routes/auth.js`, `controllers/authController.js`, request logging, `src/frontend/src/services/accountRecovery.js`, `src/frontend/nginx.conf`, and `test/resetCredentialLogging.test.js`. Reproduce lowercase, uppercase, mixed-case, encoded normalized reset paths and body endpoint with synthetic tokens; never print tokens/log contents. Remove unused path-token API after consumer search; retain supported body endpoint. Suppress sensitive reset paths in Nginx regardless of case/normalization and protect error logs. Behavioral Docker regression must assert synthetic values absent from logs and body endpoint still functional. Run focused reset/security tests, frontend tests and complete backend suite. Commit and get fresh review before Task 2.

### Task 2: Complete account lifecycle browser evidence and SMTP baseline

Read existing account spec, plan and SDD evidence; preserve completed architecture. Use fresh QA admin/residents/two communities. Browser: create/list/resend invite, old link fails/new works, logout/login, SMTP failure warning with persisted row, restore/resend success, forgot generic confirmation, email fragment consumed/cleaned, validation, reset success message, JWT revocation, new login, reuse fails. Desktop >=1366 and mobile ~390, loading/disabled/error/empty states, console/network and no token persistence. Use an available stable browser method. Add deterministic Mailpit configuration only if useful. Actual pilot SMTP remains env-driven; if credentials absent record external delivery NO VALIDADO and continue. Reproduce and fix actual defects with TDD, focused commits and fresh review.

### Task 3: Account lifecycle publication gate

Fresh `npm test` in backend, real Redis integration, `node --test test/*.test.js` and `npm run build` in frontend, `git diff --check`, Docker rebuild/health, completed browser/security QA and cleanup. Whole branch review includes original 14 commits. Fix findings until critical/important gates close. Fetch/preflight, fast-forward main, normal push only behind zero and clean. Verify HEAD equals origin/main. Missing external SMTP alone allows GO WITH OBS.

### Task 4: Manual payment proof and durable uploads

Inspect expenses/payment models/routes/controllers/UI, proof state/review contract and B35F upload associations before a repo-backed detailed task brief. Reuse existing workflow where possible: resident expense -> server-generated upload -> pending -> admin authenticated open -> approve/reject -> resident status. Enforce community, active ownership, expense owner, admin review, upload cleanup. Add only essential persistence if current schema requires it. Configure UPLOAD_DIR and named Docker volume. TDD, resident/admin/foreign/mobile QA, rebuild persistence proof, fresh review and publication gate as Task 3.

### Task 5: Remove pilot dead ends

Inspect capabilities and current UI. Server-driven availability for absent external integrations; manual proof is payment default. Hide or clearly disable unavailable AI, MP, automatic WhatsApp; manual wa.me allowed. Complete authenticated Documents cheaply or gate navigation. Amenities expose existing valid transitions explicitly or gate if finishing creates a subsystem. Correct ticket notification text; no SLA/assignment implementation. Handle only provably demo/QA data via safe seed/cleanup documentation. TDD, build, browser, fresh review, publication gate as Task 3.

### Task 6: Full pilot acceptance

Fresh temporary identities and isolated data: admin scope/invite/announcement/expense/proof/ticket/access/audit; resident onboarding/dashboard/payment/announcements/ticket/recovery/logout; guard access validation/use/manual fallback/checkout/forbidden modules. Desktop/mobile, hard refresh, Docker restart, upload persistence, Redis limiter, JWT revocation, no normal-navigation 429/5xx, clean console/network. Full security regression, exact QA cleanup with zero residues, final branch review and verified normal publication. Stop at READY FOR CONTROLLED PILOT; report external SMTP distinctly and explicitly list excluded future modules.
