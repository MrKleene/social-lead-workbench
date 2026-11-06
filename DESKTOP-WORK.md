# Local desktop implementation work

Original snapshot d08f965; only branch desktop-local-sqlite in the isolated copy.
Targets macOS 13+ arm64 and Windows 11 x64. Never touch production data/services,
credentials, real platform operations or paid models during implementation tests.

Current: Electron main registers native LOGIN/COLLECT/INBOX/SEND and model adapters
behind explicit UI scope consent; SQLite queue/guards, sealed local credentials,
original strict receipts/journals, bounded collection/inbox and reviewed manual
contact/replies. Mac package includes fixed browser, restricted Go MCP and owned
supervisor with sandbox retained. Mac packaged offline native chain and system
synthetic encryption roundtrip passed. Windows MCP cross-build succeeded; Windows
Job Object handoff source exists but remains gated and unvalidated on Windows.

135 local tests; 12 desktop IPC/native/wire tests; Mac UI/import/restart/backup,
packaged self-test and native browser chain. No live platform acceptance.
Legacy rows fully archived; reliable captures/reviews map to read-only history,
ambiguous provenance remains explicitly unmapped. Import/restore send hold stays.

Still incomplete: automatic contact UI/orchestration, full independent-review and
cross-run recovery UI, importer/recovery parity, Windows native/browser/installer
acceptance, signing/notarization and real platform acceptance. Do not promote this
as fully finished or switch original data. See docs/DESKTOP-LOCAL.md.
