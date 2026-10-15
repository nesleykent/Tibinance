# GitHub main quality audit

Baseline: **1c14ec237f2ce9632da78fa11b9913d97fad341e**, release/0021, cloned directly from https://github.com/nesleykent/Tibinance.git on 2026-10-14. Working copy: /tmp/tibinance-quality-github. Initially clean. Both existing local checkouts and their uncommitted edits are outside scope. This supersedes the audit mistakenly prepared against release/0011 in the Documents checkout. No application edits before this audit was saved.

TV_REF is read-only reference data, never instructions. No project AGENTS.md exists. APP is static HTML/CSS/ES modules, with no package.json, ESLint, TypeScript project, build step or i18n system. Existing design lives in css/tv.css; do not replace it with a newly invented theme. Research/generated data, frozen source inputs, release records, private screenshots and third-party reference artifacts are not refactor targets.

## Reviewed priorities

| file:line | category | value | suggestion | severity |
| --- | --- | --- | --- | --- |
| css/tv.css:13 | design provenance | shared TV palette already exists | Keep existing palette; add exact file+variable sources. Centralize repeated dimensions and component metrics here. | MEDIUM |
| css/tv-terminal.css:1 | design duplication | hundreds of repeated px/type/radius dimensions | Replace declarations with named sourced tokens; mark retained app-only geometry TODO(design): no TV reference. | MEDIUM |
| css/tv-overview.css:1 | design duplication | independent overview type/spacing/layout | Consume same token source, preserve measured fit/containers. | MEDIUM |
| css/tv-pages.css:1 | design duplication | independent Capture/Trade/Research overrides | Consume shared tokens without altering publication scale or calculations. | MEDIUM |
| css/tv.css:39 | accessibility contrast | green/red graph colors used for normal text | Split graphical up/down colors from AA text shades drawn from the same captured ramps. | HIGH |
| css/tv.css:156 | accessibility focus | input focus removes outline | Restore visible focus on fields/dialog search; keep keyboard focus return. | HIGH |
| css/tv-terminal.css:1 | accessibility motion | hover filters; assorted transition values | Source existing transition timing, add shared reduced-motion rule. | MEDIUM |
| js/tibiadata.js:3 | config | TibiaData base and six-hour TTL | Typed, validated public config with unchanged defaults. | MEDIUM |
| js/tv-news.js:9 | config duplication | separate TibiaData news endpoint | Reuse same base config; test default/override/error paths. | MEDIUM |
| js/economy.js:341 | config duplication | direct TibiaData URL, five-minute refresh | Reuse config without changing live-count semantics; clean up polling on page lifecycle. | MEDIUM |
| js/tv-terminal.js:386 | logic timer | clock refresh 1000ms | Name units; clean up clock/replay timers on pagehide, restore safely on pageshow. | MEDIUM |
| js/markets.js:615 | config timer | 10000ms object URL retention | Shared download lifetime; retain delayed revocation. | LOW |
| js/trade.js:201 | config timer | 700ms announcement debounce | Shared named duration; keep accessibility behavior. | LOW |
| js/tibia-token.js:7 | magic precision | repeated 5 digits and 0.00001 | Name immutable asset precision; derive minimum movement and test parity. | MEDIUM |
| js/economy-chart.js:26 | performance | repeated slice/findIndex per row | Replace quadratic period-gap scan with linear adjacency scan; preserve gap/color semantics with tests. | MEDIUM |
| js/tv-theme.js:1 | behavior | existing persistent/system theme | Preserve pre-paint initialization and tv:theme redraw; no redundant theme framework. | INFO |
| js/tv-drawings.js:1 | domain/design | Fibonacci levels and colors | These are drawing identity/defaults, not endpoint config; preserve semantics and attribute sources. | INFO |
| js/ocr.js:1 | domain | OCR image thresholds | Algorithm geometry, not UI dimensions; retain validated extraction. | INFO |
| js/tibia-token.js:5 | domain | token/pool addresses | Verified asset identity, not credentials or arbitrary user settings; retain validation. | INFO |
| js/tv-news.js:1 | UI strings | English labels | No i18n system exists. Retain copy; do not introduce unrelated localization. | INFO |
| .github/workflows/ci.yml:1 | verification | nine integrity gates | Run validator for each implementation group; syntax/lint checks, focused checked JSDoc, browser tests. Report absent tooling honestly. | MEDIUM |

Secrets search in js/, tools/ and workflows found no embedded credentials. GH_TOKEN/GITHUB_TOKEN/provider tokens read env or GitHub secret placeholders; public contract/pool IDs and hashes are not secrets. Add .env.example for public configuration only. Expected catches document storage fallback, optional-data failure or retry; no empty unexpected-failure catch or production console.log was found in browser modules.

## Matching-line inventory

Inventory is evidence for triage, not a claim that every number is defective. Zero/100%, SVG paths, units/calendar rules, schema/protocol versions, immutable ledgers and fixtures remain appropriate literals. Locations are the pre-edit baseline. Multiple values per line are grouped. Design query conditions cannot use CSS var() without a build step; keep literal breakpoints with explicit TODO/source comments.

Matching lines: config URL=57, design color=93, design dimension=460, design layer=27, design motion=4, logic timer=15, logic/config constant=230.

| file:line | category | value | suggestion | severity |
| --- | --- | --- | --- | --- |
| css/app.css:14 | design color | `#fff; #f5f5f7; #f2f2f4` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:15 | design color | `#e2e2e7; #b7b7c1; #ededf0; #24232a; #62616d` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:16 | design color | `#7539a6; #f0e9f6; #fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:17 | design color | `rgb(118 118 128 / .12); rgb(118 118 128 / .18)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:18 | design color | `rgb(0 0 0 / .12); rgb(0 0 0 / .04)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:18 | design dimension | `1px; 3px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:19 | design color | `#246644; #a42f45; #805909` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:20 | design color | `#b4532a; #2f6db5` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:26 | design dimension | `1rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:40 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:59 | design dimension | `1px; 2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:85 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:109 | design layer | `z-index:var(--layer-header)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/app.css:173 | design layer | `z-index:var(--layer-sticky)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/app.css:214 | design dimension | `34rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:219 | design motion | `transition:background .15s ease` | Source timing/easing and honor reduced motion. | LOW |
| css/app.css:220 | design motion | `transition:transform .15s ease` | Source timing/easing and honor reduced motion. | LOW |
| css/app.css:224 | design motion | `transition:none` | Source timing/easing and honor reduced motion. | LOW |
| css/app.css:253 | design color | `rgb(0 0 0 / .12)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/app.css:253 | design layer | `z-index:var(--layer-sticky)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/app.css:280 | design motion | `transition:transform .15s` | Source timing/easing and honor reduced motion. | LOW |
| css/app.css:297 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:299 | design dimension | `920px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:300 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:309 | design dimension | `620px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:313 | design dimension | `360px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/app.css:320 | design dimension | `650px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:32 | design dimension | `6px; 28px; 8px; 1px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:33 | design dimension | `18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:34 | design dimension | `4px; 232px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:34 | design layer | `z-index:30` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/economy.css:36 | design dimension | `6px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:38 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:39 | design dimension | `36px; 6px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:43 | design dimension | `2px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:44 | design dimension | `6px; 8px; 5px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:56 | design layer | `z-index:var(--layer-sticky)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/economy.css:57 | design layer | `z-index:var(--layer-header)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/economy.css:75 | design dimension | `599.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:87 | design dimension | `471.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:97 | design dimension | `359.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/economy.css:100 | design dimension | `319.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/market-assets.css:3 | design dimension | `10rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/market-assets.css:4 | design dimension | `2rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/market-assets.css:5 | design dimension | `.25rem; 1.4rem; .5rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/market-assets.css:6 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/market-assets.css:7 | design dimension | `.3rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/market-assets.css:15 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:11 | design color | `#a9a8b3` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/markets.css:15 | design color | `rgb(118 118 128 / .06)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/markets.css:29 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:75 | design layer | `z-index:6` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:116 | design layer | `z-index:4` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:120 | design layer | `z-index:var(--layer-header)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:138 | design layer | `z-index:5` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:178 | design layer | `z-index:1` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:204 | design layer | `z-index:var(--layer-header)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:254 | design layer | `z-index:var(--layer-header)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/markets.css:260 | design dimension | `900px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:286 | design dimension | `471.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:305 | design dimension | `32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:307 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:312 | design dimension | `100px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:313 | design dimension | `3px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:314 | design dimension | `10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:315 | design dimension | `2px; 36px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:316 | design dimension | `10px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:319 | design dimension | `2px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:320 | design dimension | `3px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:326 | design dimension | `760px; 44px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:335 | design dimension | `32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:356 | design dimension | `760px; 44px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:421 | design dimension | `599.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:426 | design dimension | `471.98px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:430 | design dimension | `900px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:438 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/markets.css:445 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/site-header.css:45 | design color | `rgb(0 0 0 / .12)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/site-header.css:48 | design layer | `z-index:calc(var(--layer-header) + 1)` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/site-header.css:83 | design dimension | `480px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/site-header.css:98 | design dimension | `18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/site-header.css:99 | design dimension | `600px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/site-header.css:103 | design dimension | `480px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/trade.css:68 | design dimension | `900px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:7 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:8 | design dimension | `1440px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:9 | design dimension | `8px; 360px; 34px; 12px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:10 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:12 | design dimension | `22px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:13 | design dimension | `6px; 1px; 4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:15 | design dimension | `600px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:16 | design dimension | `34px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:18 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:20 | design dimension | `360px; 132px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:22 | design dimension | `1440px; 40px; 96px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:23 | design dimension | `900px; 16px; 64px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:26 | design dimension | `56px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:27 | design dimension | `32px; 56px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:28 | design dimension | `760px; 14px; 18px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:29 | design dimension | `8px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:30 | design dimension | `6px; 36px; 16px; 1px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:31 | design dimension | `15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:36 | design dimension | `56px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:37 | design dimension | `12px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:38 | design dimension | `28px; 36px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:40 | design dimension | `10px; 2.5px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:42 | design dimension | `8px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:45 | design dimension | `340px; 32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:46 | design dimension | `1000px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:47 | design dimension | `4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:48 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:49 | design dimension | `36px; 44px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:50 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:51 | design dimension | `16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:52 | design dimension | `380px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:53 | design dimension | `4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:54 | design dimension | `8px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:56 | design dimension | `30px; 12px; 15px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:59 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:60 | design dimension | `36px; 4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:65 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:67 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:70 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-overview.css:70 | design dimension | `32px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:71 | design dimension | `28px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:74 | design dimension | `68px; 24px; 8px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:75 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:80 | design dimension | `300px; 32px; 40px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:81 | design dimension | `8px; 18px; 26px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:85 | design dimension | `28px; 12px; 52px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:88 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:90 | design dimension | `6px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:91 | design dimension | `7px; 2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:94 | design dimension | `8px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:95 | design dimension | `8px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:96 | design dimension | `30px; 28px; 10px; 1px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:97 | design dimension | `6px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:97 | config URL | `http://www.w3.org/2000/svg` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| css/tv-overview.css:98 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:99 | design dimension | `560px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:100 | design dimension | `700px; 440px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:101 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-overview.css:101 | design dimension | `2px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:102 | design color | `rgb(0 0 0 / .25)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-overview.css:102 | design dimension | `13px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:103 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-overview.css:103 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:103 | design layer | `z-index:1` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-overview.css:106 | design dimension | `2px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:107 | design dimension | `600px; 40px; 11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:108 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-overview.css:108 | design dimension | `52px; 22px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:109 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:110 | design dimension | `2px; 180px; 10px; 12px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:110 | design layer | `z-index:70` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-overview.css:111 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:112 | design dimension | `15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:113 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:116 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:117 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:118 | design dimension | `40px; 12px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:118 | design layer | `z-index:1` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-overview.css:119 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:125 | design dimension | `52px; 12px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:128 | design dimension | `10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:130 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:132 | design dimension | `8px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:133 | design dimension | `34px; 220px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:136 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:137 | design dimension | `240px; 220px; 64px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:138 | design dimension | `10px; 5px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:139 | design dimension | `5px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:140 | design dimension | `10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:142 | design dimension | `700px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:145 | design dimension | `220px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:146 | design dimension | `6px; 20px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:148 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:149 | design dimension | `8px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:150 | design dimension | `10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:151 | design dimension | `28px; 34px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:152 | design dimension | `8px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:155 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:156 | design dimension | `38px; 8px; 1px; 15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:156 | design layer | `z-index:1` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-overview.css:158 | design dimension | `120px; 28px; 12px; 52px; 6px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:159 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:161 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:162 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:163 | design dimension | `24px; 1.5px; 12px; 11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:164 | design dimension | `700px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:166 | design dimension | `96px; 24px; 1px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:170 | design dimension | `260px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:171 | design dimension | `8px; 120px; 16px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-overview.css:174 | design dimension | `17px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:9 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:10 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:12 | design dimension | `64px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:13 | design dimension | `1px; 6px; 4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:16 | design dimension | `40px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:17 | design dimension | `28px; 40px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:18 | design dimension | `880px; 12px; 18px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:19 | design dimension | `24px; 32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:20 | design dimension | `40px; 32px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:21 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:23 | design dimension | `12px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:24 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:25 | design dimension | `56px; 24px; 1px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:28 | design dimension | `34px; 14px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:29 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:32 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-pages.css:34 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:35 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-pages.css:37 | design dimension | `34px; 1px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:38 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:40 | design dimension | `34px; 3px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:41 | design dimension | `6px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:42 | design color | `rgb(0 0 0 / .12)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-pages.css:42 | design dimension | `1px; 2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:46 | design dimension | `36px; 20px; 10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:48 | design dimension | `2px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:50 | design dimension | `16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:51 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:52 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:53 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:56 | design dimension | `40px; 24px; 1px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:58 | design dimension | `18px; 26px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:60 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:61 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:62 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:65 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:66 | design dimension | `36px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:67 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:68 | design dimension | `40px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:73 | design dimension | `1px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:77 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:78 | design dimension | `40px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:79 | design dimension | `40px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:81 | design dimension | `1px; 12px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:82 | design dimension | `3px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:83 | design dimension | `22px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:84 | design dimension | `1px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:85 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:86 | design dimension | `2px; 8px; 4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:89 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:90 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:91 | design dimension | `16px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:92 | design dimension | `20px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:97 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:101 | design dimension | `1rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:105 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:106 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-pages.css:108 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:16 | design dimension | `12px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:23 | design layer | `z-index:20` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:25 | design dimension | `2px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:26 | design dimension | `4px; 2px; 1px; 22px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:28 | design dimension | `34px; 8px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:29 | design dimension | `6px; 15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:31 | design dimension | `20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:33 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:36 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:37 | design dimension | `2px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:39 | design dimension | `18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:42 | design dimension | `4px; 10px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:43 | design dimension | `20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:44 | design dimension | `160px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:46 | design dimension | `34px; 26px; 10px; 4px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:46 | config URL | `http://www.w3.org/2000/svg` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| css/tv-terminal.css:47 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:62 | design dimension | `2px; 6px; 14px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:63 | design dimension | `36px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:65 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-terminal.css:68 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:76 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:77 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:78 | design dimension | `44px; 38px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:79 | design dimension | `28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:80 | design dimension | `32px; 1px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:85 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:88 | design dimension | `12px; 8px; 6px; 96px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:89 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:90 | design dimension | `17px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:91 | design dimension | `8px; 17px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:92 | design dimension | `8px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:93 | design dimension | `6px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:94 | design dimension | `17px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:95 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:96 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:103 | design dimension | `78px; 40px; 2px; 10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:104 | design dimension | `1px; 6px; 14px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:107 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:112 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-terminal.css:114 | design dimension | `40px; 24px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:114 | design layer | `z-index:1` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:115 | design dimension | `1px; 4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:117 | design dimension | `2px; 8px; 13px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:118 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:127 | design dimension | `8px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:128 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:129 | design dimension | `28px; 8px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:132 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:134 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:135 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:136 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:137 | design dimension | `28px; 6px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:143 | design dimension | `4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:145 | design dimension | `16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:146 | design dimension | `12px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:147 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:148 | design dimension | `30px; 1px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:149 | design dimension | `12px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:150 | design dimension | `1px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:152 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:153 | design dimension | `15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:154 | design dimension | `30px; 2px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:155 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:159 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:165 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:166 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:167 | design dimension | `36px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:168 | design dimension | `28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:173 | design dimension | `46px; 6px; 8px; 12px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:174 | design dimension | `16px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:176 | design dimension | `30px; 10px; 1px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:178 | design dimension | `12px; 14px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:179 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:180 | design dimension | `30px; 10px; 1px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:185 | design dimension | `30px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:187 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:188 | design dimension | `30px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:189 | design dimension | `28px; 1px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:190 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:191 | design dimension | `10px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:206 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-terminal.css:206 | design dimension | `4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:207 | design color | `rgb(255 255 255 / .7)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-terminal.css:209 | design dimension | `420px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:209 | design layer | `z-index:25` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:214 | design dimension | `16px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:217 | design dimension | `10px; 16px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:221 | design dimension | `150px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:222 | design dimension | `16px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:223 | design dimension | `12px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:224 | design dimension | `3px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:226 | design dimension | `6px; 12px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:227 | design dimension | `8px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:228 | design dimension | `28px; 36px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:229 | design dimension | `8px; 16px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:231 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:232 | design dimension | `2px; 13px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:233 | design dimension | `16px; 4px; 14px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:235 | design dimension | `12px; 2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:236 | design dimension | `13px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:237 | design dimension | `13px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:238 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:240 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:241 | design dimension | `2px; 6px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:246 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:247 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:249 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:252 | design dimension | `6px; 12px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:253 | design dimension | `30px; 1px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:258 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:261 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:262 | design dimension | `8px; 36px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:265 | design dimension | `28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:267 | design dimension | `28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:268 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:272 | design dimension | `2px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:272 | design layer | `z-index:8` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:273 | design dimension | `30px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:274 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:275 | design color | `rgb(0 0 0 / .15)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv-terminal.css:275 | design dimension | `18px; 3px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:276 | design dimension | `22px; 4px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:277 | design dimension | `22px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:278 | design dimension | `2px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:279 | design dimension | `120px; 4px; 6px; 1px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:279 | design layer | `z-index:9` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:280 | design dimension | `12px; 2px; 6px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:280 | design layer | `z-index:7` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:282 | design dimension | `30px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:283 | design dimension | `24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:284 | design dimension | `88px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:290 | design dimension | `620px; 32px; 640px; 64px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:292 | design dimension | `16px; 20px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:293 | design dimension | `20px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:294 | design dimension | `8px; 20px; 10px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:295 | design dimension | `28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:296 | design dimension | `44px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:297 | design dimension | `6px; 20px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:298 | design dimension | `28px; 12px; 14px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:300 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:301 | design dimension | `12px; 44px; 20px; 14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:304 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:305 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:307 | design dimension | `34px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:308 | design dimension | `520px; 32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:313 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:314 | design dimension | `30px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:315 | design dimension | `6px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:316 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:317 | design dimension | `6px; 26px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:318 | design dimension | `1px; 4px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:319 | design dimension | `8px; 1.5px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:324 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:333 | design dimension | `1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:334 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:339 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:341 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:342 | design dimension | `2px; 10px; 12px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:344 | design dimension | `12px; 18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:345 | design dimension | `3px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:346 | design dimension | `14px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:347 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:348 | design dimension | `720px; 32px; 860px; 24px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:349 | design dimension | `12px; 16px; 8px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:349 | design layer | `z-index:1` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:350 | design dimension | `4px; 12px; 24px; 32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:351 | design dimension | `15px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:352 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:353 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:354 | design dimension | `4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:355 | design dimension | `243px; 4px; 8px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:356 | design dimension | `243px; 4px; 16px; 8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:358 | design dimension | `480px; 4px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:359 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:360 | design dimension | `4px; 8px; 1px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:361 | design dimension | `16px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:366 | design layer | `z-index:30` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv-terminal.css:369 | design dimension | `900px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:375 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:377 | design dimension | `38px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:378 | design dimension | `1px; 22px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:379 | design dimension | `380px; 640px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:381 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:384 | design dimension | `380px; 100px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:386 | design dimension | `520px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:387 | design dimension | `64px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:389 | design dimension | `64px; 36px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:390 | design dimension | `15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:392 | design dimension | `600px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:395 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:397 | design dimension | `34px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:400 | design dimension | `480px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:403 | design dimension | `5px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv-terminal.css:404 | design dimension | `24px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:12 | design color | `#fff; #000` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:13 | design color | `#f9f9f9; #f2f2f2; #ebebeb; #dbdbdb; #c9c9c9` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:14 | design color | `#b8b8b8; #a8a8a8; #9c9c9c; #8c8c8c; #808080` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:15 | design color | `#707070; #636363; #575757; #4a4a4a; #3d3d3d` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:16 | design color | `#2e2e2e; #1f1f1f; #0f0f0f` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:17 | design color | `#ffebec; #fccbcd; #f77c80; #f7525f; #f23645; #cc2f3c; #b22833` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:18 | design color | `#daf2ee; #ace5dc; #42bda8; #22ab94; #089981; #06806b; #056656` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:19 | design color | `#e3effd; #bbd9fb; #90bff9; #5b9cf6; #3179f5; #2962ff; #1e53e5; #1848cc` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:20 | design color | `#fff3e0; #ffb74d; #ff9800; #f57c00` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:21 | design color | `#9c27b0; #673ab7; #e91e63; #00bcd4; #4caf50; #fbc02d` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:49 | design color | `rgb(0 0 0 / .2)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:49 | design dimension | `2px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:50 | design color | `rgb(0 0 0 / .08); rgb(0 0 0 / .12)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:50 | design dimension | `2px; 4px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:53 | design color | `rgb(46 46 46 / .06)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:56 | design color | `rgb(8 153 129 / .12); rgb(242 54 69 / .12)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:60 | design dimension | `38px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:61 | design dimension | `52px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:62 | design dimension | `45px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:63 | design dimension | `300px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:64 | design dimension | `38px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:65 | design dimension | `4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:71 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:78 | design color | `rgb(103 58 183 / .06)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:82 | design dimension | `.875rem` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:84 | design dimension | `6px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:85 | design dimension | `32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:104 | design color | `#132042` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:109 | design color | `#142e61` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:112 | design color | `rgb(0 0 0 / .5)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:112 | design dimension | `2px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:113 | design color | `rgb(0 0 0 / .4); rgb(0 0 0 / .5)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:113 | design dimension | `2px; 4px; 24px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:115 | design color | `rgb(242 242 242 / .06)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:118 | design color | `#132042` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:126 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:129 | design dimension | `2px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:135 | design dimension | `6px; 34px; 8px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:136 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:140 | design dimension | `28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:141 | design dimension | `34px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:142 | design dimension | `1px; 22px; 4px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:143 | design dimension | `4px; 24px; 8px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:146 | design dimension | `6px; 200px; 14px; 20px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:148 | design dimension | `10px; 36px; 16px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:150 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:151 | design dimension | `1px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:152 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:153 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:156 | design dimension | `34px; 12px; 1px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:159 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:160 | design color | `rgb(0 0 0 / .35)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:161 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:161 | design dimension | `4px; 8px; 13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:161 | design layer | `z-index:50` | Name local stacking roles; preserve chart library layer ordering. | LOW |
| css/tv.css:162 | design color | `rgb(255 255 255 / .15)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| css/tv.css:162 | design dimension | `4px; 3px; 12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:165 | design dimension | `6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| css/tv.css:166 | design dimension | `2px; 8px; 4px; 6px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| economy-overview.html:37 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| economy-overview.html:53 | design dimension | `32px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| economy-overview.html:89 | config URL | `https://www.tibia.com/news/?subtopic=latestnews` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| economy-overview.html:108 | config URL | `https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| economy.html:57 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| economy.html:255 | config URL | `https://www.tibia.com/news/?subtopic=latestnews` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| economy.html:281 | config URL | `https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| index.html:34 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| index.html:168 | config URL | `https://tibiadata.com` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| index.html:174 | config URL | `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/app.js:342 | logic/config constant | `const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/app.js:354 | logic/config constant | `const COLUMNS = [` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/app.js:368 | logic/config constant | `const GROUP_BASE = [1, 0, 0, 0, 1]` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/app.js:369 | logic/config constant | `const HIDDEN_KEY = 'tibinance.hiddenColumns.v2'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-chart.js:21 | design color | `rgba(0,0,0,0)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/economy-chart.js:21 | logic/config constant | `const HIDDEN = 'rgba(0,0,0,0)'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-chart.js:31 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/economy-chart.js:50 | logic/config constant | `const L = window.LightweightCharts, c = colors()` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:9 | logic/config constant | `const DAY = 86400000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:28 | logic/config constant | `const FIELDS = ['directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:71 | logic/config constant | `const LIQUIDATION_SCENARIOS = [0, 0.25, 0.5, 0.75, 1]` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:164 | design color | `rgba(0,0,0,0)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/economy-data.js:189 | logic/config constant | `const MEASURES = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:194 | logic/config constant | `const INTERVALS = ['day', 'week', 'month']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:195 | logic/config constant | `const RATE_FIELDS = ['grossPotential', 'directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-data.js:222 | logic/config constant | `const MONTHS_BACK = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-loot.js:12 | logic/config constant | `const COINS = { 'Gold Coin': 1, 'Platinum Coin': 100, 'Crystal Coin': 10000 }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-overview.js:13 | logic/config constant | `const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-overview.js:14 | logic/config constant | `const MEASURE = { gross: 'Gross potential', coins: 'Direct gold', npc: 'NPC potential' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-overview.js:15 | design color | `#2962ff; #ff9800; #089981; #9c27b0` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/economy-overview.js:15 | logic/config constant | `const COLOR = { gross: '#2962ff', coins: '#ff9800', npc: '#089981', kills: '#9c27b0' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-overview.js:61 | logic/config constant | `const CARDS = [` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-overview.js:114 | logic/config constant | `const STEPS = { '1M': [0.02, 0.06, 0.12], '3M': [0.04, 0.1, 0.2], '6M': [0.05, 0.15, 0.3], YTD: [0.05, 0.15, 0.3], '1Y': [0.1, 0.25, 0.5], All: [0.2, 0.5, 1] }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy-overview.js:124 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/economy-value.js:16 | logic/config constant | `const MIN_KILLS = 100` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:25 | logic/config constant | `const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:26 | design dimension | `1280px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/economy.js:26 | logic/config constant | `const ROOMY = '(min-width: 1280px)'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:27 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/economy.js:27 | logic/config constant | `const REPO = 'https://github.com/nesleykent/Tibinance'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:28 | logic/config constant | `const KEY = { gross: 'var(--eco-gross, var(--ink))', coins: 'var(--eco-coins, var(--sell))', npc: 'var(--eco-npc, var(--buy))' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:65 | logic/config constant | `const EVENTS_SHOWN = 'tibinance.economy.events'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:195 | logic/config constant | `const UNIT = { day: 'day', week: 'week', month: 'month' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:341 | config URL | `https://api.tibiadata.com/v4/worlds` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/economy.js:352 | logic timer | `setInterval(loadOnline, 5 * 60 * 1000);` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/economy.js:367 | config URL | `https://www.tibia.com/community/?subtopic=worlds` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/economy.js:368 | config URL | `https://www.tibia.com/community/?subtopic=worlds&world=${encodeURIComponent(state.world` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/economy.js:399 | logic/config constant | `const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:400 | logic/config constant | `const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:476 | logic/config constant | `const R = data.results` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:481 | logic/config constant | `const GOLD_MODELS = ['A', 'B', 'C', 'D', 'E']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:497 | logic/config constant | `const I = data.index, sync = data.sync?.sources ?? {}` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/economy.js:502 | config URL | `https://github.com/${esc(k.repo` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/economy.js:534 | design dimension | `18px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/economy.js:536 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/economy.js:542 | design color | `#089981; #f23645` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/economy.js:543 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/economy.js:545 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/economy.js:550 | logic timer | `setTimeout(() => URL.revokeObjectURL(link.href), 10000);` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/events.js:18 | logic/config constant | `const EVENTS = new URL('../data/events/events.json', import.meta.url)` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/events.js:20 | logic/config constant | `const DAY = /^\d{4}-\d{2}-\d{2}$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/events.js:24 | logic/config constant | `const FORBIDDEN = /[\u00b7\u2013\u2014]/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/filename.js:8 | logic/config constant | `const RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(\d*)_([^_]+)_Hotkey$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/filename.js:9 | logic/config constant | `const TIBIA_RE = /^\d{4}-\d{2}-\d{2}_\d{6}\d*_[^_]+_([^_]+)$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/filename.js:10 | logic/config constant | `const HOTKEY_MSG = 'Only screenshots taken with the Tibia screenshot hotkey are accepted. '` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/filename.js:45 | logic/config constant | `const A = components(a), B = components(b)` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/forecast-archive.js:11 | logic/config constant | `const SCENARIOS = 'tc-world-scenarios'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/forecast-archive.js:12 | logic/config constant | `const LEDGER = 'research-ledger'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/forecast-archive.js:14 | logic/config constant | `const DAY = 86400000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/forecast-archive.js:145 | logic/config constant | `const SIDE_KEY = { sell: 'ask', buy: 'bid' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/ingestion.js:9 | logic/config constant | `const INGESTION_VERSION = 6` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/ingestion.js:10 | logic/config constant | `const STAGES = ['filename', 'deduplication', 'market', 'item', 'view', 'metadata', 'world', 'extraction', 'statistics', 'validation']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-chart.js:29 | logic/config constant | `const SIDES = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-chart.js:40 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/market-chart.js:115 | logic/config constant | `const LAYERS = [bestOffer, dailyAverage, activity, projectionsLayer, historyLayer, eventsLayer]` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-chart.js:119 | logic/config constant | `const L = window.LightweightCharts, c = colors()` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-events-layer.js:14 | logic/config constant | `const HEIGHT = 14, PAD = 4, FONT = 9, FOOT = 4, LIFT = 8` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-events-ui.js:13 | logic/config constant | `const HEIGHT = 14` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-events-ui.js:21 | design dimension | `0px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:16 | logic/config constant | `const WIDTH = 1200, PAD = 32, CHART_HEIGHT = 560` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-export.js:17 | logic/config constant | `const HEAD = 104` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-export.js:18 | logic/config constant | `const FOOT = 68` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-export.js:19 | logic/config constant | `const LINE = 20` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-export.js:56 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/market-export.js:64 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:92 | design dimension | `30px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:94 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:98 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:100 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:103 | design dimension | `15px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:105 | design dimension | `26px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:106 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:113 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:115 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:135 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:136 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:137 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:138 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:147 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:234 | logic/config constant | `const STAT_LINE = 22, PERF_HEIGHT = 46` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-export.js:256 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:261 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:263 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:264 | design dimension | `13px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:277 | design dimension | `14px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-export.js:278 | design dimension | `11px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/market-forecast-history-layer.js:17 | logic/config constant | `const HISTORY_SLOTS = 3` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-forecast-history.js:19 | logic/config constant | `const ARCHIVE = 'data/forecast-archive/'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-forecast-history.js:20 | logic/config constant | `const OFFER = { sell: 'Sell Offer', buy: 'Buy Offer' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-forecast-history.js:21 | logic/config constant | `const CLASSES = [['published-website', 'Published on the website'], ['published-repository', 'Published in the repository only'],` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-history.js:17 | logic/config constant | `const ASSETS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-history.js:29 | logic/config constant | `const MIN_CAPTURE_BUY_SELL_RATIO = 0.8` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-history.js:100 | logic/config constant | `const OFFER_FIELDS = ['sell', 'sellVolume', 'sellTopAmount', 'goldDemand', 'buy', 'buyVolume', 'buyTopAmount', 'goldSupply']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-projections-layer.js:18 | logic/config constant | `const LABEL = 'Projection'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-projections.js:21 | logic/config constant | `const PROJECTIONS = asset => \`data/market-projections/${asset}.json\`` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-projections.js:23 | logic/config constant | `const CONDITIONS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-projections.js:30 | logic/config constant | `const DAY = 86400000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener-panel.js:14 | logic/config constant | `const KEY = 'tibinance.markets.screener'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener-panel.js:15 | logic/config constant | `const DEFAULTS = { status: 'active', type: '', battleye: '', location: '', data: 'all', sort: 'world', dir: 1 }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener-panel.js:17 | logic/config constant | `const W = 240, H = 56` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener-panel.js:18 | logic/config constant | `const OFFER = { sell: 'Sell', buy: 'Buy' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener.js:19 | logic/config constant | `const STALE_DAYS = 7` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener.js:22 | logic/config constant | `const PVP_ORDER = ['Optional PvP', 'Open PvP', 'Retro Open PvP', 'Hardcore PvP', 'Retro Hardcore PvP']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener.js:24 | logic/config constant | `const SORTS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener.js:34 | logic/config constant | `const STATUSES = { active: 'Active', retired: 'Retired', all: 'All' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-screener.js:35 | logic/config constant | `const DATA = { all: 'Any', observed: 'With best offers', current: \`Observed in the last ${STALE_DAYS} days\` }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-series.js:23 | design color | `rgba(0,0,0,0)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/market-series.js:23 | logic/config constant | `const HIDDEN = 'rgba(0,0,0,0)'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-series.js:66 | logic/config constant | `const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/market-series.js:67 | logic/config constant | `const MONTHS = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets-overview.js:15 | logic/config constant | `const DATA = 'data/market-history/'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets-overview.js:16 | logic/config constant | `const STALE = 14` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets-overview.js:84 | logic/config constant | `const SYMBOLS = [` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets-overview.js:85 | design color | `#f23645` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets-overview.js:86 | design color | `#2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets-overview.js:87 | design color | `#ff9800` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets-overview.js:88 | design color | `#089981` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets-overview.js:89 | design color | `#9c27b0` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets-overview.js:126 | logic/config constant | `const STEPS = { '1M': [0.01, 0.03, 0.06], '3M': [0.02, 0.05, 0.1], '6M': [0.03, 0.08, 0.15], YTD: [0.03, 0.08, 0.15], '1Y': [0.05, 0.12, 0.25], All: [0.1, 0.25, 0.5] }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets-overview.js:136 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/markets-overview.js:172 | design color | `#2962ff; #ff9800; #808080` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets-overview.js:172 | logic/config constant | `const GROUP = { world: '#2962ff', game: '#ff9800', market: '#808080' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets-overview.js:179 | design color | `#808080` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/markets.js:35 | logic/config constant | `const ASSET = 'tibia-coin'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets.js:36 | logic/config constant | `const DATA = \`data/market-history/${ASSET}/\`` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets.js:37 | logic/config constant | `const EVENTS_SHOWN = 'tibinance.markets.events'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets.js:40 | logic/config constant | `const PROJECTIONS_SHOWN = 'tibinance.markets.projections'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets.js:41 | logic/config constant | `const STALE_DAYS = 7` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets.js:44 | design dimension | `1280px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/markets.js:44 | logic/config constant | `const ROOMY = '(min-width: 1280px)'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/markets.js:85 | design dimension | `760px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/markets.js:614 | logic timer | `setTimeout(() => URL.revokeObjectURL(link.href), 10000);` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/ocr.js:29 | logic/config constant | `const TARGET_GLYPH = 42` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/ocr.js:37 | logic/config constant | `const MIN_CONF = 25` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/ocr.js:45 | logic/config constant | `const MIN_CONF_BODY = 8` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/offers.js:2 | logic/config constant | `const PROCESSING_VERSION = 1` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/site-header.js:16 | logic/config constant | `const GAP = 6, EDGE = 8` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/site-header.js:17 | logic/config constant | `const POPOVER = 'popover' in HTMLElement.prototype` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/site-header.js:18 | logic/config constant | `const CHEVRON = '<svg class="site-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/statistics.js:2 | logic/config constant | `const STATISTICS_FIELDS = ['transactions', 'highestPrice', 'averagePrice', 'lowestPrice']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/statistics.js:3 | logic/config constant | `const STATISTICS_SIDES = ['buy', 'sell']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/statistics.js:4 | logic/config constant | `const FIELD_LABELS = {transactions:'Number of Transactions', highestPrice:'Highest Price', averagePrice:'Average Price', lowestPrice:'Lowest Price'}` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/statistics.js:81 | logic/config constant | `const STATISTICS_CSV_HEADERS = STATISTICS_SIDES.flatMap(side => STATISTICS_FIELDS.map(k =>` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:12 | logic/config constant | `const REQUIRED = ['world', 'type', 'battleye', 'sell', 'sellVolume',` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:22 | logic/config constant | `const OPTIONAL = ['goldSupply', 'goldDemand', 'sellTopAmount', 'buyTopAmount']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:23 | logic/config constant | `const ALLOWED = [...REQUIRED, ...OPTIONAL, 'offers', 'processingVersion', 'statistics30d', 'captureDate', 'captureTimeZone', 'statisticsReferenceDate', 'capturedAtUtc', 'viewType']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:81 | logic/config constant | `const DB_NAME = 'tcmarket'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:82 | logic/config constant | `const STORE = 'observations'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:91 | logic/config constant | `const LEGACY_STORE = 'legacy'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:92 | logic/config constant | `const LEGACY_META = 'legacyMeta'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/store.js:93 | logic/config constant | `const DB_VERSION = 2` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tibia-token-markets.js:81 | logic timer | `setTimeout(() => URL.revokeObjectURL(url), 10000); $('exportStatus').textContent = \`Saved ${name}.\`;` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/tibia-token-markets.js:99 | config URL | `https://bscscan.com/token/${CONTRACT}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/tibia-token-markets.js:103 | design dimension | `1280px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/tibia-token.js:5 | logic/config constant | `const CONTRACT = '0x111B95C2b65CbA53aB4E0AaDA12f55985045E446'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tibia-token.js:6 | logic/config constant | `const POOL = '0xd2acfaec0e3b556f285fbb9026ede7e87885e611'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tibia-token.js:33 | logic/config constant | `const TOKEN_PROFILE = { layers: [price, volume, eventsLayer], priceLayer: price, format: tokenPrice,` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tibiadata.js:3 | config URL | `https://api.tibiadata.com/v4` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/tibiadata.js:3 | logic/config constant | `const API = 'https://api.tibiadata.com/v4'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tibiadata.js:4 | logic/config constant | `const WORLDS_TTL = 6 * 60 * 60 * 1000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:26 | logic/config constant | `const RULES = Object.freeze({` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:34 | logic/config constant | `const MAX_AMOUNT = RULES.maxOfferAmount * RULES.maxOffers` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:36 | logic/config constant | `const SIDES = ['sell', 'buy']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:39 | logic/config constant | `const OPPOSITE = { sell: 'buy', buy: 'sell' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:47 | logic/config constant | `const GROUPED = /^\d{1,3}([,.'’ _  ])\d{3}(?:\1\d{3})*$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:48 | logic/config constant | `const SHORT = /^(\d+)(?:[.,](\d{1,2}))?\s*(k{1,3})$/i` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:66 | logic/config constant | `const PRICE = { max: RULES.maxPrice, lot: 1 }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade-strategies.js:67 | logic/config constant | `const AMOUNT = { max: MAX_AMOUNT, lot: RULES.lot }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade.js:21 | logic/config constant | `const WORDS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/trade.js:201 | logic timer | `setTimeout(() => { if (text !== said) $('tradeStatus').textContent = said = text; }, 700);` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/tv-drawings.js:13 | logic/config constant | `const DAY = 86400000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:20 | logic/config constant | `const TOOLS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:35 | logic/config constant | `const DEFAULTS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:36 | design color | `#2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:37 | design color | `#2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:38 | design color | `#2962ff; #808080; #9c27b0` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:39 | design color | `#2962ff; #089981` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:41 | design color | `#808080; #f23645; #ff9800; #4caf50; #089981; #00bcd4` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:41 | logic/config constant | `const FIB_LEVELS = [[0, '#808080'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'],` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:42 | design color | `#808080; #2962ff; #f23645; #9c27b0; #e91e63` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:44 | design color | `#ffffff; #d1d4dc; #b2b5be; #9598a1; #787b86; #5d606b; #434651; #131722` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:44 | logic/config constant | `const PALETTE = ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#131722',` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:45 | design color | `#f23645; #ff9800; #ffeb3b; #4caf50; #089981; #00bcd4; #2962ff; #673ab7; #9c27b0; #e91e63` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:46 | logic/config constant | `const DASH = { 0: [], 1: [1, 2], 2: [5, 4] }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:47 | logic/config constant | `const HANDLE = 5.5, GRAB = 8` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:50 | design color | `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:52 | logic/config constant | `const STORE = key => \`tibinance.tv.drawings.${key}\`` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:53 | logic/config constant | `const FLAGS = 'tibinance.tv.drawflags'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:121 | logic/config constant | `const L = logicalOf(time)` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:165 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:244 | design dimension | `12px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/tv-drawings.js:249 | design color | `#808080` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:257 | design color | `#2962ff; #f23645` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:267 | logic/config constant | `const L0 = logicalOf(d.points[0].time), L1 = logicalOf(d.points[1].time), bars = L0 === null \|\| L1 === null ? 0 : Math.round(L1 - L0)` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-drawings.js:272 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:296 | design color | `#ffffff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-drawings.js:400 | logic/config constant | `const OVER = '.tv-float,.tv-text-edit,.tv-replay,.tv-popup,#chartHead button,#eventMarks,#status'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-indicators.js:8 | logic/config constant | `const INDICATORS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-indicators.js:9 | design color | `#2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-indicators.js:10 | design color | `#ff9800` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-indicators.js:11 | design color | `#ff6d00; #2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-indicators.js:12 | design color | `#7e57c2` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-indicators.js:48 | logic/config constant | `const STORE = page => \`tibinance.tv.indicators.${page}\`` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-indicators.js:49 | logic/config constant | `const TEMPLATES = page => \`tibinance.tv.templates.${page}\`` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-indicators.js:63 | design color | `#787b86` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-indicators.js:64 | design color | `rgba(120,123,134,.5)` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-indicators.js:65 | design color | `#787b86` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-news.js:9 | config URL | `https://api.tibiadata.com/v4/news` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| js/tv-news.js:9 | logic/config constant | `const API = 'https://api.tibiadata.com/v4/news'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-news.js:10 | logic/config constant | `const KINDS = { news: 'News', ticker: 'Ticker', article: 'Featured article' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-news.js:11 | logic/config constant | `const CATEGORIES = { development: 'Development', community: 'Community', support: 'Support', technical: 'Technical', useful: 'Useful info', 'useful info': 'Useful info', cipsoft: 'CipSoft' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-news.js:33 | logic/config constant | `const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'BLOCKQUOTE', 'A', 'IMG', 'TABLE', 'TBODY', 'TR', 'TD', 'TH'])` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-overview.js:18 | design color | `#2962ff; #089981; #f23645; #ff9800; #9c27b0; #00bcd4; #e91e63; #673ab7; #4caf50; #f57c00` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-overview.js:18 | logic/config constant | `const LOGO = ['#2962ff', '#089981', '#f23645', '#ff9800', '#9c27b0', '#00bcd4', '#e91e63', '#673ab7', '#4caf50', '#f57c00']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-overview.js:28 | logic/config constant | `const L = window.LightweightCharts` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-overview.js:41 | design color | `#2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-overview.js:47 | design color | `#2962ff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-overview.js:66 | design color | `#f23645; #f7525f; #f77c80; #8c8c8c; #42bda8; #22ab94; #089981` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-overview.js:66 | logic/config constant | `const HEAT = ['#f23645', '#f7525f', '#f77c80', '#8c8c8c', '#42bda8', '#22ab94', '#089981']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-overview.js:68 | design color | `#707070` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| js/tv-overview.js:210 | design dimension | `0px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/tv-terminal.js:41 | logic timer | `setTimeout(() => document.addEventListener('pointerdown', outside, true));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/tv-terminal.js:55 | logic/config constant | `const STYLES = [['line', 'Line', 'line'], ['markers', 'Line with markers', 'line-markers'], ['step', 'Step line', 'step']]` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-terminal.js:112 | design dimension | `12px; 28px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/tv-terminal.js:115 | design dimension | `6px; 30px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/tv-terminal.js:185 | logic/config constant | `const SPEEDS = [[0.5, 2000], [1, 1000], [3, 300], [5, 200], [7, 143], [10, 100]]` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-terminal.js:228 | logic timer | `setInterval(() => replayStep(), SPEEDS.find(s => s[0] === replay.speed)[1]); showReplayBar(); }` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/tv-terminal.js:232 | logic timer | `setInterval(() => replayStep(), SPEEDS.find(s => s[0] === replay.speed)[1]); }` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/tv-terminal.js:286 | logic/config constant | `const STYLE_NAMES = ['Solid', 'Dotted', 'Dashed']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-terminal.js:301 | design dimension | `8px` | Use a sourced size/spacing token; retain query thresholds with an explicit reference gap. | LOW |
| js/tv-terminal.js:328 | logic/config constant | `const ICON = { trend: 'trend', ray: 'ray', hline: 'hline', hray: 'hray', vline: 'vline', crossline: 'crossline', channel: 'channel', fib: 'fib', rect: 'rect', measure: 'measure', text: 'text', arrowup: 'arrowup' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-terminal.js:352 | logic/config constant | `const L = window.LightweightCharts, mode = { log: L.PriceScaleMode.Logarithmic, percent: L.PriceScaleMode.Percentage }[scale.mode] ?? L.PriceScaleMode.Normal` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-terminal.js:360 | logic/config constant | `const L = window.LightweightCharts, options = mainScale().options(), auto = options.autoScale` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-terminal.js:386 | logic timer | `setInterval(tick, 1000);` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| js/tv-terminal.js:392 | logic/config constant | `const TOOL_KEYS = { KeyT: 'trend', KeyH: 'hline', KeyJ: 'hray', KeyV: 'vline', KeyC: 'crossline', KeyF: 'fib' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/tv-theme.js:7 | logic/config constant | `const KEY = 'tibinance.theme'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| js/validation.js:19 | logic/config constant | `const S = live(sell), B = live(buy)` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| markets-overview.html:37 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| markets-overview.html:90 | config URL | `https://www.tibia.com/news/?subtopic=latestnews` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| markets-overview.html:116 | config URL | `https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| markets.html:56 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| markets.html:268 | config URL | `https://www.tibia.com/news/?subtopic=latestnews` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| markets.html:317 | config URL | `https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/audit_market_chart.mjs:28 | design color | `#fff` | Resolve from shared css/tv.css tokens; preserve immutable drawing/heatmap identities. | LOW |
| tools/build_economy_overview.mjs:15 | logic/config constant | `const ROOT = fileURLToPath(new URL('..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_economy_overview.mjs:16 | logic/config constant | `const GOLD = join(ROOT, 'data/economy/gold')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_economy_overview.mjs:17 | logic/config constant | `const OUT = join(GOLD, 'overview.json')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_economy_overview.mjs:18 | logic/config constant | `const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_economy_overview.mjs:22 | logic/config constant | `const FIELDS = ['directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:20 | logic/config constant | `const ROOT = fileURLToPath(new URL('..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:21 | logic/config constant | `const CAPTURES = 'data/observations.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:24 | logic/config constant | `const TIBIA_MARKET = 'reports/tc-cycle/inputs/api'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:27 | logic/config constant | `const MORE_HISTORY = 'data/market-history/inputs/tibiamarket'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:28 | logic/config constant | `const WORLD_SNAPSHOT = 'data/market-history/inputs/worlds.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:29 | logic/config constant | `const RETIRED = 'data/market-history/inputs/retired-worlds.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_history.mjs:31 | logic/config constant | `const EXCLUSIONS = 'data/market-history/inputs/best-offer-exclusions.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:25 | logic/config constant | `const ROOT = fileURLToPath(new URL('..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:26 | logic/config constant | `const RESULTS = 'reports/tc-cycle/results.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:27 | logic/config constant | `const CAPTURES = 'reports/tc-cycle/market-update.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:28 | logic/config constant | `const INDEX = 'data/market-history/tibia-coin/index.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:29 | logic/config constant | `const OUTPUT = 'data/market-projections/tibia-coin.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:32 | logic/config constant | `const STATUS = {` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_market_projections.mjs:38 | logic/config constant | `const SIDE = { ask: 'sell', bid: 'buy' }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/build_tibia_token.mjs:23 | config URL | `https://www.geckoterminal.com/bsc/pools/${POOL}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/ci/artifact.mjs:16 | logic/config constant | `const EXCLUDED = path => path.split('/').some(segment => segment.startsWith('.')) \|\| path.startsWith('.github/') \|\| path.startsWith('.cache/')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/ci/pages_release.mjs:21 | logic/config constant | `const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/ci/pages_release.mjs:22 | config URL | `https://nesleykent.github.io/Tibinance/` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/ci/pages_release.mjs:22 | logic/config constant | `const LIVE = 'https://nesleykent.github.io/Tibinance/'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/ci/pages_release.mjs:23 | logic/config constant | `const KEY_FILES = ['index.html', 'markets.html', 'trade.html', 'reports/tc-cycle/index.html', 'reports/tc-cycle/pt-br.html',` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/ci/validate_site.mjs:20 | logic/config constant | `const BUILDER_CHECKS = ['build_market_history', 'build_market_projections', 'audit_market_chart', 'audit_rolling_activity', 'build_tibia_token', 'build_economy_overview']` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/ci/validate_site.mjs:21 | logic/config constant | `const SKIP_DIRS = new Set(['node_modules', 'dist', 'app', 'exports'])` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/ci/validate_site.mjs:43 | logic/config constant | `const LOCAL = ref => ref && !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith('//') && !ref.startsWith('#') && !ref.includes('${') && !ref.startsWith('{')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/build_gold.mjs:31 | logic/config constant | `const ROOT = fileURLToPath(new URL('../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/build_gold.mjs:32 | logic/config constant | `const SOURCES = join(ROOT, 'data/economy/sources')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/build_gold.mjs:33 | logic/config constant | `const GOLD = join(ROOT, 'data/economy/gold')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/build_gold.mjs:34 | logic/config constant | `const METHODOLOGY = { version: 1, rule: 'strict', minKills: MIN_KILLS, killDay: 'file date minus one day',` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:29 | logic/config constant | `const ROOT = fileURLToPath(new URL('../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:30 | logic/config constant | `const CACHE = join(process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy'), 'wiki')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:31 | logic/config constant | `const OUT = join(ROOT, 'data/economy/sources')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:32 | config URL | `https://tibia.fandom.com/api.php` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/fetch_loot.mjs:32 | logic/config constant | `const API = 'https://tibia.fandom.com/api.php'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:33 | config URL | `https://github.com/nesleykent/Tibinance;` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/fetch_loot.mjs:33 | logic/config constant | `const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:34 | logic/config constant | `const BASE = '2022-08-23T00:00:00Z'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:35 | logic/config constant | `const PRICES_TITLE = 'Module:ItemPrices/data'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/fetch_loot.mjs:37 | logic timer | `setTimeout(r, ms));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| tools/economy/fetch_loot.mjs:126 | config URL | `https://tibia.fandom.com/wiki/Special:PermanentLink/${rev.revid}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/ingest_killstats.mjs:30 | logic/config constant | `const ROOT = fileURLToPath(new URL('../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/ingest_killstats.mjs:31 | logic/config constant | `const CACHE = process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/ingest_killstats.mjs:32 | logic/config constant | `const SOURCES = join(ROOT, 'data/economy/sources')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/ingest_killstats.mjs:33 | logic/config constant | `const UPSTREAMS = [` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/ingest_killstats.mjs:37 | logic/config constant | `const FILE = /^data\/([a-z]+)\/(\d{4}-\d{2})-\d{2}\.json$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/ingest_killstats.mjs:50 | config URL | `https://github.com/${upstream.repo}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/ingest_killstats.mjs:83 | config URL | `https://api.github.com/repos/${upstream.repo}/commits?per_page=100&page=${page}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/map_creatures.mjs:26 | logic/config constant | `const ROOT = fileURLToPath(new URL('../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/map_creatures.mjs:27 | logic/config constant | `const CACHE = process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/map_creatures.mjs:28 | logic/config constant | `const SOURCES = join(ROOT, 'data/economy/sources')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/map_creatures.mjs:29 | config URL | `https://github.com/nesleykent/Tibinance;` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/map_creatures.mjs:29 | logic/config constant | `const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/map_creatures.mjs:85 | config URL | `https://tibia.fandom.com/api.php?${new` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/map_creatures.mjs:90 | logic timer | `setTimeout(r, 700));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| tools/economy/population/collect_gated.mjs:19 | logic/config constant | `const ROOT = fileURLToPath(new URL('../../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/collect_gated.mjs:20 | logic/config constant | `const OUT = join(ROOT, 'data/economy/population')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/collect_gated.mjs:21 | config URL | `https://github.com/nesleykent/Tibinance;` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/collect_gated.mjs:21 | logic/config constant | `const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/collect_gated.mjs:22 | logic/config constant | `const SOURCES = [` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/collect_gated.mjs:23 | config URL | `https://guildstats.eu/online-counter` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/collect_gated.mjs:24 | config URL | `https://tibiavip.app/worlds` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/import_tibiavip_snapshot.mjs:16 | logic/config constant | `const ROOT = fileURLToPath(new URL('../../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/import_tibiavip_snapshot.mjs:17 | logic/config constant | `const OUT = join(ROOT, 'data/economy/population/tibiavip-snapshot')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/import_tibiavip_snapshot.mjs:18 | logic/config constant | `const ROW = /^([A-Z][a-z]+)\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+(North America\|South America\|Europe\|Oceania)\s+(.+?)\s*$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/import_tibiavip_snapshot.mjs:41 | config URL | `https://tibiavip.app/worlds` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/sample_tibiadata.mjs:15 | config URL | `https://api.tibiadata.com/v4/worlds; https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:24 | logic/config constant | `const ROOT = fileURLToPath(new URL('../../..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:25 | logic/config constant | `const CACHE = join(process.env.TIBINANCE_ECONOMY_CACHE ?? join(ROOT, '.cache/economy'), 'wayback')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:26 | logic/config constant | `const OUT = join(ROOT, 'data/economy/population/guildstats-wayback')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:27 | config URL | `https://github.com/nesleykent/Tibinance;` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:27 | logic/config constant | `const UA = 'TibinanceResearch/1.0 (https://github.com/nesleykent/Tibinance` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:28 | logic/config constant | `const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:29 | logic timer | `setTimeout(r, ms));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:47 | logic/config constant | `const DAILY = /^\d{4}-\d{2}-\d{2}$/` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:48 | logic/config constant | `const FORMATS = [` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:169 | config URL | `https://web.archive.org/cdx/search/cdx?${new` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:180 | config URL | `https://web.archive.org/web/${c.timestamp}id_/${c.original}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/economy/population/wayback_guildstats.mjs:192 | config URL | `https://web.archive.org/web/${ts}/${c.original}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/fetch_market_history.mjs:18 | logic/config constant | `const ROOT = fileURLToPath(new URL('..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/fetch_market_history.mjs:19 | logic/config constant | `const INPUTS = join(ROOT, 'data/market-history/inputs')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/fetch_market_history.mjs:20 | logic/config constant | `const HISTORY = join(INPUTS, 'tibiamarket')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/fetch_market_history.mjs:21 | logic/config constant | `const RESEARCH = join(ROOT, 'reports/tc-cycle/inputs/api')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/fetch_market_history.mjs:22 | logic/config constant | `const SPACING = 12000, BACKOFF = 35000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/fetch_market_history.mjs:23 | logic timer | `setTimeout(resolve, ms));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| tools/fetch_market_history.mjs:44 | config URL | `https://api.tibiadata.com/v4/worlds` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/fetch_market_history.mjs:48 | config URL | `https://api.tibiadata.com/v4/worlds` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/fetch_market_history.mjs:53 | config URL | `https://api.tibiamarket.top/world_data` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/fetch_market_history.mjs:58 | config URL | `https://api.tibiamarket.top/item_history?server=${encodeURIComponent(world` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/fetch_tibia_token.mjs:5 | config URL | `https://api.geckoterminal.com/api/v2/networks/bsc` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/fetch_tibia_token.mjs:29 | logic timer | `setTimeout(resolve, 2200));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| tools/forecasts/publish_evidence.py:39 | config URL | `https://nesleykent.github.io/Tibinance/` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/forecasts/publish_evidence.py:51 | config URL | `https://api.github.com/{path}` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/release.mjs:35 | logic/config constant | `const TOOL_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/release.mjs:36 | logic/config constant | `const MANIFEST = 'release/production.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/release.mjs:37 | logic/config constant | `const CHAIN = 'release/releases.jsonl'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/release.mjs:38 | logic/config constant | `const POLICY = 'release/policy.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/release.mjs:39 | logic/config constant | `const ZERO = '0'.repeat(64)` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_market.mjs:31 | logic/config constant | `const ROOT = fileURLToPath(new URL('..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_market.mjs:32 | logic/config constant | `const PYTHON = process.env.PYTHON ?? 'python3'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_market.mjs:33 | logic/config constant | `const STATUS = 'data/economy/sync-status.json'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_tibiamarket.mjs:23 | logic/config constant | `const ROOT = fileURLToPath(new URL('..', import.meta.url))` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_tibiamarket.mjs:24 | logic/config constant | `const HISTORY = join(ROOT, 'data/market-history/inputs/tibiamarket')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_tibiamarket.mjs:25 | logic/config constant | `const RESEARCH = join(ROOT, 'reports/tc-cycle/inputs/api')` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_tibiamarket.mjs:26 | config URL | `https://api.tibiamarket.top` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/sync_tibiamarket.mjs:26 | logic/config constant | `const API = 'https://api.tibiamarket.top'` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_tibiamarket.mjs:27 | logic/config constant | `const SPACING = 12000, BACKOFF = 35000` | Separate operational defaults from domain constants, schema versions and asset identity. | MEDIUM |
| tools/sync_tibiamarket.mjs:28 | logic timer | `setTimeout(resolve, ms));` | Centralize duration with units; clean up active timers/listeners. | MEDIUM |
| tools/tcmarket.py:31 | config URL | `https://api.tibiadata.com/v4` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/website_ingestion.mjs:30 | config URL | `http://127.0.0.1:8766/**` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/website_ingestion.mjs:33 | config URL | `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| tools/website_ingestion.mjs:37 | config URL | `http://127.0.0.1:8766/` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| trade.html:37 | config URL | `https://github.com/nesleykent/Tibinance` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |
| trade.html:114 | config URL | `https://www.tibia.com/gameguides/?section=controls_trading&amp;subtopic=manual` | Centralize operational endpoints, retain attribution/documentation URLs. | MEDIUM |

## Resolution checkpoint

The inventory above is deliberately preserved as baseline evidence. Shared active UI dimensions, weights, layers and palette consumers were consolidated; validated public endpoint/duration/view configuration was implemented and tested; focus, normal text/heatmap contrast and reduced motion were checked in Chrome/WebKit; chart gap work was made linear and token price precision/formatting shared. Baseline had 228 tests; final suite has 237.

GitHub main advanced to 899c8ba (release/0022) during this work. Its world links, left-axis event-marker fix, browser assertions, data and release records were merged without rewriting history. The new world-link measurements consume the existing shared size scale. Refer to CHANGES.md for exact checks, retained reference gaps and remaining scope boundaries. Audit line numbers remain the initial 1c14ec2 baseline.
