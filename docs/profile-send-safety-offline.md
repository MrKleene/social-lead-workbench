# Profile restriction to send safety — offline implementation

This source is not deployed. Production inspection support and this sender integration are separate changes. The approved read-only profile inspection established a visible account-content restriction; it did not establish the restriction's duration, every affected function, or the cause of an earlier UNKNOWN submission.

## Implemented flow

1. The exact sender's owned page inspects explore and the exact self profile before opening the target post or touching an editor. Navigation requires a matching stable identity and an observed same-origin self link. Restriction, mismatch, challenge, unknown route, cancellation, or journal failure stops the branch. The existing diagnostic-only preflight retains its one-post navigation scope.
2. `ACCOUNT_CONTENT_RESTRICTED` persists as RESTRICTED. `SESSION_LIMIT` persists as VERIFY_REQUIRED. The content restriction is not relabeled as proof of a permanent ban. Safe text, redacted path, timestamp and request association enter the durable journal. Send-gate image capture is deliberately absent; the UI states that no screenshot was saved. The separately approved inspector's existing safe-crop protection remains intact.
3. After owned transport shutdown, the validated journal is associated with the expected sender and exact protocol attempt. Under the same PostgreSQL advisory transaction lock used by dispatch, the backend appends account observations, pauses the account and disables every REAL rule for that platform. It does not clear active leases, attempts, recipient locks or quota. Existing recovery/finish logic handles those separately; UNKNOWN cannot be refunded by a late failure.
4. Rule enable, enqueue/reserve/dispatch readiness and durable RPC intent all reject unverified sending eligibility. The last RPC intent check also reads the platform pause under that lock. A page without a restriction never grants permission or clears historical restriction. These checks also cover restarts and other accounts in the pool.
5. The UI disables both enable controls while the account pool is restricted/unverified. A confirmation opened before a fresh observation cannot bypass the updated eligibility flag. Saving bounded rules remains available; future qualified automatic rules still require no per-message manual review. Simulation remains a separate namespace.

## Evidence and failure boundaries

The database projection is written after transport shutdown, not continuously streamed from Chromium. A parent/process kill before that projection can leave only the durable private journal and UNKNOWN recovery; the account UI must not claim that a specific notice was persisted in that case. No screenshot bytes, credentials or raw diagnostic errors enter ordinary audit logs. Journal/DB persistence failure does not authorize RPC or retries.

The implementation has no positive platform send-permission provider. `canSend` remains false. The Go capability still advertises `confirmedResponseMapping: false`, and production transport still requires a reviewed mapping. Neither gate was loosened to obtain green tests. The owned driver finds DOM candidates but never manufactures an independent submission response from them. Engine fixtures require a new reply ID and matching sender/post/target/recipient/body plus independent response and readback; they prove the state machine only. Pending moderation, hidden replies or lost responses remain unconfirmed.

## Validation

- API 863 tests, agent 4, web logic 156, auxiliary Node tests 4.
- Disposable PostgreSQL integration 400 tests across 10 files; both temporary containers removed.
- Go engine 53, driver 10, route 2; DOM/boundary 24; runtime 8.
- Workspace typechecks/builds passed; final changed web typecheck/build passed. Existing web chunk-size warning only.
- Synthetic desktop and 390px browser checks: 16 groups, external requests blocked; visible notice, missing-screenshot message, disabled enable button, UNKNOWN and bounded simulation authorization covered.
- No live sending, platform session, new collection, paid model calls, candidate execution/installation, source deployment or push. No CI result is claimed.

## Delivery boundaries

No schema migration is required. Runtime hash pins and installed files were not changed. A future release must reconcile this offline branch with the production inspection-only commit and review the full application/candidate compatibility. Existing private live inspection evidence has not been imported into production audit tables by this change. Such an append-only import, if later authorized, must preserve its original source/account/time and must not rewrite historical outcomes.

Real sending acceptance remains blocked on a defensible permission source and an independently attributable submission-response mapping. Any later controlled send requires a permitted account, explicit target/content/count scope and separate execution authorization. A restricted sender and an existing UNKNOWN recipient remain excluded. Installing this candidate alone cannot enable sending.
