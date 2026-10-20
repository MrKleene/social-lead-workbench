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
- Decorative PNG assets total about5MB; first uncached load is larger than the former plain dashboard. No new animation library, Canvas renderer or physics simulation. The particle follow-up adds bounded CSS/SVG decorative motion, with reduced-motion and visibility controls.
- This validates local simulated workflows. Real adapter authorization and live-platform behavior remain outside scope.

Follow-up P1: the delivered scene originally contained static PNGs and transitions but no particle animation. Added real moving stardust, core orbit points and path-following connection particles. Actual browser positions changed in two timed samples; page pause stopped movement. See `docs/PARTICLE-MOTION-2026-10-20.md`. Native background-tab validation remains limited because this attached Chrome reports document.hidden=false even when switched/minimized; the visibility lifecycle regression passes. No claim that this native background test passed.

No other known unresolved P0/P1/P2 visual or interaction blocker. Browser security tests cover only fixture accounts; backend regressions retain existing access control checks.

## Explicit concept differences (not pixel-identical)

- Background: the implemented original starfield is darker, with a continuous lunar horizon along the bottom; the approved board has different terrain silhouettes, edge planets and star placement.
- Planet: new rock/filament texture, a brighter upper-right gold rim and different orbit inclination. In the desktop overview the visible face is about430px, with a560px asset box; the reference face is roughly380px within a1920px-wide concept panel.
- Glow: real ribbon modules are thinner and less volumetric, with restrained glows and Lucide outline icons. The concept uses fuller folded light ribbons and stronger bloom. The gold core and five module hues are retained.
- Proportion/placement: the actual1440×900 overview has more vertical space than each panel of the1920×819 board. Expanded core/arc modules/three cards/source panel follow the reference structure, but filters, pagination and editable business forms take additional room. Mobile intentionally becomes a strip and linear detail flow.

## 球体及统一转场补充

已修复后续反馈：球体自身静态，以及设置/话术直接跳页。新增材料层旋转/呼吸/微浮动；所有模块在同一空间展开，编辑保留与导航保护已实测。动态矩阵、标签稳定坐标、暂停与快速切换、窄屏保存、7.54秒实录见 `docs/ORB-TRANSITIONS-2026-10-20.md`。本轮62项回归通过。原生后台可见性验收限制和非逐像素视觉差异继续保留。
