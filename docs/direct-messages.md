# Private messages: preparation only

This module is a real local, read-only preparation service. It is **not a DM
sender**, an authorization grant, a simulated success adapter, or a release of the
existing pending comment jobs. No send route is registered. Neither platform is
open for real DMs. The existing comment sender, quota reservations, rules and
workers are unchanged.

## Endpoints

- `GET /api/direct-messages/capability?platform=XHS` (or DOUYIN): administrator
  session required; reports send/conversation/inbox/read-receipt capabilities false.
- `POST /api/direct-messages/preview`: administrator session, Origin and CSRF
  required; exact `accountId/accountVersion`, `reviewId/reviewVersion`, and
  `templateId/templateVersion`. Other fields are rejected. It performs only local
  database reads in one repeatable-read snapshot.

The selected template must be DM. The recipient is the stable author of the exact
stored review/captured comment/post, never a client-supplied ID or nickname.
Missing bindings and stale versions fail. Nickname/title come from that source;
missing keyword/profession are reported, never inferred from a later comment or
current keyword group. The result shows final text, source, daily shared quota,
no-contact/exclusion, existing cross-channel contact/UNKNOWN locks, account and
platform risk, and missing fields. Historical comment restrictions are flagged
as scope-unverified rather than treated as proof of DM permission or refusal.
Cached login is not proof of current platform or DM availability.

Every result is `PREVIEW_ONLY`, `sent:false`, `canSend:false`,
`authorizationCreated:false`, `conversation:null`, and `reservedByPreview:0`.
The informational fingerprint is not a token and is never accepted for sending.
No raw session credential, model setting, full snapshot or audit payload is
returned. Preview does not mutate, queue, reserve, inspect the platform, render a
real chat, or invoke a model. There is deliberately no production UI send button.

## External dependency and release gate

The pinned local MCP and its reviewed exact-reply protocol support COMMENT only.
The upstream maintainer's documented tools likewise list comment/reply tools, not
DM. Public official Marketing API docs inspected on 2026-11-02 describe advertising
capabilities and OAuth onboarding; they did not establish a usable private-message
send/conversation/receipt contract for this application. This is not a claim that
no authorized private API exists.

Primary sources inspected:
- https://github.com/xpzouying/xiaohongshu-mcp
- https://ad.xiaohongshu.com/openApiDoc?articleId=3047
- https://open.xiaohongshu.com/document/developer/file/4

Before implementing the real transport, obtain a verified API/tool contract and
its permitted account/recipient scope. In particular establish whether it allows
first contact to a collected comment author or only replies to existing inbound
conversations. Lead-export or ad-report APIs are not send APIs. Do not invent
endpoints, obtain cookies/tokens through reverse engineering, or merely set the
COMMENT sender's capability to true for DM. New provider credentials/OAuth require
separate user approval; do not ask for secrets in chat.

Remaining release work: real conversation binding and recipient verification;
DM-specific platform eligibility and rate limits; reviewed send and message-ID
receipt/readback mapping; durable explicit scope/preview confirmation and atomic
shared quota/recipient reservations; single-use dispatch with UNKNOWN on uncertain
submission and no retry; DM-only manual and automatic queue/records integration;
post-preview revalidation and per-recipient final content binding. Inbox/replies/
read indicators require distinct verified provider capabilities. Do not alter or
convert existing comment jobs. Existing source field values alone grant nothing.

After isolated tests, a real acceptance requires explicit sender account,
recipient, content, and one-message authorization. Until then production DM sends
stay unavailable. Deployment or restart of the shared worker must wait for a
verified safe window and cannot advance existing jobs as a side effect.

## Validation

`npm run test -w @crm/api` includes preparation and HTTP boundary tests. All data
in the new tests are synthetic and the database fixture offers only read methods.
They test capability denial, exact binding, stale versions, input injection,
admin/CSRF, missing variables, no-contact/exclusion/risk/quota, cross-channel
UNKNOWN, self-contact, and absence of send endpoints. These tests are not a real
platform or persistent queue acceptance.
