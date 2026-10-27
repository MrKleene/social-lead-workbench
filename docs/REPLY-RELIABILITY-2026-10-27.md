# Reply reliability: isolated implementation, real sending unaccepted

The current deployment stays OFF. Login verification is not send permission. There is no reviewed positive account-send-permission source and no reviewed platform submission-response mapping. `accountSendObservation().canSend` therefore remains false, and both real executors require eligibility before opening a saved session. Automatic deployment additionally requires explicit reviewed prerequisites; transport requires confirmed response mapping before a send RPC. These are unresolved dependencies, not switches to enable to make tests pass.

## State and evidence boundaries

- Engine `NOT_SENT / BEFORE_SUBMIT`, with acknowledged process stop, means definitely not attempted. The existing application ledger stores this as `FAILED`; it may release only the original-day reservation. It does not authorize automatic retry.
- A platform rejection after submission would require a reviewed response mapping before a definitive failed outcome could exist. No such mapping is invented here.
- `UNKNOWN`, lost response, crash, pending/hidden content, invalid evidence and `ACCEPTED` without complete proof retain recipient lock and quota. Automatic and one-shot flows pause the platform; no account rotation or automatic retry. A late FAILED cannot downgrade an existing UNKNOWN.
- `CONFIRMED` still requires account/request correlation plus a new reply ID and independently matching platform response AND readback: sender, post, selected comment, recipient, exact content digest. The engine rejects IDs already observed before submission. Button return, editor closure, duplicate content or a DOM candidate are not acceptance or confirmation. The production driver still cannot construct this proof.

## Observability

Both application executors write database RPC intent before dispatch, and persist fixed return/error/stop records under the request key. The Go private journal now covers navigation intent/return, target location, selection intent/return, input intent/return, pre-submit intent, returned click, submission completion, readback, cancellation and close. `ATTEMPTED` is write-ahead intent: after a crash it still means 0 or 1, not a counted click.

A bounded restriction reader runs on the same owned send page before actions, after input, before/after submit and during final error/close handling. It never navigates to recover or opens another account. Only recognized notices with matching stable identity are attributed. Their sanitized text, title and query-free path are retained in fixed-schema evidence. Journal capacity is 64 records / 128 KiB; ownership, private-mode, symlink, sequence, attempt and torn-tail checks remain fail-closed. No raw credentials, body, URL query or CDP errors are logged. Stderr is drained with bounded in-memory parsing and emits only PANIC/TIMEOUT/BROWSER_DISCONNECTED/OTHER plus truncation; this is diagnostic evidence, not submission or ban proof. Parent process loss can still lose that stderr projection; the Go fsynced journal remains independent.

Account observations are append-only AuditLog events. Restriction state is independent of workbench PAUSED and session VERIFIED. Existing restriction evidence does not expire into permission and cannot be cleared by a later empty page. There is deliberately no recovery/clear endpoint until its evidence requirements are reviewed.

## Screenshot boundary

The separate read-only inspection protocol now exports only a bounded `VISIBLE_WARNING` region; ordinary viewport export is removed. Fixed reasons are NOTICE_SENSITIVE_TEXT, EDITABLE_CONTENT, VISIBLE_QR, UNVERIFIED_MEDIA, TEXT_SCAN_LIMIT, REGION_SENSITIVE_TEXT and NO_SAFE_REGION. Visible intersecting controls/QR/media and sensitive text block capture; hidden QR and unrelated content outside the approved crop do not. Unknown safety reasons cannot become a safe image. Text/title/path survive when images are missing. Capture precedes browser closure.

The send path currently retains restriction text and stages, **not screenshots**. Its UI explicitly says screenshot not saved. Real selectors, dynamic-page image privacy and usable real restriction crops remain unvalidated. No protection was disabled and no denied screenshot was retried.

## UI and preservation

Readiness shows offline recognition tested / sending unaccepted / account restricted or unverified. The account matrix separates platform evidence from PAUSED. Recent attempts include one-shot history even when there are no automatic rules or jobs; missing old stages are stated plainly. Simulation is never called delivery. No per-message permanent manual approval requirement is added.

This implementation changes no schema, production rules, sessions, keys, identities or historical attempts. It is built and tested in an isolated source checkout. The original UNKNOWN must not be edited, refunded or re-sent. Importing an existing user restriction report into the new append-only evidence view is a separate, specifically reviewed deployment data change.

## Minimum next steps

1. Review source, exact candidate hash and matching compatibility/deployment scope. No binary is installed or executed by this delivery.
2. Obtain authorized, non-sending evidence for a real positive send-permission source and platform submission response mapping. Do not use the reported banned account or the UNKNOWN recipient to discover the contract.
3. Implement and offline-test those mappings before enabling a real submission path. New primitives/protocol/credential permissions need specific approval.
4. Any later actual test requires a user-confirmed account allowed to send, a compliant exact post/comment/recipient, unchanged original text, fresh one-shot authorization and a maximum count. Installation approval is separate. No banned account, no account rotation around restrictions, no retry of the existing UNKNOWN target.
