# Search JSON transport candidate — not installed

Base: `38d5302`, isolated worktree `search-transport-fix`. Production remains at that revision with MCP `v2.5.5-local-search-note-parse` / SHA-256 `e16b2e9f7305883123b07c59e468971ef19780475cf6109a944233ed08ce99de`.

## Observed evidence and limits

The 2026-10-23 18:55:48 UTC run failed at search step 2, before detail reading. Its retained safe observation reports 22 entries (20 notes, two known non-notes), both selected fields ARRAY, three observations/407 ms, followed by `parseIssue={itemOrdinal:0,field:items,expected:ARRAY,actual:OBJECT,reason:TYPE}`. Here ordinal zero means the whole collection root, not the first note. Four task histories and zero post/comment versions remain. Active tasks, queue entries, leases and advisory locks were zero at inspection.

The page evaluator returns `{diagnostic, feeds:chosen}`. Rod's `Page.Eval` uses CDP `returnByValue`; Go decodes the envelope and then strictly parses its `feeds` member. No subsequent wrapper transformation exists before `parseSearchNotes`. The outer envelope parsed successfully; its nested `feeds` arrived as an object despite the page observing an array.

A synthetic browser regression using the same local Chromium build and production evaluator reproduces that exact boundary failure with `new Proxy(array,{})`: page `Array.isArray` is true; direct CDP object transport yields OBJECT; the old strict parser rejects `items`. Explicit in-page JSON serialization preserves ARRAY and passes the same parser. This establishes a real transport defect. The original live object and its proxy implementation were not retained, so the exact live framework/proxy implementation is not claimed proven. No new platform request was made.

Previous browser fixtures assigned plain arrays/objects to `__INITIAL_STATE__`. They exercised production evaluation but omitted reactive/Proxy transport. Parser-only JSON fixtures inherently cannot detect this CDP difference. New tests retain a direct legacy-boundary reproduction as well as exercising the corrected production call.

## Minimal fix

The existing evaluator is wrapped in in-page `JSON.stringify`; CDP transports a string; Go strictly decodes that JSON envelope before passing `feeds` to the unchanged strict note parser. No OBJECT-to-ARRAY coercion, fallback, required-field relaxation or unknown-card promotion occurs. Nested note/cover proxy data is preserved. An array with a custom serialization that returns an object is still rejected at `items`. The transient string is not logged, audited or persisted; safe diagnostics remain the existing closed schema. URL checks, authentication, collection budgets, readiness/completeness policy, storage and outbound behavior are unchanged.

## Offline validation

- Old path failed the new Proxy-array case before the fix.
- 22 loopback observation scenarios plus cancellation and one explicit CDP boundary comparison passed (24 browser cases). Includes delayed Proxy arrays, plain arrays, matching/conflicting wrappers, nested Proxy notes/covers, mixed types, invalid title types, root serialization tampering, absent state, blocked/error states and cancellation.
- All 22 actual Go/browser diagnostic payloads passed the existing TypeScript persistence contract; synthetic values did not escape the safe diagnostic/error envelope.
- 41 top-level pure Go tests (71 including subtests), five preparation checks, 453 API tests, workspace typecheck and full build passed.
- Initial sandbox build/API attempts could not access compiler caches or bind test ports; those attempts were stopped and rerun with approved normal execution permissions in the isolated worktree. No production database or user session was used.
- Two independent offline candidate builds match exactly; neither candidate executable was run.

## Candidate, review and future deployment

Version: `v2.5.5-local-search-json-transport`.
Reviewed source foundation: upstream `a5c8f7799980ba1fdd501999843eb2d17e4c9a9f` plus the existing manifest-verified local patch chain; only search transport and its regression tests change here.
Compiler: local Go 1.24.13 darwin/arm64, existing module cache, downloads disabled, CGO disabled, trimpath, no build ID/VCS stamp.

Candidate: `/Users/kleene/Documents/Codex/2026-10-21/task-2/mcp-search-transport-review-1/xiaohongshu-mcp-candidate`.
Repeat: the same filename under `mcp-search-transport-review-2`.
SHA-256: `b69353e2530405afdcaa8ac97da10ffd7fec2f2ed4a04ba76a737d083050a3b6`.

No installation, runtime hash changes, production source update, service restart, migration or platform request has occurred in this preparation. Installation requires specific approval: verify this exact hash/source, check idle tasks/locks, retain the current binary and both pins, fast-forward the approved revision without overwriting user changes, atomically install, update the two reviewed Mac pins and normally restart API/worker. Preserve DB/Redis, account/session/configuration and reading budgets. Rollback uses the saved `e16b2e9f…` binary with matching pins and prior application revision through the existing controller; no manual kill or lock deletion.

After an approved deployment, a separately bounded browser test is still required. This offline reproduction fixes the demonstrated transport defect; it does not prove live search success, later note validity, or complete comment coverage. Do not automatically retry real searches.
