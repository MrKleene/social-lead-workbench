# Search result readiness candidate (not deployed)

Base: `582c261`. Preparation is isolated in
`/Users/kleene/Documents/Codex/2026-10-21/task-2/search-readiness-fix`.
The production checkout, running services, reviewed executable hashes and collection budgets are unchanged.

## Verified source boundary

Reviewed MCP source: `a5c8f7799980ba1fdd501999843eb2d17e4c9a9f` plus the existing local patch chain, verified by `scripts/mcp-avatar-diagnostics/source-manifest.json`.

- `makeSearchURL` sets `/search_result?keyword=...` on the official HTTPS origin.
- Search state uses `__INITIAL_STATE__.search.feeds.value` / `._value`.
- `onlyNotes` accepts exactly `modelType=note`; `live_v2` and `hot_query` are known non-note kinds in the reviewed source. Unknown kinds are not guessed or accepted.
- Existing `.access-wrapper`, `.error-wrapper`, `.not-found-wrapper`, `.blocked-wrapper` selectors come from upstream accessibility checks. A visible nonempty error container stops reading; its text is never returned. An unclassified page error is `PAGE_REPORTED_ERROR`, not an invented account restriction/login failure. Absence does not prove access is unrestricted.
- **No verified search-specific loading-done / explicit-empty / exhaustion signal was available in source or retained evidence.** No invented selector, guessed boolean or generic page-load event is promoted to such proof.

## Changes

A search now observes only its already-open page, at 200 ms intervals for at most approximately 8 seconds (within existing call/run deadlines). No new navigation, search retry, scrolling or reply expansion is added. It accepts available note records only after matching the official origin, search route and current keyword, with document loading finished and strictly recognizable note data. This proves records are available; it does not prove exhaustive search coverage.

An initial empty array no longer immediately ends the search. Empty-at-deadline stays `EMPTY_UNCONFIRMED`, even if it was genuinely empty on the platform. Conflicting `value`/`_value` are not silently resolved in favor of the empty field. Both fields must agree when both are present. Missing fields, unsupported structures, filtered known non-notes, unknown item types, invalid mandatory note identity, route mismatch, access errors and cancellation remain distinct. Strict existing note IDs/tokens are still validated by the adapter.

`complete` remains false: neither an empty array, a delay, stable counts nor received notes prove search exhaustion. This limitation is explicit in task summaries and evidence rather than mislabeled as a successful zero-result search.

A versioned allowlist carries field shapes, selected path, raw/note/known-other/unknown/malformed/accepted counts, first raw count, observation count, elapsed time and stop category. Missing counts remain null. It contains no keyword value, title, ID, response text, URL, token or account information. The adapter, collector, task metrics, audit and existing authenticated task API all retain the same validated structure. Old MCP responses remain supported with `LEGACY_UNAVAILABLE`; invalid optional diagnostics are discarded and labeled, not trusted. Diagnostics never enter semantic inputs or content hashes.

The confirmation sheet closes upon a validated successful response, before cache refresh completes. Pending and uncertain outcomes remain protected against repeat clicks. Genuine other-running-task, eligibility change and HTTP failure states remain visible.

## Offline validation

Final checks passed: 445 API tests, 101 web unit tests, 14 mocked UI groups, 15 loopback browser cases, 14 actual Go-to-TypeScript diagnostic payloads, candidate preparation checks, workspace type checking and builds. Both final candidate builds passed their pure Go diagnostic tests.

- API tests include synthetic MCP success/empty/error responses, evidence validation and the real commit function with a mock transaction, asserting both task metrics and audit payloads.
- Loopback Chromium tests execute the actual Go page evaluator: delayed notes, valid-but-unproven empty state, absent state/feeds, `_value`, conflicting/matching wrappers, known/unknown kinds, wrong structure, missing mandatory identity, access error, wrong route and cancellation.
- `test-search-wire.mjs` feeds the actual controlled Go/browser observations through the strict TypeScript persistence contract.
- Desktop and 390 px UI tests intercept all business requests. They inspect the response/refetch race with a MutationObserver, double click, failure/unknown responses, genuine eligibility changes, other active tasks, task/history separation, and search summaries/details.
- No test reads a user profile/session or requests the platform. No candidate MCP server was executed.

Reproduce using the existing local Go 1.24.13 compiler/module cache, with `GOPROXY=off`, `GOSUMDB=off`, `GOTOOLCHAIN=local`, `GOWORK=off`, `GOENV=off`, `GOTELEMETRY=off`:

```sh
node scripts/mcp-avatar-diagnostics/build-candidate.mjs REVIEWED_SOURCE NEW_OUTPUT GO_BINARY EXISTING_MODULE_CACHE
# In NEW_OUTPUT/source, use a temporary test browser; test pages bind loopback only:
XHS_TEST_BROWSER=EXISTING_CHROMIUM GO_BINARY test -count=1 -run '^TestSearchObservationBrowser$' -v ./xiaohongshu > LOOPBACK_TEST_LOG
node scripts/mcp-avatar-diagnostics/test-search-wire.mjs LOOPBACK_TEST_LOG
```

The uppercase paths above are placeholders, not commands to run against production. `build-candidate.mjs` itself disables module downloads and does not install/execute the MCP executable.

## Candidate and approval boundary

Version: `v2.5.5-local-search-readiness`.
Two independent final builds (`mcp-search-readiness-review-5` and `-6`) match:

`34e291206661343772f2c03a1d230a49cd7b726a5b1a79948af0d88ff64d08cf`

Candidate:
`/Users/kleene/Documents/Codex/2026-10-21/task-2/mcp-search-readiness-review-5/xiaohongshu-mcp-candidate`.

Current installed MCP remains `v2.5.5-local-search-failure-reasons`, SHA-256
`72f9e42ecafaa905d6e11af873f2713a23ad469bfaff834053a5216e3f2566da`.

**Installation and deployment require a separate approval.** Then: check no active task/lease/queue; verify the exact candidate and clean production checkout; save old executable and both reviewed pin files; fast-forward the production checkout to the approved commit; atomically install the candidate at `~/.local/bin/xiaohongshu-mcp`; update only `runtime/platform.cjs` and `scripts/real-mcp/core.mjs` executable hashes; build and normally restart API/worker through the existing controller. Frontend update follows the approved deployment scope. Keep DB/Redis, credentials, budgets and data intact. No migration is needed.

Rollback: restore the saved previous executable and matching two pins, rebuild the previously approved application revision and normally restart only the affected services. Do not delete locks, reset data or lower identity/network guards. The receiver also accepts the previous MCP protocol.

Real search readiness and the former three-empty result cause remain unverified. After deployment approval, any platform verification is a separately bounded authorized action, not an automatic build/install side effect. This candidate does not prove the historical empty arrays were premature, nor that platform-hidden/inaccessible results can be read.
