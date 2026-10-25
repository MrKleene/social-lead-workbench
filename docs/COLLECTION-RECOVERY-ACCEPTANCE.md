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
