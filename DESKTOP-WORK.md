# Local desktop implementation work

Source: original working tree snapshot d08f965, original repository untouched.
Target: Windows 11 x64, SQLite, durable queue, no workspace password, local credentials.

Implementation sequence:
1. Durable SQLite storage/queue/authorization/send safety and synthetic failure tests.
2. Exclusive user-data lifecycle, credential provider, consistent backup/restore and explicit offline import.
3. Desktop IPC boundary and packaged lifecycle; no anonymous local HTTP management API.
4. Port existing business repositories and UI onto local services; preserve account identities and UNKNOWN handling.
5. Package resources and Windows build/acceptance gates. Do not claim native verification on macOS.

No production database, Cookie, model key, running service or platform operation may be touched.
Do not promote or switch the real instance until repository parity and data migration validation pass.

Implementation checkpoint: Electron is confirmed by the user. SQLite storage,
queue, native collection/review/inbox repositories, frozen-rule automatic contact,
strict receipt parsing and local history UI are implemented with synthetic tests.
The old production instance is untouched. No real executor is registered yet.
Windows packaging/lifecycle, full legacy native mapping, platform adapters and
full UI parity remain unfinished; this is not a product release.
See docs/DESKTOP-LOCAL.md and docs/LOCAL-BUSINESS-PARITY.md for current evidence.
