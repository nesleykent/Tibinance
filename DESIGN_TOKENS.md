# Design tokens from TV_REF

APP baseline: GitHub main 1c14ec2. TV_REF is read-only. The APP already implements the TV palette/theme and terminal/overview layout in css/tv.css and its companion stylesheets. Preserve those designs; this refactor consolidates their values. Extract values and patterns only, never proprietary code or font assets.

Paths below are relative to /Users/nesleykent/Code/TradingView. Primary evidence: REPORT.md; captures/B_chart_design/design_tokens_runtime.json; captures/A_markets_design/design_tokens_runtime.json; captures/B_chart_design/css/; evidence/C_theme_canvas_colors.json; evidence/B_hotkeys.json. Both runtime captures are light despite prefersDark=true. Dark values come from explicit theme-dark declarations, not inversion.

## Palette / themes

Source P = captures/B_chart_design/css/234_92522.1a30587591c7b18e3a24.css, :root / :root.theme-dark. R = captures/B_chart_design/design_tokens_runtime.json, vars. Every existing --tv-gray/red/green/blue/orange primitive maps to the corresponding P/R --color-cold-gray/ripe-red/minty-green/tv-blue/tan-orange ramp. Additional purple/deep-purple/pink/cyan/lime/yellow use grapes-purple/deep-blue/berry-pink/sky-blue/iguana-green/ripe-yellow ramps. css/tv.css declarations cite their exact variable or mark an evidence gap.

| Role | Light | Dark | Source |
| --- | --- | --- | --- |
| background | #fff | #000 | P --color-body-bg |
| chart pane | #fff | #0f0f0f | P --color-pane-bg; evidence/C_theme_canvas_colors.json fillRect |
| popup/surface | #fff | #1f1f1f | P --color-bg-primary |
| hover | #f2f2f2 | #2e2e2e | P --color-bg-primary-hover |
| border | #ebebeb | #3d3d3d | P --color-border |
| strong border | #c9c9c9 | #575757 | P --color-border-hover |
| text | #0f0f0f | #dbdbdb | P --color-text-primary |
| secondary / disabled | #707070 / #b8b8b8 | #8c8c8c / #575757 | P --color-text-secondary / --color-text-disabled |
| brand / focus | #2962ff | #2962ff | R --color-tv-blue-500 |
| up/down graph | #089981 / #f23645 | same | evidence/C_theme_canvas_colors.json pane fillRect |
| up/down text | #056656 / #b22833 | #42bda8 / #f77c80 | R --color-minty-green-700 / --color-ripe-red-700; green-300 / red-300. Adaptation for AA, separate from graphic colors |
| warning text | #8c541c | #ffb74d | R --color-tan-orange-a700 / --color-tan-orange-300 |
| tooltip | #2e2e2e | #3d3d3d | P --color-tooltip-bg |

## Numeric scale

The table extracts measurement primitives. A selector establishes a measured value, not that a differently named APP component has the same role. APP component/layout assignments are retained; missing measurements are explicitly marked TODO. No fixed layout or viewport values change in the mechanical migration.

| Token | Value | Source file + selector / property |
| --- | --- | --- |
| `--tv-size-1` | 1px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-input` / `border` |
| `--tv-size-1_5` | 1.5px | captures/B_chart_design/css/047_72689.93a06fc3186a1f3f7e6b.css `.estimate-fygOwDCL` / `outline` |
| `--tv-size-2` | 2px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-row` / `border-bottom` |
| `--tv-size-2_5` | 2.5px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-3` | 3px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-icon-sort` / `margin-left` |
| `--tv-size-4` | 4px | captures/B_chart_design/css/002_106.4d908074e220a0a4f285.css `.content-T7cdv1gs.small-T7cdv1gs` / `gap` |
| `--tv-size-5` | 5px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-icon-group-arrow` / `margin-right` |
| `--tv-size-6` | 6px | captures/B_chart_design/css/002_106.4d908074e220a0a4f285.css `.range-T7cdv1gs.small-T7cdv1gs` / `height` |
| `--tv-size-7` | 7px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-drag-over-row` / `box-shadow` |
| `--tv-size-8` | 8px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-cell` / `padding` |
| `--tv-size-10` | 10px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-icon` / `font-size` |
| `--tv-size-11` | 11px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.label-Ab1bR7Gq` / `font-size` |
| `--tv-size-12` | 12px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-validation-message` / `font-size` |
| `--tv-size-13` | 13px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.shortcuts-kReVM2Bx,.shortcuts-kReVM2Bx .buttonGroup-kReVM2Bx` / `margin-inline-end` |
| `--tv-size-14` | 14px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka` / `font-size` |
| `--tv-size-15` | 15px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-thead-cell` / `padding` |
| `--tv-size-16` | 16px | captures/B_chart_design/css/002_106.4d908074e220a0a4f285.css `.title-T7cdv1gs.small-T7cdv1gs` / `--ui-lib-typography-line-height` |
| `--tv-size-17` | 17px | captures/B_chart_design/css/018_54295.6aa607a1b91640415b1b.css `.closeButtonWrapper-VCG5FydF.mobile-VCG5FydF` / `inset-inline-end` |
| `--tv-size-18` | 18px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-paging-page-index,.ka-paging-size` / `min-width` |
| `--tv-size-20` | 20px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-thead-cell` / `padding` |
| `--tv-size-22` | 22px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.shortcuts-kReVM2Bx .buttonGroup-kReVM2Bx .button-kReVM2Bx.withIcon-kReVM2Bx` / `height` |
| `--tv-size-24` | 24px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.item-EGIzBROd` / `--ui-lib-typography-line-height` |
| `--tv-size-26` | 26px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.flagWrap-ql4iq1lU` / `height` |
| `--tv-size-28` | 28px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.handle-ulEgLB3r` / `width` |
| `--tv-size-30` | 30px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.separator-Ab1bR7Gq` / `height` |
| `--tv-size-32` | 32px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.symbol-ALH_8bJI .upgradeAccessTileItem-ALH_8bJI` / `margin-inline-end` |
| `--tv-size-34` | 34px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.button-CBjOwjj0` / `height` |
| `--tv-size-36` | 36px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.description-_pwluNeI` / `max-height` |
| `--tv-size-38` | 38px | captures/B_chart_design/css/004_54339.607095526612119b0f4a.css `.wrap-xBDgWlXR` / `height` |
| `--tv-size-40` | 40px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-empty-cell` / `min-width` |
| `--tv-size-44` | 44px | captures/B_chart_design/css/056_41998.1f41c43bccc40961b740.css `.button-SEyQozUN` / `height` |
| `--tv-size-45` | 45px | captures/B_chart_design/css/237_47360.5dbabc4194e8938c9f41.css `.widgetbar-tabs` / `width` |
| `--tv-size-46` | 46px | captures/B_chart_design/css/080_3415.d368caa64d494a4087cc.css `.tv-button--icon.tv-button--size_large` / `height` |
| `--tv-size-52` | 52px | captures/B_chart_design/css/084_22630.2ead71b05ae3c9f09367.css `.control-FuKse5bD` / `width` |
| `--tv-size-56` | 56px | captures/B_chart_design/css/034_80547.f5113b405d05229bb4e9.css `.roundButton-LEXhwY2Z` / `height` |
| `--tv-size-64` | 64px | captures/B_chart_design/css/082_84942.2948977f955c31dc3f3c.css `.content-B562enCp` / `max-height` |
| `--tv-size-68` | 68px | captures/B_chart_design/css/060_9402.ace32ea52a70f78f348e.css `.input-SYCRNWvr` / `width` |
| `--tv-size-78` | 78px | captures/B_chart_design/css/138_59937.fc69e6c020c645aa7877.css `.chartPreview-b3x6mvDB` / `height` |
| `--tv-size-88` | 88px | captures/B_chart_design/css/085_8395.ddb660da41bcb62d7de8.css `:root,[data-query-type=container]>*` / `--v-rhythm-spacing-2-tablet` |
| `--tv-size-96` | 96px | captures/B_chart_design/css/206_61330.e3d01616e79520a0d5bd.css `.title-W3vB3mvu` / `max-height` |
| `--tv-size-100` | 100px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-no-data-row` / `height` |
| `--tv-size-120` | 120px | captures/B_chart_design/css/080_3415.d368caa64d494a4087cc.css `.tv-button--size_promo` / `border-radius` |
| `--tv-size-132` | 132px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-150` | 150px | captures/B_chart_design/css/032_65088.b1bc6e7e9aba8544214c.css `.date-NrJ8eKrr` / `max-width` |
| `--tv-size-160` | 160px | captures/B_chart_design/css/082_84942.2948977f955c31dc3f3c.css `.container-D2IvuoE0` / `--strategy-chart-height` |
| `--tv-size-180` | 180px | captures/B_chart_design/css/003_49855.69a6187d3b29677c26ee.css `.menu-xQ2p3_Wq` / `min-width` |
| `--tv-size-200` | 200px | captures/B_chart_design/css/001_49206.74fb425b6024ec62b4e0.css `.ka-validation-message` / `max-width` |
| `--tv-size-220` | 220px | captures/B_chart_design/css/062_2896.037042a9c19751bc73d5.css `.container-medium-F50gnfeY` / `width` |
| `--tv-size-240` | 240px | captures/B_chart_design/css/151_92088.518a2703fb06972945bc.css `.popover-UIr5vnnJ` / `--ui-lib-in-positioner-minWidth` |
| `--tv-size-243` | 243px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-260` | 260px | captures/B_chart_design/css/118_86605.a5eaeb30f7d269f97b41.css `.drawer-iii118oN.positionLeft-iii118oN` / `min-width` |
| `--tv-size-300` | 300px | captures/B_chart_design/css/232_38487.3e59d7e7a204088e5b81.css `@media (min-width:568px){.middleSlot-D3CWQ49D` / `max-width` |
| `--tv-size-340` | 340px | captures/B_chart_design/css/078_97625.b024707d2d5296921dc0.css `.menu-OjWQ1m5F` / `max-width` |
| `--tv-size-360` | 360px | captures/B_chart_design/css/183_98830.d0b51ff6cc34a7d177ff.css `.description-e3xz1aVr` / `max-height` |
| `--tv-size-380` | 380px | captures/B_chart_design/css/045_4924.89efd23a089fdd5c799c.css `.popupWidgetWidth-OjNGlYa7` / `--ui-lib-in-positioner-maxWidth` |
| `--tv-size-420` | 420px | captures/B_chart_design/css/109_11709.bcd0312befc95fb040a8.css `.common-tooltip__body--with-hotkey-Hp4KzOJw` / `max-width` |
| `--tv-size-440` | 440px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-520` | 520px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-560` | 560px | captures/B_chart_design/css/079_37406.9dfbe1b31180e1a0a43c.css `.tabletDialog-Y08MXaH6` / `max-width` |
| `--tv-size-620` | 620px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-640` | 640px | captures/B_chart_design/css/079_37406.9dfbe1b31180e1a0a43c.css `@media (max-width:768px){.desktopDialog-Y08MXaH6` / `max-width` |
| `--tv-size-720` | 720px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-760` | 760px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-860` | 860px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-880` | 880px | TODO(design): no TV reference; existing APP dimension retained |
| `--tv-size-1440` | 1440px | TODO(design): no TV reference; existing APP dimension retained |

## Components, elevation and behavior

- Toolbar/buttons/tabs: captures/B_chart_design/css/142_26129.009764da61bd8c8c44be.css `.squareTabButton-RKKTRhZ6.xsmall-RKKTRhZ6` (28px, 6px radius, 8px inline padding), `.small-RKKTRhZ6` (34px, 12px padding), selected 600/regular 400; hover/active/disabled read P semantic variables. Existing APP 30px watchlist rows and 38px toolbar are retained, with their measurement provenance in the table.
- Inputs/dropdowns/focus: P --color-input-bg, --color-border-hover, --color-text-disabled. captures/B_chart_design/css/068_94186.b336cd117bc17ca17c02.css `.segmentedControlBase-Wsyc2cnT:after` has a 2px focus border with 4px expansion. APP uses native visible outlines and retains keyboard/focus-return semantics.
- Font: runtime bodyFont and captures/B_chart_design/css/109_11709.bcd0312befc95fb040a8.css `.common-tooltip-Hp4KzOJw` system family, 13px/18px, weight 400. No proprietary font is copied. Measured text sizes and line heights appear in the numeric table. Research's reading scale remains unchanged.
- Spacing/radii: captured 2/4/6/8/12/16/24/32px measures; small 6px control radius, 8px dialog/standard radius, 2px tooltip radius. Existing APP roles retained rather than blanket restyling.
- Shadows: P --color-shadow-primary-neutral-extra-heavy is #0003 (light), #0006 (dark); captures/B_chart_design/css/044_31368.4b96b35b4d20b7dae904.css `.popupStyle-jzF6AlM1` uses 0 2px 4px. APP compound popup shadows lack exact equivalent; retained with TODO rather than claimed as exact.
- Layers: tooltip CSS above uses z-index 1000; chart canvas/library layers and APP toolbar/popover/modal/toast scopes differ. Preserve named local order and mark APP-specific z-index values TODO; native dialogs/popovers occupy the top layer.
- Tables/lists: captures/B_chart_design/css/022_3941.e2495691cea17b3a81c2.css `.child-CGdjKa9Y` 28px list row; css/195_27335.e4b46cf5852f5bf1e18c.css `.menuItem-hK2snT3G` 32px and 16px inline padding. APP watchlist/table densities stay unchanged.
- Scrollbars: css/202_49050.2927a177231fdd0e24c1.css `.scrollWrap-lBIxIwtz::-webkit-scrollbar` 5px and thumb radius 3px. APP keeps native thin scrollbars using semantic border colors; no platform scrollbar is forced.
- Motion: tooltip source above `.common-tooltip-Hp4KzOJw` transition opacity .15s linear. APP toggle/chevron timing adopts that measured primitive; global reduced-motion handling suppresses nonessential animation/transition.
- Keyboard/focus: evidence/B_hotkeys.json and REPORT.md document TV hotkeys. APP retains its established Mod+K search, Escape close, arrows, Enter/Space, focus return, replay and drawing shortcuts; this refactor adds no new command bindings.
- Loading/empty/error: retain existing status/live-region/aria-busy, retry affordances and explicit unavailable values. Capture data has no evidenced generic timing contract; polling and retry limits belong to public config, not design tokens.

## Gaps

No TV source proves APP world/asset default choices, data units, OCR thresholds, Fibonacci/domain formulas, SVG coordinates, viewport fit thresholds, news image constraints, chart scale fractions or exported report geometry. Preserve these meanings; do not replace them with arbitrary theme values. Breakpoint literals stay in media/container conditions because native CSS var() is invalid there; annotate them TODO(design): no TV reference. Primitive occurrences inside SVG data URLs are image geometry, not CSS declarations.

## Applied contract and remaining differences

The implemented shared source is css/tv.css: 66 measured length primitives, weights 400/500/600/700, named local layers, source-cited palette primitives, text/graph color separation and motion. css/app.css and css/markets.css no longer repeat overridden publication palette defaults. js/theme.js supplies canvas consumers; overview series take the same primitives rather than independent hex colors.

Normal and secondary/placeholder text, links, active labels and status text use sourced shades that also pass AA on hover and selected surfaces; heatmap text uses captured black/white according to its existing ramp/missing state to meet AA. This is an intentional accessibility adaptation from TV's white labels. All finite seven-step heatmap fills exceed 4.5:1 with black; the unavailable gray uses white. The APP's gaps, toolbar lengths, row density, component roles and article reading scale retain their previous measurements. The app-specific 320px asset picker may shrink; no tools are removed.

Retained gaps are marked TODO in CSS: APP local stacking, responsive fit thresholds, compound popup shadows, grid/tint alpha and publication layout ratios. Values in SVG paths, chart geometry and immutable drawing defaults remain meaningful geometry/domain constants, not unsourced new design tokens. No new toast/modal system or keyboard bindings were introduced.

AA surface adaptation: captured secondary semantic defaults are #707070 / #8c8c8c, but they fall short on hover/selected fills. APP secondary/placeholder ink uses runtime --color-cold-gray-650 (#575757) in light and --color-cold-gray-400 (#9c9c9c) in dark. Negative text uses --color-ripe-red-800 (#991f29), warning --color-tan-orange-a800 (#593a1b), light links/active text --color-tv-blue-700 (#1848cc), hover --color-tv-blue-800 (#143eb2); dark active/hover labels use --color-tv-blue-200 (#90bff9). These are existing captured ramp values, explicitly adapted for 4.5:1 across base, hover, popup and selected backgrounds; graphic fills retain their original values.


## Phase 14 component contracts applied on 2026-10-15

This section supersedes older preserved popup-shadow/dialog-radius/heading gaps above. Reference REPORT.md §26; paths relative to TV_REF. Tokens remain in css/tv.css, implementations in css/tv-components.css and js/tv-ui.js.

| Contract/token | Value | Verified source |
| --- | --- | --- |
| --tv-radius-popup / --tv-popup-shadow | 6px; 0 2px 4px, black .2 light/.4 dark | captures/B_chart_design/css/202_49050.2927a177231fdd0e24c1.css .menuWrap-lBIxIwtz; --color-shadow-primary-neutral-extra-heavy |
| --tv-layer-popup / --tv-layer-dialog / --tv-layer-tooltip | 100 / 150 / 1000 | same menu CSS; css/161_88550.ed76caf2ffe014460ba6.css .dialog-GHUH6_1X; css/109_11709.bcd0312befc95fb040a8.css .common-tooltip-Hp4KzOJw |
| --tv-dialog-width / --tv-dialog-height | 840px / 680px; tablet max640; phone fullscreen | css/268_34640.acb9f1151f07184a6ed6.css .desktopDialog-miP9eTAe; L_symbol_dialog.json / L_phone_symbol_dialog.json |
| --tv-menu-row / neutral selection | 40px; light gray800/white; dark gray200/gray900 | L_menu_focus_verified.json .button-XNUivTou / css/022_3941.e2495691cea17b3a81c2.css selected background/text roles |
| Popup icon bounds | 18px, constrained flex child | css/066_59830.736f471a8d64a8122fd8.css .iconWrapper-GZLykNQP small variant; L_chart_type_menu.json .icon-GZLykNQP |
| Search tabs / --tv-tab-padding | 28px high / radius14 / padding11; 14/18 weight400 | css/243_33838.70b5126495f7adccaf2f.css .roundTabButton-Wa6TmGN3.xsmall-Wa6TmGN3 |
| Tooltip | 13/18, padding3×8, radius2, max420, .15s linear | css/109_11709.bcd0312befc95fb040a8.css .common-tooltip-Hp4KzOJw and body modifiers |
| Hero / --tv-heading-size / --tv-heading-line | 600, desktop48/52, phone32/36, tracking -.02em | captures/A_markets_design/css/001_51889.659a35c515aee892d8b2.css .header-q4dkGMX6; L_desktop_light.json / L_phone.json |
| Section / --tv-section-size / --tv-section-line | 600, desktop36/44, phone28/36 | css/286_98158.4628d48ffa24449c8154.css .title-l-QjjAoTcT |
| Visible keyboard focus | 2px blue500 | chart css/022_3941.e2495691cea17b3a81c2.css .button-XNUivTou:focus-visible::after; APP uses native outline |

Desktop hero uses the expanded-widgetbar measurement, not the 56px unconstrained TV variant. System font is an intentional licensed-safe adaptation. Captured watchlist rect31 includes borders around content29; APP's existing30px domain table is retained, not mislabeled as exact TV geometry. Native dialogs/popovers occupy the browser top layer, so numeric layers only apply within compatible stacking contexts. No source supports a universal APP toast layer.
