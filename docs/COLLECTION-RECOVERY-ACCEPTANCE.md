# Bounded cancellation/resume acceptance

Prepared after the two explicit from-start reads on 2026-10-25 at 10:58:44 and
11:00:38 UTC. They took 19.345 and 18.930 seconds. Each read 89 unique comments
(48 roots, 41 replies), created zero new versions and reused 89. Current archive
contains 21 tasks, 9 post versions and 210 comment versions. The target has 41
source-reported reply targets, all resolving uniquely on the same post with matching
target user IDs; one target differs from its root discussion. There is no per-field
metadata update counter, so this is a current-state audit, not a claim of 89 metadata
updates. All 89 checkpoint digests match the stored originals.

## Coordinated real test — not executed by this plan

Target: `6ad6c08a00000000300042d5`, existing saved original reference. No searches,
other posts, budget increases, model calls, outgoing actions or data deletion.
Only one browser task operates the account; engineering performs read-only audits.

1. Confirm no running/queued task or account/checkpoint lease, preserve baseline
   counts, and use the normal account/device verification if required.
2. In the saved post, select **重新读取此帖 → 恢复选项 → 从头重新核对，保留所有已存原文**.
   Submit once using the normal permission/CSRF path. Open that task's progress.
3. Wait for this new task's first durable block: task metrics and checkpoint sequence
   >= 1, confirmed count > 0 and < 89. The previous two runs committed 77 in block 1,
   but do not assume that exact count will recur. The UI's saved count/coverage and
   checkpoint are committed in the same transaction. Verify the task identity;
   never use a global archive count or previous task's 89.
4. While that task is RUNNING, click **停止采集** once. Observe PAUSED/MANUAL_PAUSE,
   retained committed marks and originals, queue job ending, and account/checkpoint
   leases released. Do not start the recovery while an earlier reader is still active.
   If the task finishes before cancellation, record that the interruption was NOT
   tested; do not automatically retry or claim a pass. If the UI request result is
   uncertain, inspect state rather than resubmit.
5. After idle is confirmed, open the same saved post and submit once with the default
   resume option (do NOT select from-start). Confirm START receives the existing
   checkpoint via normal server processing, prefix replay/remaining anchors are
   reported honestly, and subsequent committed marks extend the earlier checkpoint.
6. Confirm unique content versions and direct-target identities were not duplicated
   or lost; compare the final actual visible original, time and count. A dynamic
   new comment is not automatically a dedup failure. Preserve partial/unknown
   coverage where upstream evidence is incomplete.

This tests a user cancellation and a fresh-reader recovery, not an OS/process crash.
No backend restart is needed. A process-interruption experiment is a distinct test
and must be coordinated separately with no other user task; do not simulate it by
manually killing a production process or editing checkpoint/queue state.

## Offline boundaries

The test suite exercises cancellation immediately after a durable block, no second
read after cancellation, a fresh reader resuming the prefix to 125 unique comments,
and production pauseRun preserving committed rows while rejecting a later write.
The persistence callback is idempotent because progress can report the same receipt
more than once; tests must not mistake a duplicate progress notification for a new
chunk. Existing rollback, fence isolation, expired writer and restart recovery tests
remain in place. Offline passing is not the real interruption acceptance.

## 2026-10-25 follow-up: deterministic acceptance

The real 11:11:58 UTC from-start attempt naturally finished before the operator
could stop it. It committed 89 (48 roots + 41 replies), new 0 / reused 89 in two
windows; checkpoint 89 matches all stored originals, with no active owner. This
was **not** an interruption test. Database totals remained 22 tasks, 9 post
versions, 210 comment versions, zero model calls and outgoing contacts.

Run `node scripts/test-queue-isolated.mjs --recovery` for deterministic acceptance.
It creates disposable tmpfs PostgreSQL/Redis on random loopback ports, applies
migrations there, runs the production BullMQ consumer, CollectionService.execute,
transactional archive/checkpoint path and supported pauseRun. Only account/platform
I/O is synthetic, in a separate test-only child; production has no test bypass.
After the first 40 rows and ACK commit, the synthetic next request pauses at a
barrier. pauseRun cancels it, preserving rows/checkpoint and releasing ownership.
The worker exits normally and a fresh OS process restores those 40 IDs from DB,
adds 85, and finishes with 125 unique versions. Duplicate queue delivery adds
nothing. This verifies normal cancellation plus process restart recovery; it does
not claim an uncontrolled crash/power-loss or real platform interruption test.
Account/device authentication and platform replay are covered elsewhere, not by
the synthetic account I/O in this acceptance.

The same runner starts the actual compiled API three times with real isolated DB
and an authenticated synthetic SSE client. Before the fix, API shutdown remained
blocked until the client connection was closed at 2.5 seconds (2507/2511/2522 ms).
Normal production launcher cleanup had a 1.8 second grace, and historical lifecycle
records show API SIGKILL around 1816–1823 ms. The exact old requests were not logged,
so this reproduces a concrete mechanism, not proof of every historic timeout.
EventsController now completes its streams during module destruction. Three
post-fix runs exited in 6/6/6 ms with the SSE client still open. Worker shutdowns
were 9/6 ms. No launcher deadlines, native supervisors, safety checks or force-kill
policy were changed. Temporary containers are removed; no production credentials,
platform requests or business records are involved.

## Exact browser link compatibility

The observed detail navigation marker `source=web_note_detail_r10` is accepted
alongside the two previously reviewed markers. It is removed only after full URL
validation; the original access token/source bytes and post ID are preserved.
Unknown navigation values, duplicate parameters and encoded aliases remain
rejected. Navigation markers are not saved, logged, or sent to the model.
Browser acceptance requires only pasting the original copied link in 单帖检查
and observing local validation/preview; do not submit another platform request
just to test the link parser.
