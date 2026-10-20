# Design QA — Spatial Lead Space

Status: passed for local simulated delivery (2026-10-20). No claim of pixel-identical reproduction or real platform readiness.

## Reference and comparison

Approved reference: Library `libfile_86de135e430c81918466d8eda22fe573`, downloaded as `approved-final.png` (1920×819 double-panel board). It was actually viewed, then viewed in the same comparison input with `overview-desktop.jpg` and `expanded-desktop.jpg`. The board's overview and expanded sections were assessed separately against their corresponding real states. Real screenshots use 1440×900; mobile uses390×844. Differences in aspect ratio are intentional and documented rather than concealed by stretching.

## Five surfaces

| Surface | Result | Evidence / deliberate difference |
|---|---|---|
| Typography | Pass | Gold focal title, understated functional labels; real comments use legible compact text rather than invented large demo captions. No01/02 concept annotations. |
| Layout | Pass | No fixed sidebar. Central core with five orbiting modules; expanded core left, arc modules, three current-page cards and inline source panel. Mobile converts to module strip and single-column flow. |
| Colors | Pass | Dark starfield, champagne action color, blue/gold/purple/pink/green module hues, purple selected connector, translucent dark panels. |
| Assets | Pass | New generated starfield/lunar horizon, transparent gold planet and transparent ribbon halo. No third-party reference-project source/assets copied. Original texture details differ from concept. |
| Copy | Pass | “管理评论与私信模板”; simulation, rule matching, no automatic sending and no contact consent inference clearly stated. Real fixture identities replace concept's imaginary avatar photos. |

## Findings and repairs

1. P1: legacy `button:active { transform:none!important }` moved positioned modules on pointer-down, preventing reliable clicks. Scoped spatial transform restored; mouse and Enter retested.
2. P1: disabled administrator config query stayed pending for sales and incorrectly disabled sales CTA. Pending guard limited to admins; sales CTA now opens handed-over contacts. Retested with sales B.
3. P2: fixed connector geometry missed one-row/last-page targets. SVG now measures the active module and actual current-page card centers using ResizeObserver; selected line remains tied to stable ID.
4. P2: narrow detail height created outer page scrolling. Height adjusted; observed document390×844 in390×844viewport, with independent detail scroll.
5. P2: bright lunar horizon reduced pagination/label contrast. Dark translucent pagination backing, label shadows and slightly higher lower modules applied.
6. P2: inherited cyan CTA and bright loading skeleton conflicted with chosen palette. Champagne buttons and dark skeleton applied.
7. P2: focused noninteractive detail title showed an oversized border. Kept programmatic focus for accessibility but removed the decorative title outline; interactive focus rings remain.
8. P2: switching to anomaly run lost selected config due to two competing URL updates. Module and config now update atomically.

## Interaction evidence

Configuration→baseline6leads/0notices→new snapshot3newleads/3notices→source and nested reply→mark awaiting contact→fictional manual contact record→assign sales A→save follow-up→batch transfer sales B. Sales A subsequently sees “线索不存在或无权访问”; sales B sees assigned detail and no administrator assignment control. Template preview substitutes source fields and does not send. Pagination, reminder deep link, Esc/focus return and reduced motion (0s transition) verified.

All111 existing unit/database/queue regressions pass; full typecheck/build pass. Final frontend type/build repeated after visual fixes. Browser screenshots are in `docs/evidence/spatial-2026-10-20/`.

## Remaining differences / limitations

- Reference is a wide concept board; operational app retains filters, errors, source records and scrollable follow-up forms rather than hiding them for appearance.
- Photos in the concept are replaced by text avatars for fictional fixture identities. No fabricated AI analysis, real customer data or external sending.
- Decorative PNG assets total about5MB; first uncached load is larger than the former plain dashboard. No new animation library, Canvas renderer, physics simulation or automatic motion loop.
- This validates local simulated workflows. Real adapter authorization and live-platform behavior remain outside scope.

No unresolved P0/P1/P2 visual or interaction blocker at delivery. Browser security tests cover only fixture accounts; backend regressions retain existing access control checks.
