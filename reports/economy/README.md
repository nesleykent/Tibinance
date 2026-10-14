# Gold generation potential and Tibia Coin prices: research notes

What the data say about the link between the gold that creature kills could bring into a world and the price of
Tibia Coins there. Every figure below comes from `results.json`, written by `economy_research.py`; rerun it to
reproduce them.

```bash
/Users/nesleykent/Code/Tibinance/.venv/bin/python reports/economy/economy_research.py
```

Any Python with the pinned versions in `reports/tc-cycle/requirements.txt` works (numpy, pandas, scipy,
statsmodels). The script reads:

- `data/economy/gold/` (latest-evidence build, committed);
- the monthly point-in-time builds in `.cache/economy/gold-pit/` (local; rebuild with
  `node tools/economy/build_gold.mjs --as-of <YYYY-MM-01T00:00:00Z>` for each month, which needs the kill-statistics
  and loot caches described in `PROGRESS.md`);
- the Research's TC observations, through `reports/tc-cycle/evaluate.py` and `research_data.py`, so prices follow
  the Research's own weekly rules.

## What is measured, and what is not

Three quantities, always from **valued creatures** (creatures with an applicable TibiaWiki loot sample), never
scaled up to the creatures without one:

| Name | Meaning |
| --- | --- |
| `directCoins` | Coins the killed creatures drop (gold, platinum and crystal at 1, 100 and 10,000 gp) |
| `npcPotential` | Their other loot at the highest NPC buy price: what it could fetch, not gold that entered the game |
| `grossPotential` | The sum of the two: a maximum under the stated valuation, not observed monetary expansion |

None of them is money supply, inflation, GDP or net creation: gold leaving the game (NPC purchases, fees, the Store)
is not measured, nor what players actually sold. No liquidation rate is assumed. Kill coverage, the share of kills
that are valued, is about 98% in most weeks; weeks under 90% are excluded and counted (`meta.excludedLowCoverageWeeks`,
0 in this run).

The panel joins weekly sums of gold potential (weeks ending on Sunday; a week with a missing day is missing, never a
partial sum) with the Research's weekly median best offers (Sell Offer, "ask", and Buy Offer, "bid"). This run:
**112 worlds, 5,887 world-weeks**, prices through 2026-10-06.

## Specifications

Separate specifications, each with its own fit, because `grossPotential = directCoins + npcPotential` and the three
can never be regressors together:

- **A:** price on `directCoins`
- **B:** price on `npcPotential`
- **C:** price on `grossPotential`
- **D:** price on `directCoins` and `npcPotential`, with rank, condition number and variance inflation reported
- **E:** C plus activity (players killed by creatures). The population extension is a cross-section only, since the
  only population data is one TibiaVIP snapshot.

All in logs. Association, within-world variation, between-world variation, prediction and causation are kept apart.
No coefficient here is causal.

## Results against the hypotheses

### 1. "Gold generation explains about 45% of TC prices" (the owner's earlier figure)

A reference, not a target: nothing was tuned toward it.

| Specification | Pooled R², ask | Pooled R², bid | Within worlds, ask | Between worlds, ask |
| --- | --- | --- | --- | --- |
| A, direct coins | 0.28 | 0.35 | 0.08 | 0.17 |
| B, NPC potential | 0.24 | 0.32 | 0.04 | 0.14 |
| C, gross potential | 0.26 | 0.33 | 0.05 | 0.15 |
| D, coins and NPC potential | 0.30 | 0.37 | 0.12 | 0.28 |

- **Levels:** a quarter to a third of the variation in log price levels goes with gold potential, mostly because
  worlds that generate more gold have higher prices (between worlds). Over time within a world, the share is 4 to 13%.
- **D:** coins carry a positive coefficient (0.33) and NPC potential a negative one (−0.22). The two are strongly
  collinear (variance inflation 33, condition number 11.5), so the split between them is not identified. What D shows
  is that a world's mix of coins and loot matters more than the total.
- **Not stationary:** 5 of 35 log price series and 2 of 35 log gold series reject a unit root at 5% (augmented
  Dickey-Fuller), so level correlations can be spurious, and the 45% figure is not reproduced as a structural share.

### 2. "Changes in gold generation move prices"

Week-to-week changes regressed on the change in gold potential and its lags of 1, 2, 4, 8 and 13 weeks:

- **Setup:** 80 worlds, 181 weeks, 2,876 world-weeks, with world and week effects and errors clustered by world and
  week.
- **Fit:** within R² is 0.004 to 0.03.
- **Significance:** direct coins are jointly significant for the Buy Offer (p 0.03). The coins-and-NPC pair is
  jointly significant (p < 0.001 for the Sell Offer), with the same-week coin change carrying it (0.07, p 0.02).
- **Reading:** changes in gold potential say very little about changes in price.

### 3. "Late 2025: gold generation rose while prices fell"

The rolling 13-week check (August 2025 to February 2026) found no world where most weeks combined rising gold with a
falling Sell Offer. At most 9 of 30 weeks did, in Celesta, Dia, Nefera and Nevia.

Quarter on quarter, which also shows the other quarters:

| Quarter | Worlds | Gold up, price down | Same, constant creature set | Median gold change | Median price change |
| --- | --- | --- | --- | --- | --- |
| 2025 Q3 | 23 | 0 | 0 | +11.0% | +1.9% |
| 2025 Q4 | 28 | 0 | 0 | +14.3% | +10.1% |
| 2026 Q1 | 46 | 34 | 33 | +8.1% | −5.2% |
| 2026 Q2 | 49 | 36 | 37 | +6.5% | −2.5% |
| 2026 Q3 | 13 | 0 | 0 | +22.6% | +8.5% |

Changes are in logs, and a quarter counts only when both it and the previous quarter have at least 12 analysed
weeks.

- **When:** in late 2025, gold potential and prices rose together. The split, gold up and prices down in most worlds,
  is in the **first half of 2026**.
- **Not coverage:** the constant creature set gives the same counts, so newly valued creatures do not explain it.
- **Seasonality:** 2025 Q1 shows the same pattern in 7 of 10 worlds, so part of it may recur early in the year.
- **Coverage:** the number of worlds changes by quarter because the weekly price series start at different dates.

### 4. "Gold data improve price forecasts"

Out of sample, all with identical forecasts for every specification:

- **Origins:** 112 weekly origins from 2024-07-07 to 2026-10-04, at horizons of 1, 4 and 13 weeks.
- **Point-in-time features only:** each origin uses the monthly build made with the evidence available then
  (correction 11): 13-week growth of each component, at most 6 weeks old, 2.9 on average.
- **Fitting:** coefficients are fitted on targets already realised by the origin.
- **Error measure:** mean absolute error of the log price change, in percent.

| Horizon | Forecasts | No change | Drift | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 week | 4,884 | **2.17** | 2.19 | 2.18 | 2.18 | 2.18 | 2.18 | 2.19 |
| 4 weeks | 4,551 | **4.17** | 4.46 | 4.41 | 4.45 | 4.44 | 4.47 | 4.39 |
| 13 weeks | 3,725 | **8.02** | 10.04 | 10.42 | 10.73 | 10.67 | 10.66 | 9.69 |

- **No gold-based specification beats the no-change forecast at any horizon.**
- **At 13 weeks** A to D are significantly worse than no change (Diebold-Mariano on origin-averaged errors, p
  about 0.03). E, the only one with activity, is not significantly different from no change and beats drift (p
  0.04).
- **At 1 week** A, C and D beat drift (p under 0.05) but not no change.

Consequence (Stage G): no gold-based model enters the published Projections. The Research's own models (C, S, H)
were not part of this comparison; they are scored in the forecast archive, separately.

### 5. Population and productivity

- **Data:** the only population data is the TibiaVIP snapshot of 2026-10-13. "Characters online" is an instant;
  "total known characters" is not an active population.
- **Cross-section, 92 worlds:** log Sell Offer against log gross potential per online character gives R² 0.23
  (coefficient 0.23, p < 0.001); per known character, R² 0.01.
- **Status:** a cross-section association at one instant, nothing more.
- **Open requirement:** hourly GuildStats history and TibiaVIP active population remain required and unresolved. Both
  block automated access, and they are never replaced by the sparse archived pages.

## Checks on the gold series itself

- **Day alignment:** the largest swing in the series is 2 to 4 June 2023, when daily kills on all 90 active worlds
  roughly doubled (from about 40 to 80 million) and gross potential went from about 40 to 90 billion. That was an
  XP/Skill event with a Loot Event (`data/events/events.json`). The spike falls exactly on the event days, which
  confirms the alignment (a file dated D reports the kills of D minus one day).
- **Event days:** XP/Skill (27 since 2022-08) and Rapid Respawn (15) events raise kills, so they show as real spikes
  in potential. Loot Events (4: 2023-04, 2023-06, 2023-10 and 2024-10) also raise the loot per kill, which the
  valuation does not model: it uses normal-time loot samples, so gold potential on those days is **understated**.

## Limits

- **Valuation:** NPC prices are TibiaWiki's current price vintage, applied to all dates in the latest-evidence build.
  The point-in-time builds use the vintage of their date.
- **World transfers:** they move wealth between worlds and are not modelled. Merged worlds keep separate series,
  never chained.
- **Price coverage:** weekly prices exist where the Research has them: TibiaMarket daily statistics from 2024 for
  most worlds, plus captures.
- **Weak tests:** the unit-root tests have little power on series of 40 to 180 weeks.
