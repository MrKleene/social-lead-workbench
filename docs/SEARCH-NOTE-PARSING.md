# Search note parsing candidate — prepared, not deployed

Base: `868a541`. Work is isolated in `search-note-parse-fix`; production checkout, executable, reviewed runtime pins, budgets and services remain unchanged.

## Evidence and limits

The 2026-10-23 17:36 UTC task failed with `NOTES_AVAILABLE` / `DESERIALIZATION_FAILED`: 22 raw entries, 20 notes, two known non-notes, no unknown types, no invalid mandatory identity detected by the page observer, one observation, both arrays matching. The old Go path then attempted to unmarshal the **entire** array into `[]Feed`, before filtering notes. This locates the failing conversion but does not identify its actual field. The original response and typed error details were not retained. Neither non-note cards nor a particular counter field is claimed to be the proven historical trigger.

The confirmation warning was separately reproduced offline with the deployed build: during `data-state=closed` / `drawer-out`, fast query completion cleared the pending flag before the exit animation unmounted the contents. The previous test held refresh pending and missed this timing.

## Narrow changes

- Search decodes each entry discriminator before note-only fields. Known and unknown non-note kinds remain excluded and counted by existing observation logic. A malformed discriminator/object is not promoted to a note.
- A separate search response projects only `modelType`, `id`, `xsecToken`, optional `noteCard.displayTitle` and optional `noteCard.cover`. Homepage, detail, comment and reply structures are unchanged. Unused search index, author, interaction counters and video metadata no longer participate in strict note conversion; their types cannot abort the collection merely because they differ from unrelated Go `Feed` members.
- IDs retain the adapter's character/length policy. Token and title type/length checks are strict; no string coercion, truncation or synthetic title. Missing/empty required values fail. Null/missing optional title remains absent. A provided note card must be an object. Cover shape is passed to the existing image normalizer and URL policy; it is never placed in parsing diagnostics. The workbench URL safety boundary is unchanged.
- Invalid required fields return no partial successful batch. Already persisted data is untouched. `complete` still stays false unless future work supplies actual completeness proof; this candidate does not increase search/reading scope.
- Optional `parseIssue` is closed and version-compatible: ordinal, one of seven fixed field paths, expected/actual type enums, and controlled reason. No input/error string, values, IDs, URLs or tokens are copied into it. Unknown keys/enums and inconsistent observations are rejected by the workbench. Existing validated observation transport carries it through adapter, collector, metrics and audit; the existing folded details view displays it.
- The confirmation warning requires the sheet to be open, in addition to the prior pending/uncertain guards. Successful submission and close animation no longer re-render a self-task warning. Open-sheet foreign-task and eligibility-change checks remain.

## Validation scope

All fixtures are synthetic; browser pages bind loopback and all app API routes are mocked. No candidate MCP process, user browser profile, credentials or real platform request is used.

Tests cover mixed cards with incompatible non-note fields, unused note counter/video fields, missing/null/empty/invalid/oversized IDs and tokens, wrong/oversized/multilingual titles, optional fields and cover preservation, invalid roots, no partial batch on late bad entry, safe error serialization, old observations and unsafe diagnostic rejection. Actual Go/browser observations are validated against the TypeScript persistence contract. The real commit path with a mock transaction verifies both metrics and audit. UI tests exercise fast and delayed refresh, desktop/390px, exit animations, repeated clicks, pending Escape, genuine foreign task, failed/uncertain responses, keyboard and details display.

Final results: 453 API tests, 101 web unit tests, 28 mocked UI groups (fast/delayed refresh × desktop/390px), 41 top-level pure Go tests, 18 loopback browser scenarios and 17 actual Go-to-TypeScript observation payloads passed. Preparation checks, workspace type checks and full build passed. UI evidence: `/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-task-ui-zJj0Ww` (synthetic only). The first two UI attempts exposed fixture omissions (required metrics fields and opening the folded evidence section); these were corrected before the passing full run. Both final independent candidate builds have the hash below.

## Candidate and future deployment

Version: `v2.5.5-local-search-note-parse`.
Source: manifest-verified upstream `a5c8f7799980ba1fdd501999843eb2d17e4c9a9f` plus the existing reviewed local patch chain and `search-note.patch`.
Compiler: local Go 1.24.13 darwin/arm64, module downloads disabled, `CGO_ENABLED=0`, `-trimpath`, `-buildvcs=false`, empty build ID.

Candidate: `/Users/kleene/Documents/Codex/2026-10-21/task-2/mcp-search-note-review-1/xiaohongshu-mcp-candidate`.
SHA-256: `e16b2e9f7305883123b07c59e468971ef19780475cf6109a944233ed08ce99de`.
Independent repeat build: `mcp-search-note-review-2`; its SHA matches exactly. Reverify before any approved installation.

Installation is NOT performed by this preparation. It requires a new approval: verify exact artifact/hash and clean production tree, confirm idle tasks/leases/queue; back up the installed MCP and both reviewed pins; fast-forward approved source, atomically replace `~/.local/bin/xiaohongshu-mcp`, update only the two reviewed hashes, build and normally restart API/worker. No migration is needed. Preserve frontend behavior, DB/Redis, sessions, secrets and budgets. Refresh frontend after approved deployment.

Current installed hash to preserve/restore: `34e291206661343772f2c03a1d230a49cd7b726a5b1a79948af0d88ff64d08cf`. Rollback restores that binary, its two pins and prior approved application revision using the normal controller; no lock deletion or manual force-kill. Real platform validation remains separately bounded and must not be started by installation scripts. Historical failing field and real search success remain unverified.
