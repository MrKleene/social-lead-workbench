# Receive-only inbox

Desktop route `/inbox`, menu `消息通知`. The account list opens an account-scoped inbox with two tabs: DM conversations and comment notifications. An explicit `获取消息` confirmation starts one bounded snapshot for that account. No receiver starts on installation, page load or desktop restart, and no recurring or 15-minute window exists. The snapshot creates no outgoing reply, model request or collection.

The snapshot uses the project-managed MCP browser and the hash-pinned receive binary. The executor opens the account session, proves identity, calls `inbox_snapshot` once for comment notifications and once for DM conversations, ingests the result, then stops the browser. `inbox_start` and `inbox_stop` bracket that single run; the live drain is not used. Only visible platform data is covered.

Coverage is bounded and partial: up to 100 comment notifications and up to 10 visible one-to-one DM conversations × 50 visible inbound messages. The stored coverage is `VISIBLE_CONVERSATIONS_ONLY`; it is not a complete platform history and not evidence of natural push delivery. DM history timestamps without reliable evidence stay unknown. Attachments are labelled incomplete. Opening a conversation may mark platform messages read; confirmation therefore covers read-state changes. System unread is independent of platform unread and stored locally.

The account inbox merges inbound DM messages with confirmed outbound attempts, so a conversation the account started is visible before the other side replies. Comment reply is available only when the notification's post has a stored source reference. Both DM and comment sends are separate preview/confirm operations with their own consent, platform single-session lock, quota and duplicate protection.

Additive SQL migration only. Original business records/configurations/UNKNOWN and risk evidence remain untouched. To roll back source, stop reception normally and restore scoped source copies or revert the local commit, retaining the additive tables and records.

Validation uses `npm run check` and `npm run desktop:test:ui`: synthetic runtime/IPC tests and isolated Electron navigation, filters, read state, imported view-only messages and 320px layout checks. These tests do not access real platform accounts or establish natural new-message delivery. Historical messages/protocol fixtures are not real acceptance; a real snapshot and real replies remain to be validated separately.
