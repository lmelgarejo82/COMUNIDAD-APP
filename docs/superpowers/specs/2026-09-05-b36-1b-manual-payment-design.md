# B36.1B — Manual payment and upload durability design

Authority: user's autonomous pilot request. Account publication completed at 650664c; this block starts from that verified base. Inspection: `src/backend/controllers/expenseController.js`, `src/backend/models/Expense.js`, expense/upload routes, frontend `Expensas.jsx`/`services/expensas.js`, and migrations003/005/013. This completes existing `unit_expenses.payment_proof_url`, not a second payments system.

Ruling: add durable `rejected` state through migration032, preserving pending/in_review/paid — an admin rejection must survive refresh and be distinguishable to the resident; notification-only pending would hide the decision — tradeoff: debt/reminder state enumerations must include rejected.

Ruling: keep manual proof as pilot payment entry; do not enable MP until its independently configured capability is true — current provider unavailable and its preference/state race is not part of manual flow — tradeoff: automated provider path remains deferred.

## 4a Durable upload root

`services/uploadFiles.js` resolves explicit UPLOAD_DIR or current local default, ensures directory exists before accepting upload. All four Multer route files consume exported root rather than separate hardcoded destinations. Preserve existing allowed types and size policy; no new uploader subsystem. Docker mounts named `upload_data` at /app/uploads and sets UPLOAD_DIR. Before first volume/recreate, count and preserve any existing non-QA files; copy safely if nonempty, no deletion. RED configured root resolution, cleanup traversal rejection, real upload/serve path and rendered Compose durability. Commit focused, fresh review.

Reproduce proxy upload-size mismatch: no Nginx client_max_body_size override currently exists, so default can stop supported5/10MiB uploads before Multer. A bounded11m proxy ceiling accommodates existing largest10MiB document plus multipart metadata; backend file/JSON caps remain unchanged. Preserve P0 reset log defenses and verify boundary behavior live.

## 4b Complete manual proof backend

New migration032 replaces only unit_expenses status check with pending/in_review/paid/rejected; idempotent existing migration conventions, no old migration edit. Debt/reminder/dashboard/chat enumerations include rejected as unpaid.

PUT /expenses/unit/:unitExpenseId/pay gets existing Multer field proof + trackUploadedFile. Required one5MiB PDF/JPG/JPEG/PNG. Store only generated canonical filename, never payload file URL. Query/transaction verifies expense community, active unit/hierarchy in same community, active dated ownership and actor community. Row-locked or conditional state transition allows pending/rejected -> in_review, one winner. Persist proof association before retain; losing/invalid/DB-failed uploads removed. Keep rejected proof association until successful replacement; remove replaced file only after new association commits and verify canonical path. Approval timestamps set only at approval. Return safe404 for foreign/ineligible owner; same-resource state conflict clear4xx; no partial writes.

Existing confirm URL remains admin-only and requires in_review+proof; add sibling reject URL. Shared atomic review transition binds id/community and expected state; no confirmation of pending or rejected. MP webhook's internal completion API remains unchanged so manual guard doesn't break unrelated provider behavior. Review result paid/rejected persists and UI consumes it. Audit labels remain server-defined; post-commit notification failure does not turn successful transition into500.

Ruling: rejection may return an existing in_review row without a proof to rejected, but approval always requires a proof — the legacy submit controller permitted proofless review; actual read-only Docker data has paid20/proofless20 and pending10/proofless10, with no current in_review rows — tradeoff: an admin can explicitly recover an old incomplete submission without backfilling or automatically rewriting any history. Existing paid rows remain paid and untouched; the UI never offers approval without a proof.

Fix create-expense false500: getUserPhone is undefined after COMMIT. Fetch phone in existing scoped query and isolate optional external notification work after durable response. DB failure remains real500/rollback; row creation does not duplicate on optional delivery failure. No automatic WhatsApp provider introduced.

Preserve submitted proof/history on ordinary expense edits: current update deletes/recreates unit_expenses when amounts change, and Expense.update ignores the supplied transaction client. Before allowing resplit, lock the expense and reject amount changes if any child has proof/payment activity; description/due-date edits can remain. All allowed resplit writes must use the same client. Reproduce rejection/no child/proof/timestamp changes and rollback consistency before fix. This is necessary for the new proof flow to survive an existing visible admin action, not a general expense redesign.

Submission/review and amount-resplit must share a consistent locking boundary (parent expense before child unit_expense, or an equivalently demonstrated atomic guard). Locking only the parent during edits and only the child during submission would still permit deletion of a newly committed proof row after an earlier empty-activity check. A coarse parent lock is acceptable for the controlled pilot if it is the smallest correct design; verify the conflicting operations serialize without deadlock or lost payment history.

For the new manual upload controller, explicitly finalize cleanup on rejected/failed association even if HTTP client already disconnected; do not rely solely on response finish. Preserve the B35F close-race guarantee: never delete a file that the DB subsequently commits. No generic orphan sweeper or broader uploader rewrite.

Ruling: preserve a candidate proof when a lost database connection leaves COMMIT outcome unknown — deleting on an uncertain result can erase a successfully committed association — tradeoff: an inaccessible orphan may require operator reconciliation. Prefer a bounded fresh scoped association check synchronized with the parent lock where practical; otherwise discard the broken client and preserve the file. Known failed or rolled-back work still cleans deterministically. No filesystem/database crash-atomicity claim or reconciliation subsystem is introduced.

Task4a live QA confirmed a permitted proxy request exceeding the document Multer limit returns legacy500 while leaving no row/file. Map upload validation/size/malformed-multipart errors to clear4xx with a small shared upload-route error boundary; preserve the existing file caps, cleanup, and real storage/DB failures. This boundary covers equivalent existing upload routes, not unrelated Express errors.

RED controller/model/route regressions before edits: valid own submission, missing/invalid/oversize proof, actual foreign ID, expired/inactive ownership/hierarchy, forged local proof URL, states, review roles, concurrent one-winner transitions, DB failure and retained/cleaned file evidence, committed creation with optional notification failure. Live PostgreSQL verifies schema/state/race. Commit backend focused, fresh review.

## 4c Resident/admin UI

Extend Expensas.jsx, services/expensas.js, small dependency-free presentation/download helper if useful. Resident sees Enviar comprobante, allowed formats/size, required file, upload progress/disabled/error, in_review/paid/rejected, retry from rejected. Fix existing catch(err) bug in resident load. Admin list shows proof availability, authenticated open/download, explicit approve/reject and action loading/errors; refresh result. Blob fetch uses existing Axios bearer/selected scope with baseURL:'' for /uploads; canonical URLs only, objectURL cleanup. No JWT query auth.

TDD pure service/action tests then real browser desktop/mobile, full tests/build, Docker rebuild. Fresh QA proof -> recreate backend -> same authorized bytes; foreign/admin-role/expired ownership denial and proof DB association unchanged. Cleanup exact QA rows/files only. Final reviewer + preflight + normal publication.

## Deferred

No rejection reason field required for first pilot; explicit rejected status supports resubmission. No object storage/backup/trash/outbox, no general upload rewrite, no payment automation/idempotency provider redesign. Existing non-QA orphan policy and crash recovery documented without deletion.
