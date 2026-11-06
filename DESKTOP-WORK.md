# Local desktop implementation work

Original snapshot d08f965; work only on desktop-local-sqlite in the isolated copy.
Targets: macOS 13+ arm64 and Windows 11 x64, shared Electron/SQLite/local queue.
No production data, Cookie, model key, service or platform operation may be touched.

Implemented: local storage/queue/safety repositories; frozen automatic contact
eligibility; strict send receipts; model adapter registered with per-batch consent;
original finite collector bridge and durable chunk checkpoints (synthetic runtime
only); no workspace login; configuration/model/history UI; read-only legacy export;
offline import and archive viewer; explicit previewed data-copy activation with
backup; Mac DMG and packaged offline self-test; Windows NSIS/DPAPI helper source.

Not a product release: actual platform login/read/send/receive runtimes and native
resources, full legacy-native mapping, full original UI parity, native credential
and Windows installation validation, signing/notarization remain incomplete.
Tests must use synthetic transports and temporary directories. Do not promote or
switch the original workbench. See docs/DESKTOP-LOCAL.md and LOCAL-BUSINESS-PARITY.md.
