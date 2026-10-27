# Exact reply candidate source

This is a reviewable overlay on the already-reviewed root-scope MCP source, not a replacement installed by this repository. The original license is preserved in `UPSTREAM-LICENSE`. `base-manifest.json` pins the full input tree; any extra, missing, changed or symlink file aborts the build.

Build with an existing reviewed Go 1.24.13 darwin/arm64 compiler and module cache:

```sh
node scripts/mcp-exact-reply/build.mjs REVIEWED_SOURCE NEW_OUTPUT EXISTING_GO EXISTING_MODCACHE
```

The script tests the pure state machine and pure comment-data helpers, builds without network/module downloads, and writes `BUILD.json` and `SOURCE-OVERLAY.json`. It never installs or runs the MCP candidate. Unit test executables contain synthetic fixtures only; these tests are not a browser/platform acceptance test. Repeat in a separate output directory and compare binary SHA256.

The new tools are `workbench_reply_capabilities`, `workbench_reply_exact`, and memory-only `workbench_reply_status`. They use protocol `workbench.xhs.exact-reply.v1`. Send defaults OFF; the workbench has another immutable OFF deployment record and checks a separately approved binary pin. Existing read tool policy remains unchanged. Do not enable old reply tools to bypass this handshake.

The driver verifies the logged-in stable sender, post, exact selected comment and its author, exact DOM reply button, unique composer and unchanged content. Missing or unloaded targets fail before submission; it does not locate another comment from the same author. One click, context-bound operations, no retry, request fingerprint reservation, instance mutex and poison-on-uncertain-close protect ambiguity. The workbench still independently terminates/confirms its owned process group. Native cancellation, account state and selectors have not been validated on a real platform session.

No reviewed platform submission-response schema is available. The production driver intentionally never populates `Submission.Response`. A matching fresh readback can at most be ACCEPTED, normalized to UNKNOWN. `confirmedResponseMapping=false` also prevents the workbench from accepting a purported confirmation. The synthetic confirmed branch requires independent matching response and readback IDs, exact target/recipient/sender/content, and a new ID absent before submission. Do not fabricate that proof by copying readback into response.

Risk is retained even when stopping is uncertain. Unknown holds recipient/quota; process-stop uncertainty pauses all related rules. Status is not a durable reconciliation API: after process loss it returns UNKNOWN, never resends. DM remains unavailable.

Diagnostic candidate: `4d2e84e7233e9afa8f633b637fe5470354b9ecf65ec40342b4630d3446d4fa4a` (uninstalled, unexecuted; two independent offline builds agree). It preserves fixed-enum stage/error and post/sender/target/author consistency states. Unknown raw errors are redacted to DRIVER_ERROR. No selector, author fallback, target check, submission or confirmation boundary was relaxed.

The prior installed candidate `ee0901efc70426a8d44eef00e731cf474447967057d3b50df4727bb1cf032d96` completed one explicitly authorized validation: live sender identity matched, then returned NOT_SENT/BEFORE_SUBMIT/TARGET_MISMATCH with confirmed shutdown and zero actual submissions. Its coarse historical error cannot identify the failing subcheck. This is not delivery acceptance. The consumed authorization and FAILED ledger must not be reused or erased. Current runtime pins deliberately still select that approved installed candidate; this source change does not install or enable the new build. A future installation requires exact-hash approval, normal pin update/deployment, and separate single-target authorization for any new submission. DM remains unavailable.

## Separate read-only target preflight

The superseding candidate is `8a9d03c41cf531650bcc4698e5ea2d51aac8eac96105d30214dff5d28cc45ab0` (two identical isolated builds; not installed or executed). The earlier `4d2e84e...` candidate has **no** safe preflight entry and its installation request was withdrawn.

`workbench_reply_preflight` uses `workbench.xhs.exact-preflight.v1`. Its target has account/sender/post/comment/author IDs and the existing post reference, with no content, submission authorization or retry fields. `ReadOnlyInspector` and the separate named driver expose only `Inspect` and `Close`. The inspected call path performs page navigation and state/DOM reads, never Select, Type, Submit, click, focus, input, scroll, cookie save or a platform write API. It does not expand comments, switch accounts or search for a replacement target. The page may itself load ordinary resources; this is not a network-off operation.

For an approved future diagnostic, the owned runtime must start with `CRM_EXACT_PREFLIGHT_ONLY=1`, without `CRM_EXACT_REPLY_ENABLED`. In this mode MCP registers **only** preflight and all legacy HTTP API routes are omitted; `/health` and authenticated `/mcp` remain. `LoginRuntime.openSavedForPreflight` selects this mode and requires the installed reviewed hash. `XhsExactPreflightTransport.inspect` accepts only an owned account-bound endpoint with explicit matching hash approval, verifies the singleton tool set and only permits one preflight call. It closes the owned process on completion/cancellation; no automatic retry, send transport, business ledger or old single-send authorization is involved. Its RPC boundary rejects send tools even if advertised by a server. Existing global pins intentionally still reference the installed `ee0901ef...`; no new pin or live runner has been enabled.

Output contains fixed enum consistency checks (`MATCH/MISMATCH/UNKNOWN`), source paths, exact DOM cardinality/author/button checks and composer presence/emptiness. Source enums name the inspected paths, not proof that missing fields existed. No actual IDs, body, URL, token, cookies or raw errors are returned. `MATCHED_READ_ONLY` means only the target matched during this inspection; it is not send authorization, submission readiness or delivery confirmation. The result's zero write-operations invariant is enforced by this source path and offline tests, not a platform receipt. Browser close plus independent owned-process close must both confirm. Unconfirmed cleanup stays unavailable.

Validation covers synthetic DOM execution with write traps, Go identity/error/cancellation/cleanup cases, route exclusion and transport HTTP fixtures. No actual browser/account preflight has been run. Historical coarse TARGET_MISMATCH remains unlocalized until a separately approved read-only run. Installation and read-only execution of this exact hash still require approval; any later submission needs a separate fresh one-target authorization. The consumed failed authorization remains untouched.
