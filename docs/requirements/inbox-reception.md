# Receive-only inbox

Desktop route `/inbox`, menu `消息通知`. Explicit account selection and read acknowledgement starts a 15-minute reception window. No receiver starts on installation, page load or desktop restart. No outgoing reply/model/collection is created.

Native project MCP browser only, separate hash-pinned receive-only binary. Existing sender binary is unchanged. Exactly four tools: start, local drain, bounded snapshot, stop. Authenticated loopback startup is mandatory.

Native RWP WebSocket: DM protobuf events persist inbound messages; comment message-center signals trigger bounded notification reads. Initial connection/reconnection/overflow and lease rotation reconcile history. Native page may independently poll; comment push remains unconfirmed until an actual signal arrives. This is not a claim of zero-polling or complete history.

Device safety currently rotates each owned browser before its five-minute lease expires; whole window is 15 minutes. Prior browser/MCP resource observation was about 1.1 GiB RSS, not zero-cost push. Business tasks request graceful yielding; unconfirmed browser exit retains the lease.

History bounds: up to 100 comment notifications, 10 visible one-to-one DM conversations × 50 visible inbound messages. DM history timestamps without reliable evidence stay unknown, with no invented fresh-message alert. Attachments are labelled incomplete. Reading can change platform unread state. System unread is independent of platform unread state and stored in the local workbench. No external forwarding.

Additive SQL migration only. Original business records/configurations/UNKNOWN and risk evidence remain untouched. To roll back source, stop reception normally and restore scoped source copies or revert the local commit, retaining the additive tables and records. Original sender/MCP binary is never replaced.

Validation uses `npm run check` and `npm run desktop:test:ui`: synthetic runtime/IPC tests and isolated Electron navigation, filters, read state, imported view-only messages and 320px layout checks. These tests do not access real platform accounts or establish natural new-message delivery. Historical messages/protocol fixtures are not new real-time acceptance; natural inbound remains to be validated separately.
