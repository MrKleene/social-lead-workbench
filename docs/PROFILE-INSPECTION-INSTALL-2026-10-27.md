# Approved profile inspection installation

This integration is based on fc2060cb3e489ee68eab6f36cdf63a6045008abf. It selects only the restriction transport, its tests, the one-shot profile operator/scope/tests, and documentation from approved source 118d507e2079f44fe137363de3fb863bf9e450c5, plus the necessary macOS installed hash pin. It does not merge the other changes in 35e66bb or enable any sender.

Approved MCP SHA256: 3de582dde35eb6733b5c9557b934d0562af440c5c1897ee9e565310a8aa24877.
Version: v2.5.5-local-account-profile-inspection-v1.
Overlay SHA256: 823f904a64bda0529814db8c8552f34c17d58940e9a807bcd1abcac4df83d7c9.
The exact Go overlay is in approved source 118d507; the prior repository Go overlay is not a reconstruction of this installed binary. The approved source is preserved in the local reliability-and-profile bundle. The binary was reproduced in independent profile-candidate-6 and profile-candidate-7 builds; no new build is substituted at installation.

No migration, account-state edit, sender allowlist change, rule edit, or historical ledger/quota write is part of this installation. A fresh, expiring, account-bound scope allows one profile inspection only. Dedicated runtime exposes only the read-only singleton tool; no notification/message/write route is called. A refused or uncertain operation is stopped and reported, never replaced by an alternate route. No remote push is included.
