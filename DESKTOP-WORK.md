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

Implementation checkpoint: steps 1–3 have a tested local foundation; step 4 is
pending, step 5 has a fixed-allowlist preview and a fail-closed release gate.
Offline legacy import preserves business archives and contact/quota guards, but
is not full native table/UI parity. See docs/DESKTOP-LOCAL.md for evidence,
commands, platform limits, dependency advisories and the remaining release work.

Framework decision is now deferred while Electron, Tauri and Flutter are compared.
The Electron shell is a reversible isolated preview, not a committed product choice.
Core runtime/tests/import CLI are independent of Electron APIs and committed separately.
