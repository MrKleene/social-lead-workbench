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

Current candidate: `ee0901efc70426a8d44eef00e731cf474447967057d3b50df4727bb1cf032d96` (uninstalled, unexecuted). Review/installation approval does not authorize sending. A separately scoped, explicitly approved platform validation with specified account, exact target and text is needed before claiming live support; response mapping and native stop behavior remain unverified.
