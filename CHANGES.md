# GitHub-main quality refactor

Started from GitHub main 1c14ec237f2ce9632da78fa11b9913d97fad341e (release/0021) in a clean clone, not either existing local checkout. Merged 899c8ba (release/0022) published during the task, preserving the world links, Economy event hit targets, tests and release records. TV_REF remained read-only; no proprietary implementation or assets were copied.

## What changed

- Saved AUDIT.md before application edits: reviewed priorities plus 886 matching-line inventory entries. No embedded application credential found. DESIGN_TOKENS.md records palette, type/spacing/shape, component states, layers, behavior and evidence gaps.
- css/tv.css is the theme source: 66 measurement primitives and four weights with source file+selector citations, named local layers, existing light/dark palette and sourced AA text shades. Removed overridden legacy palette declarations. Four active TV stylesheets consume that scale; existing desktop terminal geometry matches the initial app exactly.
- Normal up/down/warning/offer text is separated from graph colors. Primary/secondary/placeholder, link and status text tokens meet 4.5:1 on base, hover, popup and selected backgrounds in light/dark; rendered heatmap labels also pass; candle/series/heatmap fill colors retain their identity. Fields retain visible keyboard focus, disabled buttons avoid hover feedback, nonessential motion yields to prefers-reduced-motion.
- Fixed Markets' 320px horizontal overflow: the header's asset picker yields width while keeping primary actions. No control was removed.
- js/config.js provides strict checked-JavaScript public settings, safe defaults and validation for HTTPS API base, cache/refresh/download/announcement durations, default world, ranges and stale threshold. js/public-config.js contains public overrides only; tools/write_public_config.mjs emits a validated env whitelist atomically. .env.example documents the optional static-hosting bridge, and env files are ignored. Default behavior and data meanings are unchanged.
- Canvas modules share js/theme.js token access; overview series use the same CSS colors. TIB formatting reuses one Intl formatter and derives minimum movement from its fixed five-digit asset precision. The overview uses that same formatter.
- Economy period segmentation now uses linear work while preserving zeroes, gaps, whitespace and order. A 500-row reproduction exceeded 42,000 indexed reads before the fix; the linear-work test now passes.
- Page lifetime clears online polling, clock/replay timers and temporary popup outside-click handlers; cached page restores resume each periodic task once. Removed the unnecessary delayed listener registration that could reattach a closed popup's handler.
- Added pinned development-only ESLint/TypeScript tooling and CI gates. Normal static serving remains dependency/build-free. npm run build invokes the existing integrity/deterministic-builder checks without modifying datasets.
- Refreshed changed stylesheet/module URLs together, keeping page/export chart imports at one version.
- Repaired a stale forecast-history browser assertion: unchanged GitHub main failed 994 vs 832 after an earlier richer-export feature. The test now isolates forecast-note height from the shared title/details/footer band; no export content is removed.

## Verification

- npm run lint: pass (browser JS correctness plus new tool/tests; intentionally not a wholesale formatting or unused-code migration).
- npm run typecheck: pass, strict checkJs/noEmit for public configuration and theme access. Existing UI/chart modules remain untyped; no new any was introduced.
- npm run build: all nine integrity gates pass, including 237 unit tests, deterministic builders, archive integrity and all local references.
- 17 affected Chrome browser suites pass: Markets, Economy, Trade, site header, tables, Statistics, Events, Events panel, Projections, forecast history, Screener, TIB, global, canonical events, overviews, TV terminal and quality guards.
- After upstream integration and asset refresh, reran Economy, overviews, TV terminal and quality guards in Chrome and WebKit. These cover arithmetic/state/keyboard/export behavior plus six pages in light/dark at 1440/768/390/320, core text and heatmap contrast, field focus, reduced motion, public endpoint/world/range overrides, and pagehide/pageshow timer cleanup.
- Terminal tests exercise drawing/moving/restyling/undo/redo, search, indicators/templates, scale modes, replay, persisted theme and chart-image background pixels. Overview tests trace figures to committed data and exercise cards, heatmaps, tables and search.
- npm audit: zero reported vulnerabilities. Release verifier: chain/tags/digests consistent. git diff --check: pass. Published datasets, numerical research outputs and immutable ledgers are unchanged by the refactor.

Screenshots are local QA evidence outside the repository: /tmp/tibinance-quality-final-shots/ contains Chrome/WebKit desktop/mobile light/dark captures. Compared with TV_REF captures/B_chart/screenshot.png and captures/A_markets design evidence: panel hierarchy, density, font stack and neutral surfaces are retained. Intentional differences: Tibia-specific content, existing APP layout fit thresholds/rows, darker normal text and black/white heatmap labels for accessibility; no TradingView branding or account/broker features are added.

## Remaining TODOs and risks

- Existing responsive thresholds remain literal in CSS media/container conditions: native CSS custom properties cannot substitute there. APP-specific layout/stacking/compound-shadow/grid-alpha measurements lack exact TV component-equivalent evidence and are marked TODO(design): no TV reference. Do not claim these are exact TradingView values.
- Meaningful domain constants (UTC/server calendars, OCR geometry, asset contract/pool identity, Fibonacci levels, heatmap thresholds, dataset schemas, statistical rules) remain explicit. No data reinterpretation or model rebuild was performed.
- Standalone ingestion/research tools retain their own named provider/source constants; they are not browser runtime settings. Frozen data, fixtures, source packages and historical release artifacts were not mechanically rewritten.
- No i18n system exists: UI copy remains unchanged. Full strict typing of the legacy application is a separate migration; the new configuration boundary and theme helper are checked now.
- Real-image OCR and numerical research reproduction were not rerun: extraction/math code and source data were not changed. Existing browser fixtures cover Capture/Statistics/storage behavior. No full WCAG certification or exhaustive third-party news-content audit is claimed.
- Invalid deployment overrides are rejected before replacing the previous public module. All emitted settings are public; deployment credentials must stay outside that whitelist.
- This task updates GitHub main. It does not create a production release or change the approved live artifact; the upstream release/0022 record remains intact.

## Reviewable commit split

1. Audit and design evidence (da37593).
2. Shared theme measurements, states and accessibility (6f04a6f).
3. Public config, defaults, env bridge and consumers (ef1121b).
4. Chart performance/precision/lifecycle, tests and development/CI gates (f3556ec).
5. Non-destructive upstream integration (54c9038), followed by overview palette reuse, refreshed asset URLs, final contrast checks and delivery documentation.

PROGRESS.md keeps the resumable task checklist above the historical project ledger.
