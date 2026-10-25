# Direct reply targets (prepared, not installed)

Source evidence: the authorized browser diagnostic observed `targetComment.id` and
`targetComment.userInfo.userId` on all 41 replies of the 89-comment sample. On the
six-comment sample, the three reply targets matched their three parent comments.
The enclosing `subComments` relationship is a discussion relationship and is not
rewritten as the direct target. Nested target semantics still require comparison
with the actual original page after installation.

## Change and boundaries

- The reviewed MCP DTO retains only those two exact public identifier fields.
  Missing/malformed optional target data does not invalidate an otherwise valid
  comment. Unknown aliases, profile fields and URLs are not copied.
- The adapter and existing JSON archive retain optional `replyTarget`. No database
  migration is required. No current records are backfilled or guessed.
- Metadata does not affect content versions, checkpoint digests, lead identity or
  model payloads. Conflicting target evidence is retained and marked for review;
  it is not silently replaced.
- UI resolves an exact same-post comment ID, checks the source target user ID when
  available, and does not resolve ambiguous versions. It shows the direct target
  separately from the enclosing discussion. Cross-page targets remain explicit.
- A successful root scroll before CHUNK_READY now reports VISIBLE_WINDOW_READ
  instead of NOT_RUN. Completeness criteria and all read budgets are unchanged.

## Candidate and reproducibility

Version: `v2.5.5-local-comment-reply-target`.
Prepared using the existing pinned source manifest and offline patch/build chain.
Two isolated builds produced identical SHA-256:
`c82dc7a798a30e51531afd6dd13417cc1c2ba5dbc2dfead8febcc39516a6f1e9`.

Candidate directories (same Mac task workspace): `mcp-reply-target-review-1` and
`mcp-reply-target-review-2`; binary `xiaohongshu-mcp-candidate`, provenance and
compiler flags in `BUILD.json`, offline test logs alongside it. Neither binary
was installed or executed. Current installed SHA remains
`039135aa9614e9606f36a99989f68803b8a6bce30a21e42b28d5d810b787722d`.

## Installation and acceptance (requires exact candidate approval)

1. Confirm no active task/login/lease; verify exact candidate hash. Preserve the
   current MCP bytes and the two reviewed runtime hash settings, recording their
   hashes. Use independent copies, not hard links. Preserve all data/settings.
2. Update production to the reviewed application commit, build normally, atomically
   install this exact approved binary and update the existing two review hashes.
   Use the supported backend control channel to restart API/worker. No migration,
   database/Redis/frontend restart or platform request is necessary for health checks.
3. Verify installed hash, actual running code, API health, worker idle, control
   channel and unchanged data counts. On failure restore the previous verified
   binary/hash settings and compatible app revision via the supported channel;
   do not bypass file security checks or remove unknown locks.
4. Coordinate ONE browser-triggered targeted read with current valid original
   reference and normal account/device authorization. For existing checkpointed
   comments, default resume returns no old rows; it cannot enrich their metadata.
   Use the existing explicit read-from-start option for this one target, preserving
   old originals and checking zero duplicate content versions. Do not clear data
   or fabricate checkpoint state. Compare direct targets by actual comment ID and
   original page reply labels, including a reply to another reply; check the root
   discussion remains unchanged. No bulk search or automatic retry.

The prior 95-new/89-resume audit proved durable ACK consistency and no lost or
repeated stored versions. It did not prove new target mapping, process-interruption
recovery or platform-wide completeness. The old 41-declared/38-visible difference
remains unresolved and is not changed by this patch.
