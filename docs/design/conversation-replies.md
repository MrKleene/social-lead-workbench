# Inbox conversation replies

## UI and authority

Administrator entry: `/inbox` shows accounts; selecting one opens `/inbox?account=<id>` with `私信` and `评论` tabs. The DM tab merges inbound messages with confirmed outbound attempts, so conversations started by this account are visible. The comment tab lists locally received comment notifications. Unread markers are local and independent of platform read state.

Sending is a separate preview/confirm operation (`previewChat`/`authorizeChat`, `previewCommentReply`/`authorizeCommentReply` over local IPC), not first-contact marketing. The account cannot be substituted. The preview freezes the account revision, recipient, content and, for comment replies, the exact received message and post source reference. Every dispatch rechecks permissions, account capability, do-not-contact evidence, concurrent sends, quota where applicable and platform pause.

DM sending has two purposes. A never-answered inbound message uses `INBOX_REPLY` and consumes that inbound message once. Once a DM is confirmed, later messages use `CHAT_FOLLOW_UP`; there is no user-visible follow-up counter and no conversation message limit. Comment replies use `INBOX_COMMENT_REPLY` and are allowed only when the notification's post has a stored source reference. Nested replies (a comment with a parent) are rejected before any platform session opens; other preflight failures keep their exact reason instead of collapsing into a generic interruption.

## Send and uncertainty

Displayed messages are local records. The UI does not fetch the platform on open. Inbound text and the account nickname are frozen in the attempt audit snapshot; thread history is not a promise of complete platform history.

Chat replies do not consume the account's daily contact quota; automatic first contact and pending-list manual sends still do. Cross-account and cross-channel first-contact deduplication remains: if any account already contacted the recipient on either channel, a new first contact is blocked. Inbox replies and comment replies are exempt from that first-contact check, but blocked-contact evidence still applies.

The managed MCP preserves exact sender/recipient binding and platform restrictions. Confirmation requires a platform message ID and an independent page readback; readback accepts both `sender.recipient.hex` and `recipient.sender.hex` participant orders while still binding the current account and recipient, and keeps the specific failure reason. Proven zero-submission failure refunds only its reservation. `UNKNOWN` retains deduplication and cancels the rest of the local batch. An automatic delayed readback can later confirm the message and restore the queue row to sent; if it cannot confirm, the queue row is closed automatically and the send pause is released, without retrying. A blocked or failed item stops the remaining queued items in that chat; the user may retry explicitly.

Queued chat messages live in a module-level local queue, so leaving the page keeps sending. The first item shows `发送中`, later items `排队中`, and only a confirmed job shows `已发送`. Closing the application asks before cancelling unsent items; abnormal exit restores drafts as `未发送` and never auto-sends them on restart.

## Persistence and deployment

Migration `023-account-capability-and-chat.sql` adds `accounts.collect_state`/`contact_state`, `send_attempts.purpose`/`batch_id`/`quota_charged`/`recipient_name`, rebuilds the outstanding-recipient index for first contact only and adds a batch lookup index. It deletes and backfills nothing. A rollback may retain the additive schema and all attempts; do not drop evidence to downgrade.

The reply-aware native binary must match the hash pinned in runtime and executor code. This proves provenance/build reproducibility, not real platform chat acceptance. Real first-contact DMs have platform-confirmed evidence; comment replies, batch and multi-account runs remain unverified. Synthetic and migration tests are not real platform acceptance.
