# Legend audit — 2026-10-15

| Interface / source | Finding | Correction |
| --- | --- | --- |
| Economy: css/tv-terminal.css #measure; js/economy.js showQuote/showLegend | Tiny dot toggles, repeated latest values in header/controls/readout; hardcoded daily unit even accumulated | Full series-colored controls; one period readout and contextual units |
| Economy export: js/economy.js exportImage | Canvas excludes HTML legend; kills, TC, comparisons and indicators unidentified | Wrapped series-colored text legend painted into PNG with units and visible-series state |
| Economy Overview: js/economy-overview.js statCards/showChart | Dot identity, repeated name/context | Series-colored cards and selected-series heading; preserve weekly vs monthly bases |
| Markets / Token: js/markets.js, js/tibia-token-markets.js | Tiny keys; header price duplicates selected series readout | Series-colored text labels, subordinate range context; retain bid/ask controls and crosshair values |
| Markets export: js/market-export.js, js/tv-indicators.js | Small keys can collide with date range; indicator overlays omitted | Wrapped colored labels, separate range line; reconstruct visible indicators using same renderer |
| Research EN/PT: report.css .sw / export.js | Tiny dot/ring/line swatches in legends and tooltips | Color across complete labels; computed styles preserved in figure PNG |
| Indicators, projections, historical forecasts and help | Series identity limited to tiny marks or unlabeled color | Complete series-colored labels and readable comparison names |

Chart point markers, event locations and drawing handles represent data/interaction, not legend indicators; their meanings remain intact. No data or numerical transformations are changed. Shared series colors come from the existing theme. Legends retain TradingView's compact text hierarchy and spacing; only the prohibited dot keys are replaced by series-colored labels.
