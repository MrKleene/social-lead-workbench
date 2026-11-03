# Recoverable history archive

Administrator-only, CSRF-protected archive/restore endpoints. This is a display archive, not data deletion. Batch/item audit records remain after restoration.

- `POST /history-archives`: explicit batch UUID, verified local backup SHA256, consent `ARCHIVE_HISTORY_KEEP_SAFETY`, exact expected pending IDs/count. Requires no active reads, model calls, review jobs, sends, leases, active acceptance, or enabled reply rule. All entity markers and cancellation of never-attempted pending replies commit atomically.
- `GET /history-archives`: counts and restoration state only.
- `POST /history-archives/:id/restore`: consent `RESTORE_DISPLAY_ONLY_NO_SEND`. Restores display only. Removed pending replies stay CANCELLED; old job/model authorization cannot be replayed.
- UI: configuration management → 归档记录 → 恢复显示 → 确认恢复显示.

`Db.historyDisplay()` is an explicit read-only client over the `history_display` schema. Only display/query methods use it. Public-schema account identity, risk, UNKNOWN, contact ledger, quotas, model cost records, config and dispatch remain authoritative and unchanged. Never pass a display client into dispatch/authorization logic or use it to infer that contact history is absent.

Re-observation in a genuinely new, unarchived collection run makes saved captures/scores visible and eligible for ordinary fresh authorization checks. Restoring an old run alone does not. Existing cross-channel contact deduplication and risk checks still apply. A cancelled old pending job is never revived.

Schema maintenance: PostgreSQL views freeze their column lists. Future migrations adding/removing/renaming columns or enum values in visible models must update the corresponding `history_display` views/types in the same migration. Do not drop the archive tables or safety guards as a rollback after an archive. Prefer forward fixes; use normal display restoration for user recovery. A code downgrade needs a separate safety review to prevent old jobs being reconsidered.

Tests: `apps/api/test/history-archive-postgres.test.ts` must run against a dedicated disposable local `crm_test`; it deliberately retains its fixture records for post-test inspection. No platform/model sender is used. Existing API integration tests cover the unchanged safety contracts.
