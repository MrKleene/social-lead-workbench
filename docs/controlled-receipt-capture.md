# Controlled reply receipt capture (not deployed)

This change closes the first-submission evidence loop without assuming a read-only
platform `can-send` API exists. It does not enable automatic contact or make the
installed historical candidate compatible with this new capture capability.

## Authority and restrictions

`workbench.single-reply-authorization.v3` / `CAPTURE_EXACT_COMMENT_RECEIPT_ONCE`
is a private operator scope for exactly one account, sender, post, comment,
recipient, exact content, source-pinned installed binary and expiring approval.
It requires `workbench.reply-receipt-capture.v1`, maximumSubmissions=1,
retryCount=0, explicit nonempty post/recipient exclusions, and cannot reference a
previous attempt. Legacy v2 scopes and their historical compatibility list retain
their old meaning. No HTTP route, queue, environment approval or automatic rule
creates this authority.

The service keeps the shared recipient ledger and original-day quota reservation.
A durable authorization and dispatch record must exist at RPC_INTENT; an existing
intent, changed actor/account, expired scope/lease, platform pause, corrupt evidence
or known restriction rejects that boundary. Re-entering a consumed approval does
not execute it again. Any possible submit becomes UNKNOWN unless confirmation is
supported, and its recipient/quota remain locked. A proven zero protocol invocation
with owned-process shutdown can be classified as definitely not attempted.

Missing/old/no-warning account evidence is not platform permission. Capture performs
fresh exact sender/profile/target and composer checks in its owned MCP session;
explicit restrictions always stop it. No previous restriction expires into a clean
state. A new account cannot resume an old recipient or bypass a platform pause.

`canSend` is a legacy view field for **application readiness**, now calculated from
an approved deployment, reviewed response mapping/restriction policy and fresh,
identity-matched same-session observation. It is not a platform guarantee. The
source deployment record remains disabled and has no reviewed binary hash. The
controlled operator path does not require this unavailable automatic-release
qualification; it has its own exact, one-use authority and fresh live checks.

## Actual driver wiring

Before the one submit click, the driver enables read-only CDP Network observation
and fsyncs an ARMED journal record. It observes the browser's own POST, never
intercepts, reissues or speculatively calls a platform API. A candidate request must
contain exact post ID, target-comment ID and content as JSON values on a first-party
HTTPS host during the click window. RequestID correlates response and loading
completion. Duplicate matching requests, redirects, cache/service-worker responses,
missing/oversized/non-JSON payloads, journal failures and cancellation cannot confirm.
Correlated HTTP 403/429 retain explicit refusal/rate-limit signals.

The bounded four-second observation window does not retry. Browser-side delivery
can remain delayed or unknown. Capture records an independent reload/readback
classification but never converts equal visible text or a closed editor to success.
The one-click limit does not assert the platform's internals made exactly one request;
multiple observed matching requests are explicitly ambiguous.

A source-reviewed mapping descriptor identifies the exact endpoint, JSON request
binding paths, explicit response-success condition and newly allocated reply ID.
The pure parser is used by the actual driver. When a reviewed descriptor exists,
the engine independently reloads and requires that new ID, sender, post, parent
comment, recipient and content hash all match, and that the ID was absent before
submission. Acceptance with hidden/pending/missing readback is not confirmation.
This proves the observed state at that time, not permanent visibility.

**There is no production descriptor yet.** Fixture paths are labelled synthetic and
are never installed as platform mappings. Capture mode deliberately remains UNKNOWN
even if an unreviewed candidate claims CONFIRMED. Its evidence can support offline
mapping review; it does not authorize repeating the captured attempt.

## Evidence and limits

Durable journal records preserve bounded JSON field paths/types, known command-value
bindings, small success/code values, public reply-ID candidates, body/endpoint digests,
HTTP status and readback classification. Only known service hosts and conservative
API route keywords can be retained as a path; query/fragment/headers, credentials,
arbitrary response text and opaque path segments are excluded. Sensitive-key branches
are dropped; unknown field names become hashes. Depth, node, field, byte, record and
file limits remain enforced. Projection failure is an evidence gap, not a successful
send. Existing screenshot protection remains unchanged; this feature adds no screenshot
capture or permission bypass.

The still-missing platform evidence is the actual correlated request field paths,
endpoint, response success/acceptance semantics, new reply-ID path and live readback
shape. A lawful one-shot capture can obtain those without an already-known schema.
It may instead expose a concrete unsupported encoding or missing response; that stops
this attempt as UNKNOWN and does not create an automatic second test.

## Next controlled acceptance

1. Review/build one final candidate and paired application; obtain the specific
   installation authorization for its exact hash. Existing installed builds lack
   the capture capability. A final candidate may be compiled offline; installation and execution require that separate approval.
2. Select one newly accessible, independently authorized target from existing eligible
   evidence or an authorized read. Exclude inaccessible posts and every UNKNOWN
   recipient. Validate the saved URL/reference and exact target in the same session.
   The reply text and one-attempt user limit need not be requested again.
3. Bind the exact account/target/text/hash/exclusions into the private v3 scope. Keep
   automation OFF. Do not clear a platform pause or old ledger to make the test pass.
4. Execute through the existing operator service once. Local capability failure must
   occur before any platform login read. Restrictions stop before submit. Once a
   submit is possible, preserve the attempt and quota regardless of missing response.
5. Inspect the safe journal and independent readback offline. Review a concrete mapping
   only if evidence supports it. Report accepted/visible/unknown separately. Do not
   resend an UNKNOWN target or switch accounts to finish it.

## URL finding

`exactURL` already uses `net/url.Values`; reserved `+`, `/`, `=` characters round-trip
without changing the saved token/source. Regression fixtures cover this. Existing
OTHER_ROUTE evidence with token/source MATCH does not demonstrate an encoding bug,
and neither navigation failure nor this test proves a post was deleted. Do not invent
an alternate route or silently strip the saved reference.
