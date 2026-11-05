# Inbox conversation replies

## UI and authority

Administrator entry: `/inbox?view=chat`. A DM in the notification list also links to its account-bound conversation. The page shows locally received inbound messages and account-bound outbound records, with server pagination (30), local per-user unread markers, a draft and an explicit preview/confirm flow. It does not fetch the platform or mark platform messages read when opening a saved conversation. Current platform receive-window limitations still apply; this feature does not enable perpetual or multi-account authentication.

Sending is a distinct reply operation, not first-contact marketing. The receiving account cannot be substituted. The server freezes a verified incoming message ID, its body hash, receiver identity, account/session version, content and quota day. Historical missing identity is read-only until a later identity-verified observation sees the same sender, platform message and exact body; no bulk backfill occurs. Every submission rechecks permissions, account restrictions, do-not-contact/risk evidence, concurrent contact jobs, shared quota and platform pause.

## Send and uncertainty

`POST /inbox/chat/prepare` returns a short-lived actor-bound preview token without reserving quota or opening the platform. `POST /inbox/chat/confirm` atomically reserves quota and an attempt keyed by the preview, then calls the owned MCP once. Replaying the same submission key reads that attempt. A confirmed, pending or unknown reply to the same incoming message blocks another reply. A newer inbound message permits a new explicit conversation reply; first-contact same-channel deduplication remains unchanged.

The managed MCP accepts optional `replyTo` only with the exact latest visible incoming message and no outgoing message after it. It preserves exact sender/recipient binding, draft and platform restrictions. Existing identical outgoing messages are excluded from receipt candidates. Confirmation requires a new server message ID and an independent page readback. Proven zero-submission failure refunds only its reservation. UNKNOWN retains quota, deduplication and platform protection, and is never retried automatically. Network errors offer a local status query rather than a new send. A stale pending attempt is labelled interrupted/pending investigation without pretending it failed or silently releasing protection. There is no new automatic UNKNOWN resolution endpoint.

Replies are recorded as `CONVERSATION`, not single-contact tests. Original incoming text and account nickname are frozen in the attempt audit snapshot. Thread history contains only saved inbound data and reliably account-bound outgoing attempts; it is not a promise of complete platform history or externally sent messages.

## Persistence and deployment

Migration `20261105110000_inbox_reply_identity` adds nullable `InboxMessage.receiverId` and admits `INBOX_REPLY` in the existing attempt-kind check. No business data is deleted, backfilled or reset. An application rollback can retain the additive schema and all attempts; do not drop evidence columns or delete new attempts to downgrade.

The reply-aware native binary must match the hash pinned in runtime and executor code. Existing reviewed source was first rebuilt byte-identically to the prior deployed binary, then only the bounded reply overlay was applied and reproducibly rebuilt. This proves provenance/build reproducibility, not real platform chat acceptance. This change has only isolated/mock acceptance; no real conversation reply was sent during development.
