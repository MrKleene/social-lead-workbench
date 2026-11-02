# DM templates and date-bound account allowance

The configuration center has a separate `dm-templates` category. It reuses the existing template records and admin permissions, filters strictly by `DM`, and fixes the editor channel. The ordinary `templates` category shows only `COMMENT`. Opening either category does not create a draft or send a message; dirty navigation remains guarded.

`AccountDay.dailyLimitOverride` is optional and applies only to the exact `REAL:Asia/Shanghai:YYYY-MM-DD` bucket. The permanent account limit and occupied count remain unchanged. The next Shanghai day uses the permanent limit unless that separate bucket has an explicit override. Database constraints reject negative/oversized values and simulation overrides. All real reservation/final-check paths use the same effective limit; independently authorized rule limits still apply as an additional minimum. This is not a grant to send or a change to pending task states.

A one-day operational change must be audited, locked and checked against the intended account/date/previous usage. No public unauthenticated quota setter was introduced. Retaining the nullable column is backward compatible if rolling application code back; never reset occupied or remove sending audit records.

DM preparation remains preview-only. The installed MCP binary's actual `tools/list` on 2026-11-02 exposed no DM tool and advertised only COMMENT. Login/session reuse is provided by the owned MCP/Rod runtime; any future DM implementation must use that runtime, not a user's ordinary browser. No DM platform acceptance, conversation lookup, inbox or delivery/read receipt support is claimed.

Validation: 532 frontend tests, 1088 API tests, 603 isolated PostgreSQL tests; workspace typecheck/build. Isolated desktop/320 UI tested category filtering, explicit create, fixed DM channel, cancel and dirty navigation. Tests used synthetic data and no platform/model/send calls.
