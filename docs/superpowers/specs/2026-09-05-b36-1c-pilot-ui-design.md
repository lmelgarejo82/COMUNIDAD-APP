# B36.1C — Zero dead-end pilot UI design

User authority: AUTONOMOUS PILOT COMPLETION, 2026-09-05. Visible pilot features work or are intentionally absent. Inspected the actual Layout, Documents, Amenities, Tickets and Anuncios pages, booking controller/model, digital-invitation and dashboard models, optional provider consumers and Nginx. Payment base: `15bf5b7`, published and reviewed. This design elaborates Task5 of the parent controlled-pilot plan.

Ruling: expose additive non-secret capability booleans through existing /api/health, and fail closed in UI — existing health is public, config state is not credential data, and three consumers need a consistent answer — tradeoff: capability presence is publicly discoverable, no secret or provider identifier exposed.

Ruling: complete Documents with the authenticated blob download helper introduced for manual proofs — backend/B35F already supplies safe associations — tradeoff: included module must pass additional tenant/mobile/upload-durability checks.

Ruling: show explicit admin booking actions pending->active|cancelled and active->finished|cancelled; terminal records have no actions; no resident cancellation added — current UI already builds these actions but chooses index0, current routes allow only admin status mutations — tradeoff: historical arbitrary admin state resets are no longer offered or accepted.

## Global constraints

- Request community is authoritative; B35F downloads remain Bearer-only and trusted-association bound.
- No new provider, SLA, assignment, booking cancellation role, amenity CRUD or scheduling subsystem.
- Manual proof remains the primary payment path; AI/MP/Twilio configuration is not fabricated.
- No secrets in health, logs, reports or rendered UI.
- Existing named upload volume and original migration checksums remain untouched.
- Fresh nonseeded QA identities, explicit Docker database, exact cleanup only.
- Preserve the currently running JWT_SECRET, INVITATION_TOKEN_SECRET and PUBLIC_APP_URL byte-for-byte across every QA rebuild. Read them only into process memory, never substitute test values or print them. Use the parent workspace rebuild-preserving-runtime.ps1 helper; missing .env does not mean missing runtime configuration.
- RED before behavior changes; actual rendered browser evidence for copy/UI, not source-grep assertions.
- A deliberate disabled-provider API503 is negative QA, not permitted normal-navigation failure. Normal UI must not invoke disabled integrations.
- New selected-record UI work must guard request/modal identity and per-operation busy ownership. Apply committed mutation responses before refresh; failed readback is separate from failed mutation, with safe disabled/retry state and no stale record actions. Deferred and post-commit refresh-failure component tests cover those paths.

## 5a Optional integration capabilities

Add small pure backend env config with aiAssistant/mercadoPago/automaticWhatsApp booleans (complete meaningful config required, empty and known example placeholders false). /api/health includes only booleans. No provider activation, secrets, new deps or external setup.

Frontend reads existing health using cached injectable service, unavailable on fetch error. Chat entry/widget absent without AI capability, MP absent without capability and manual payment remains primary. Manual wa.me independent of AI availability, current safe target and explicit handoff retained. Controllers reject unavailable integrations before DB/outbound work using deliberate503 API error; test these intentionally disabled requests separately from normal-navigation no5xx criterion. WhatsApp service skips absent config without pretending delivery; no queue redesign or automatic messaging enabled.

Optional config examples blank, no fabricated credentials. TDD empty/partial/configured env, response no sensitive keys, API unavailable no side effects, frontend fail-closed visibility/service behavior. Commit/fresh review.

Exact-source correction: configured AI must not recommend an unavailable MP button; prompt payment instructions use the manual proof path and conditionally mention MP. The shared WhatsApp manual-payment confirmation must not claim automatic approval. Both are bounded truthful-copy corrections in existing gated producers; no real provider is activated.

## 5b Documents and amenities

Documents reuses authenticated canonical upload blob helper, own row busy/error states, download naming safe and objectURL revoked. Preserve list/create API and role/tenant boundaries. Configured volume from4a covers documents.

Amenities selected event reveals current Spanish status and explicit allowed buttons. No implicit actions[0]. Busy/disabled/API error visible; local response refresh. Backend validates state transition and uses expected-state conditional update with id/community to avoid stale concurrent changes; invalid transition409, foreign404, no mutation/notification on rejection. Existing in-app notification remains, translated labels. No amenity CRUD/resident cancellation.

Root inspection also found the existing overlap rule is a separate SELECT followed by INSERT, and invalid Date values bypass comparison checks before SQL. Before retaining the module, reproduce those exact on-path cases: concurrent same-amenity overlapping create, and invalid date input. Preserve the existing no-overlap business rule with the smallest shared amenity-row transaction lock if the race reproduces (no scheduling subsystem/migration); reject non-finite dates before SQL. Booking status plus its existing in-app notification should not leave a false-failure partial transition if the notification write fails; use the existing optional transaction-client interfaces where sufficient. Keep this bounded to making existing booking rules reliable, not new booking policy.

TDD pure frontend transition/service helpers and backend allowed/disallowed/tenant/concurrent transition tests. Browser desktop/mobile admin both branches, terminal states, resident readback; document admin/resident/foreign download. Commit/fresh review.

## 5c Truthful pilot copy and demo safety

Remove disabled ticket SLA/assignment/dead filters and fake notification checkbox. State actual in-app notifications for admin responses/status updates and no response-time guarantee. Preserve working filters and ticket workflow; no SLA/assignment features. Replace raw status in notification with Spanish label. Neutral Login credential placeholders plus appropriate autocomplete/labels. No cosmetic redesign.

Use functional notification regressions and real browser rendered-copy assertions; no source-grep/change-detector tests for prose. For demo/mojibake, keep SEED_DB:false, document safe pilot setup and exact inspection/cleanup procedure; do not edit applied migrations or mutate unidentified existing rows.

Acceptance readback correction: existing Ticket.getReplies has no route/consumer and UI replies are only local optimistic state. Add scoped GET /api/tickets/:id (admin community or resident own, absent/foreign/nonowned/deleted404; guard403), returning ticket plus ordered replies. Load/refresh existing detail timeline and guard stale selection/close completions. This is essential existing ticket follow-up, not a new messaging module; no SLA/assignment/attachment UI.

## 5d Acceptance-discovered readback consistency/privacy

Public digital-invitation list/create/revoke metadata currently exposes token_hash through vdi.*. Project only required public fields; keep deliberate newly created raw token/QR/share response and existing short token_hint label, internal hash-based lookup/separate secret unchanged. Repeat-use remains200 idempotent/same visit, not a second visit.

Resident dashboard announcements omit deleted_at although regular lists filter it. Reproduce create/delete/fresh dashboard and minimally filter/invalidate cache if necessary; preserve tenant scope and rejected-debt consumers.

The same announcement journey has a concrete UI failure: Anuncios load errors are stored in msg but rendered only inside the normally closed create form, so residents see a false empty list; delete/read promises have no error handling and creation has no pending guard. Reproduce the actual component states, then minimally separate loading/error/empty/data and mutation feedback, prevent duplicate pending actions, and preserve committed create/delete/read results if follow-up reads fail. Keep existing text-only API/roles; no redesign or attachment UI.

Check generated visitor URL /invitacion/<token> against Nginx access/error and same-origin asset Referer logs with an isolated synthetic-token test. If it leaks, add the smallest proven credential-route logging/no-referrer boundary without changing existing guard link/code usage or building a public visitor portal. Preserve reset P0 rules and ensure internal SPA fallback cannot escape protection. This is a concrete sensitive-link producer check, not a general scan; no change if reproduction disproves it.

Full tests/build/Docker/mobile/security/QA cleanup; fresh whole-block review and normal publication gate. No automatic feature expansion.
