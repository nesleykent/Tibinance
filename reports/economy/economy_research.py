"""Gold generation potential and Tibia Coin prices: association, within- and between-world variation, and forecasts.

    python reports/economy/economy_research.py        writes reports/economy/results.json

Needs the pinned Research environment (reports/tc-cycle/requirements.txt), the latest-evidence gold build
(data/economy/gold/) and, for forecasting, the monthly point-in-time builds (.cache/economy/gold-pit/, from
tools/economy/build_gold.mjs --as-of). Prices follow the Research's own rules (reports/tc-cycle/research_data.py):
daily median offers (TibiaMarket first, captures only on days without), weekly medians labelled by their Sunday.

Specifications (correction 14), never the three gold components as unrestricted regressors together, because
grossPotential = directCoins + npcPotential:
  A  price ~ directCoins            B  price ~ npcPotential          C  price ~ grossPotential
  D  price ~ directCoins + npcPotential (with rank, condition number and VIF)
  E  C extended with activity (player deaths), kill coverage and world characteristics
Every gold value covers valued creatures only; kill coverage enters as a control or a filter and the samples used
are reported. Missing weeks are missing, never zero. Coefficients describe associations, not causal effects.

Forecasting is out of sample on expanding weekly origins. A feature enters a forecast only if it was available at
the origin: the gold growth comes from the latest monthly point-in-time build made on or before the origin (only kill
files, loot revisions and NPC prices published by then), and each model is fitted only on targets realised by the
origin. Models are compared on identical origins, worlds and horizons.
"""
from __future__ import annotations

import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.tsa.stattools import adfuller

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'forecasts'))
sys.path.insert(0, str(ROOT / 'reports' / 'tc-cycle'))
import evaluate as ev  # noqa: E402  (observation loading with the Research's rules)
import research_data as rd  # noqa: E402

GOLD = ROOT / 'data' / 'economy' / 'gold'
PIT = ROOT / '.cache' / 'economy' / 'gold-pit'
OUT = Path(__file__).resolve().parent / 'results.json'
COMPONENTS = {'A': ['directCoins'], 'B': ['npcPotential'], 'C': ['grossPotential'], 'D': ['directCoins', 'npcPotential']}
MIN_COVERAGE = 0.9   # weeks whose kill coverage falls below this are excluded (and counted)
HORIZONS = (1, 4, 13)
GROWTH_WEEKS = 13
MAX_FEATURE_AGE_WEEKS = 6   # monthly point-in-time builds: a feature may be up to about five weeks old at an origin


# Data ------------------------------------------------------------------------------------------------------------

def gold_daily(build: Path) -> pd.DataFrame:
    index = json.loads((build / 'index.json').read_text())
    frames = []
    for w in index['worlds']:
        d = json.loads((build / 'worlds' / f"{w['dir']}.json").read_text())
        days = pd.date_range(d['first'], periods=len(d['status']), freq='D')
        frames.append(pd.DataFrame({'world': w['world'], 'day': days, 'status': list(d['status']),
                                    **{k: d[k] for k in ('directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable')}}))
    df = pd.concat(frames, ignore_index=True)
    df['grossPotential'] = df['directCoins'] + df['npcPotential']
    return df


def gold_weekly(daily: pd.DataFrame) -> pd.DataFrame:
    """Weekly sums per world (weeks end on Sunday); a week with any missing day is missing, never a partial sum."""
    d = daily.copy()
    d['complete'] = d['status'].isin(['o', 'r'])
    d['week'] = d['day'] + pd.to_timedelta((6 - d['day'].dt.weekday) % 7, unit='D')
    cols = ['directCoins', 'npcPotential', 'grossPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable']
    g = d.groupby(['world', 'week']).agg(**{c: (c, 'sum') for c in cols}, days=('complete', 'sum'), n=('complete', 'size')).reset_index()
    g.loc[g['days'] < 7, cols] = np.nan
    g['coverage'] = g['killsValued'] / g['kills']
    return g.drop(columns=['n'])


def weekly_prices() -> pd.DataFrame:
    rows, captures, files = ev.observations()
    cutoff = ev.cutoff_of(rows, captures)
    actuals = ev.weekly_actuals(rows, captures, cutoff)
    frames = []
    for world, sides in actuals.items():
        f = pd.DataFrame({'ask': sides['ask'], 'bid': sides['bid']}).dropna(how='all')
        f['wkey'] = world
        frames.append(f.rename_axis('week').reset_index())
    out = pd.concat(frames, ignore_index=True)
    return out, str(cutoff.date()), files


def panel() -> tuple[pd.DataFrame, dict]:
    gold = gold_weekly(gold_daily(GOLD))
    prices, cutoff, files = weekly_prices()
    gold['wkey'] = gold['world'].str.lower()
    p = prices.merge(gold, on=['wkey', 'week'], how='inner')
    p = p[(p['ask'] > 0) & (p['bid'] > 0)]
    meta = {'priceCutoff': cutoff, 'priceFiles': len(files), 'goldWeeks': int(gold['grossPotential'].notna().sum()),
            'priceWeeks': int(len(prices)), 'joinedWeeks': int(len(p))}
    low = p['coverage'] < MIN_COVERAGE
    meta['excludedLowCoverageWeeks'] = int(low.sum())
    p = p[~low & p['grossPotential'].notna()].copy()
    for c in ('directCoins', 'npcPotential', 'grossPotential', 'playerDeaths', 'ask', 'bid'):
        p[f'log_{c}'] = np.log(p[c].where(p[c] > 0))
    p = p.sort_values(['world', 'week'])
    meta['analysedWeeks'] = int(len(p))
    meta['worlds'] = int(p['world'].nunique())
    return p, meta


# Statistics ------------------------------------------------------------------------------------------------------

def ols(y, X, groups=None):
    X = sm.add_constant(X, has_constant='add')
    m = sm.OLS(y, X, missing='drop')
    if groups is not None:
        return m.fit(cov_type='cluster', cov_kwds={'groups': groups})
    return m.fit()


def fit_summary(res, keys):
    return {'n': int(res.nobs), 'r2': float(res.rsquared), 'adjR2': float(res.rsquared_adj),
            'coefficients': {k: {'estimate': float(res.params[k]), 'se': float(res.bse[k]), 'p': float(res.pvalues[k])} for k in keys}}


def demean(df, cols, by):
    return df[cols] - df.groupby(by)[cols].transform('mean')


def collinearity(X: pd.DataFrame) -> dict:
    Z = X.dropna().to_numpy(float)
    Zc = Z - Z.mean(axis=0)
    return {'rank': int(np.linalg.matrix_rank(Zc)), 'columns': Z.shape[1], 'conditionNumber': float(np.linalg.cond(Zc)),
            'vif': [float(variance_inflation_factor(sm.add_constant(Zc), i + 1)) for i in range(Z.shape[1])],
            'correlation': float(np.corrcoef(Zc.T)[0, 1]) if Z.shape[1] == 2 else None}


def levels(p: pd.DataFrame) -> dict:
    """Association in levels: pooled, within-world (world effects) and between-world (world means), per spec."""
    out = {}
    for side in ('ask', 'bid'):
        y = f'log_{side}'
        for spec, comps in COMPONENTS.items():
            xs = [f'log_{c}' for c in comps]
            d = p[[y, *xs, 'world']].dropna()
            pooled = ols(d[y], d[xs])
            within_d = demean(d, [y, *xs], 'world')
            within = sm.OLS(within_d[y], within_d[xs]).fit(cov_type='cluster', cov_kwds={'groups': pd.factorize(d['world'])[0]})
            means = d.groupby('world')[[y, *xs]].mean()
            between = ols(means[y], means[xs])
            entry = {'pooled': fit_summary(pooled, xs), 'withinWorld': {'n': int(within.nobs), 'r2Within': float(within.rsquared),
                     'coefficients': {k: {'estimate': float(within.params[k]), 'se': float(within.bse[k]), 'p': float(within.pvalues[k])} for k in xs}},
                     'betweenWorld': fit_summary(between, xs), 'worlds': int(d['world'].nunique())}
            if spec == 'D':
                entry['collinearity'] = collinearity(d[xs])
            out[f'{side}.{spec}'] = entry
    return out


def unit_roots(p: pd.DataFrame) -> dict:
    res = {}
    for col in ('log_ask', 'log_grossPotential'):
        pvals = []
        for _, g in p.groupby('world'):
            s = g[col].dropna()
            if len(s) >= 52:
                try:
                    pvals.append(adfuller(s, autolag='AIC')[1])
                except Exception:  # noqa: BLE001 - a degenerate series is skipped and counted
                    pass
        res[col] = {'worlds': len(pvals), 'rejectUnitRootAt5pct': int(sum(x < 0.05 for x in pvals)), 'medianP': float(np.median(pvals)) if pvals else None}
    return res


def changes(p: pd.DataFrame) -> dict:
    """Within-world weekly log changes on lagged component changes, world and week effects, two-way clustered SEs."""
    p = p.copy()
    full = []
    for world, g in p.groupby('world'):
        g = g.set_index('week').asfreq('W-SUN')
        g['world'] = world
        for c in ('ask', 'bid', 'directCoins', 'npcPotential', 'grossPotential', 'playerDeaths'):
            g[f'd_{c}'] = np.log(g[c]).diff()
        full.append(g.reset_index())
    q = pd.concat(full, ignore_index=True)
    out = {}
    lags = (0, 1, 2, 4, 8, 13)
    for side in ('ask', 'bid'):
        for spec, comps in {**COMPONENTS, 'E': ['grossPotential', 'playerDeaths']}.items():
            cols = []
            for c in comps:
                for k in lags:
                    q[f'd_{c}_l{k}'] = q.groupby('world')[f'd_{c}'].shift(k)
                    cols.append(f'd_{c}_l{k}')
            d = q[['world', 'week', f'd_{side}', *cols]].dropna()
            if len(d) < 100:
                continue
            Y = demean(d, [f'd_{side}', *cols], 'world')
            Y = Y - Y.groupby(d['week']).transform('mean')  # week effects (common shocks)
            groups = np.column_stack([pd.factorize(d['world'])[0], pd.factorize(d['week'])[0]])
            res = sm.OLS(Y[f'd_{side}'], Y[cols]).fit(cov_type='cluster', cov_kwds={'groups': groups})
            entry = {'n': int(res.nobs), 'worlds': int(d['world'].nunique()), 'weeks': int(d['week'].nunique()), 'r2Within': float(res.rsquared),
                     'lagsWeeks': list(lags), 'coefficients': {k: {'estimate': float(res.params[k]), 'se': float(res.bse[k]), 'p': float(res.pvalues[k])} for k in cols},
                     'jointF': {'stat': float(res.f_test(np.eye(len(cols))).statistic), 'p': float(res.f_test(np.eye(len(cols))).pvalue)}}
            if spec == 'D':
                entry['collinearity'] = collinearity(d[[f'd_{c}_l0' for c in comps]])
            out[f'{side}.{spec}'] = entry
    return out


def divergence(p: pd.DataFrame) -> dict:
    """Late 2025: weeks where 13-week growth of gold potential was positive while 13-week price growth was negative."""
    rows = []
    for world, g in p.groupby('world'):
        g = g.set_index('week').asfreq('W-SUN')
        gold = np.log(g['grossPotential']).diff(13)
        stable = np.log(g['grossStable']).diff(13)
        deaths = np.log(g['playerDeaths']).diff(13)
        price = np.log(g['ask']).diff(13)
        window = (g.index >= '2025-08-01') & (g.index <= '2026-02-28')
        both = ((gold > 0) & (price < 0))[window]
        if both.dropna().empty:
            continue
        weeks = both[both.fillna(False)].index
        yoy = np.log(g['grossPotential']).diff(52)[window]
        rows.append({'world': world, 'weeksChecked': int(both.notna().sum()), 'divergentWeeks': int(both.sum()),
                     'first': str(weeks.min().date()) if len(weeks) else None, 'last': str(weeks.max().date()) if len(weeks) else None,
                     'meanGoldGrowth13w': float(gold[window].mean()), 'meanStableGoldGrowth13w': float(stable[window].mean()),
                     'meanPlayerDeathsGrowth13w': float(deaths[window].mean()), 'meanPriceGrowth13w': float(price[window].mean()),
                     'meanGoldGrowthYoY': float(yoy.mean()) if yoy.notna().any() else None})
    rows.sort(key=lambda r: -r['divergentWeeks'])
    return {'window': ['2025-08-01', '2026-02-28'], 'worlds': rows,
            'worldsWithMajorityDivergent': sum(r['divergentWeeks'] > r['weeksChecked'] / 2 for r in rows), 'worldsChecked': len(rows)}


def divergence_by_quarter(p: pd.DataFrame) -> dict:
    """Narrower than the rolling check: per world and calendar quarter, the change on the previous quarter of total
    gross potential (and of the constant creature set) and of the median weekly Sell Offer. Only quarters where both
    quarters have all 13 or so weeks are compared. Every quarter is reported, so late 2025 is read against the others
    (seasonality) rather than alone."""
    q = p.assign(quarter=p['week'].dt.to_period('Q'))
    g = q.groupby(['world', 'quarter']).agg(gross=('grossPotential', 'sum'), stable=('grossStable', 'sum'), deaths=('playerDeaths', 'sum'),
                                             ask=('ask', 'median'), weeks=('week', 'size')).reset_index()
    full = g['weeks'] >= 12
    g = g[full].sort_values(['world', 'quarter'])
    for c in ('gross', 'stable', 'deaths', 'ask'):
        g[f'd_{c}'] = np.log(g[c]).groupby(g['world']).diff()
    g['consecutive'] = g.groupby('world')['quarter'].diff().apply(lambda d: getattr(d, 'n', None) == 1)
    g = g[g['consecutive'] & g['d_gross'].notna() & g['d_ask'].notna()]
    out = []
    for quarter, x in g.groupby('quarter'):
        div = (x['d_gross'] > 0) & (x['d_ask'] < 0)
        out.append({'quarter': str(quarter), 'worlds': int(len(x)), 'goldUpPriceDown': int(div.sum()),
                    'goldUpPriceDownStable': int(((x['d_stable'] > 0) & (x['d_ask'] < 0)).sum()),
                    'goldUp': int((x['d_gross'] > 0).sum()), 'priceDown': int((x['d_ask'] < 0).sum()),
                    'medianGoldChange': float(x['d_gross'].median()), 'medianStableChange': float(x['d_stable'].median()),
                    'medianDeathsChange': float(x['d_deaths'].median()), 'medianPriceChange': float(x['d_ask'].median()),
                    'correlation': float(x['d_gross'].corr(x['d_ask'])) if len(x) > 2 else None})
    return {'note': 'log change on the previous quarter; quarters with at least 12 analysed weeks on both sides', 'quarters': out}


# Forecasting -----------------------------------------------------------------------------------------------------

def pit_growth() -> dict[pd.Timestamp, pd.DataFrame]:
    """For each monthly point-in-time build: per world and week, the 13-week log growth of each component."""
    out = {}
    if not PIT.exists():
        return out
    for build in sorted(PIT.iterdir()):
        if not (build / 'index.json').exists():
            continue
        asof = pd.Timestamp(json.loads((build / 'index.json').read_text())['mode']['asOf']).tz_localize(None)
        w = gold_weekly(gold_daily(build)).set_index(['world', 'week'])
        frames = []
        for world, g in w.groupby(level='world'):
            g = g.droplevel('world').asfreq('W-SUN')
            f = pd.DataFrame({c: np.log(g[c]).diff(GROWTH_WEEKS) for c in ('directCoins', 'npcPotential', 'grossPotential', 'playerDeaths')})
            f['coverage'] = g['coverage']
            f['world'] = world
            frames.append(f.reset_index())
        out[asof] = pd.concat(frames, ignore_index=True)
    return out


def features_at(builds: dict, origin: pd.Timestamp) -> pd.DataFrame:
    """The features known at an origin: from the latest build made by then (only evidence published by the origin),
    each world's latest complete week on or before it (an unfinished trailing week has no growth). Monthly builds
    leave features up to about five weeks old; the caller drops older ones and reports the age."""
    eligible = [a for a in builds if a <= origin]
    if not eligible:
        return pd.DataFrame(columns=['week', 'directCoins', 'npcPotential', 'grossPotential', 'playerDeaths', 'coverage']).rename_axis('world')
    build = builds[max(eligible)]
    known = build[build['week'] <= origin].replace([np.inf, -np.inf], np.nan).dropna(subset=['grossPotential', 'coverage'])
    return known.sort_values('week').groupby('world').tail(1).set_index('world')


def dm_test(e_base, e_model, h):
    """Diebold-Mariano on squared errors with a Newey-West variance (h - 1 lags); negative: the model is better."""
    d = np.asarray(e_model) ** 2 - np.asarray(e_base) ** 2
    n = len(d)
    if n < 10:
        return None
    mean = d.mean()
    gamma = [np.sum((d[k:] - mean) * (d[:n - k] - mean)) / n for k in range(h)]
    var = gamma[0] + 2 * sum((1 - k / h) * gamma[k] for k in range(1, h))
    if var <= 0:
        return None
    stat = mean / math.sqrt(var / n)
    from scipy.stats import norm
    return {'stat': float(stat), 'p': float(2 * (1 - norm.cdf(abs(stat))))}


def forecasting(p: pd.DataFrame) -> dict:
    builds = pit_growth()
    if not builds:
        return {'status': 'no point-in-time builds; run tools/economy/build_gold.mjs --as-of for monthly cutoffs'}
    prices = {w: g.set_index('week')['ask'].asfreq('W-SUN') for w, g in p.groupby('world')}
    asofs = sorted(builds)
    origins = pd.date_range(max(asofs[0], pd.Timestamp('2024-07-07')), p['week'].max(), freq='W-SUN')
    records = []
    for origin in origins:
        feat = features_at(builds, origin)
        for h in HORIZONS:
            for world, s in prices.items():
                if origin not in s.index or (origin + pd.Timedelta(weeks=h)) not in s.index:
                    continue
                p0, p1 = s.get(origin), s.get(origin + pd.Timedelta(weeks=h))
                if not (p0 and p1 and p0 > 0 and p1 > 0) or world not in feat.index:
                    continue
                x = feat.loc[world]
                if not (x['coverage'] >= MIN_COVERAGE) or x['week'] < origin - pd.Timedelta(weeks=MAX_FEATURE_AGE_WEEKS):
                    continue
                records.append({'origin': origin, 'h': h, 'world': world, 'y': math.log(p1 / p0), 'p0': p0, 'p1': p1,
                                'age': int((origin - x['week']).days // 7),
                                **{f'x_{c}': x[c] for c in ('directCoins', 'npcPotential', 'grossPotential', 'playerDeaths')}})
    data = pd.DataFrame(records).replace([np.inf, -np.inf], np.nan).dropna()
    if data.empty:
        return {'status': 'no origin has point-in-time features yet (builds through ' + str(asofs[-1].date()) + ')'}
    models = {'drift': [], 'A': ['x_directCoins'], 'B': ['x_npcPotential'], 'C': ['x_grossPotential'], 'D': ['x_directCoins', 'x_npcPotential'],
              'E': ['x_grossPotential', 'x_playerDeaths']}
    preds = []
    for h in HORIZONS:
        dh = data[data['h'] == h]
        for origin, test in dh.groupby('origin'):
            train = dh[dh['origin'] + pd.Timedelta(weeks=h) <= origin]  # targets realised by the origin
            if len(train) < 52:
                continue
            row = {'constant': np.zeros(len(test))}
            for name, xs in models.items():
                Xtr = sm.add_constant(train[xs], has_constant='add') if xs else np.ones((len(train), 1))
                beta = np.linalg.lstsq(np.asarray(Xtr, float), train['y'].to_numpy(float), rcond=None)[0]
                Xte = sm.add_constant(test[xs], has_constant='add') if xs else np.ones((len(test), 1))
                row[name] = np.asarray(Xte, float) @ beta
            for i, (_, t) in enumerate(test.iterrows()):
                preds.append({'h': h, 'origin': origin, 'world': t['world'], 'y': t['y'], 'p0': t['p0'], 'p1': t['p1'], **{k: float(v[i]) for k, v in row.items()}})
    pr = pd.DataFrame(preds)
    out = {'origins': [str(origins[0].date()), str(origins[-1].date())] if len(origins) else None, 'growthWeeks': GROWTH_WEEKS,
           'featureAgeWeeks': {'max': MAX_FEATURE_AGE_WEEKS, 'mean': float(data['age'].mean()), 'distribution': {str(k): int(v) for k, v in data['age'].value_counts().sort_index().items()}},
           'builds': [str(a.date()) for a in asofs], 'byHorizon': {}}
    for h in HORIZONS:
        q = pr[pr['h'] == h]
        if q.empty:
            continue
        res = {'n': int(len(q)), 'worlds': int(q['world'].nunique()), 'origins': int(q['origin'].nunique()), 'models': {}}
        for m in ['constant', *models]:
            e = q['y'] - q[m]
            price_pred = q['p0'] * np.exp(q[m])
            res['models'][m] = {'maeLogPct': float(100 * e.abs().mean()), 'rmseLogPct': float(100 * math.sqrt((e ** 2).mean())),
                                'mape': float(100 * ((price_pred - q['p1']).abs() / q['p1']).mean()),
                                'smape': float(100 * (2 * (price_pred - q['p1']).abs() / (price_pred.abs() + q['p1'].abs())).mean()),
                                'biasLogPct': float(100 * (q[m] - q['y']).mean())}
            if m != 'constant':
                # Paired over origins (cross-world errors averaged per origin) to respect dependence.
                per = q.assign(eb=q['y'] - q['constant'], em=e).groupby('origin')[['eb', 'em']].mean()
                res['models'][m]['dmVsConstant'] = dm_test(per['eb'], per['em'], h)
                if m != 'drift':
                    per2 = q.assign(eb=q['y'] - q['drift'], em=e).groupby('origin')[['eb', 'em']].mean()
                    res['models'][m]['dmVsDrift'] = dm_test(per2['eb'], per2['em'], h)
        out['byHorizon'][str(h)] = res
    return out


def population(p: pd.DataFrame) -> dict:
    """The TibiaVIP snapshot (2026-10-13): one instant, so a cross-section only, labelled as such."""
    path = ROOT / 'data' / 'economy' / 'population' / 'tibiavip-snapshot' / '2026-10-13.json'
    if not path.exists():
        return {'status': 'no snapshot'}
    snap = json.loads(path.read_text())
    known = {o['world']: o['value'] for o in snap['observations'] if o['metric'] == 'characters-known-total'}
    online = {o['world']: o['value'] for o in snap['observations'] if o['metric'] == 'characters-online'}
    recent = p[p['week'] >= p['week'].max() - pd.Timedelta(weeks=12)].groupby('world').agg(price=('ask', 'median'), gross=('grossPotential', 'mean'))
    recent = recent[recent.index.isin(known)]
    recent['known'] = [known[w] for w in recent.index]
    recent['online'] = [online[w] for w in recent.index]
    d = recent[(recent['gross'] > 0) & (recent['online'] > 0)]
    if len(d) < 10:
        return {'status': 'too few worlds', 'n': int(len(d))}
    res = {}
    for name, x in {'grossPerKnownCharacter': np.log(d['gross'] / d['known']), 'grossPerOnlineCharacter': np.log(d['gross'] / d['online']), 'gross': np.log(d['gross'])}.items():
        r = ols(np.log(d['price']), x.rename(name))
        res[name] = fit_summary(r, [name])
    return {'snapshot': '2026-10-13', 'worlds': int(len(d)), 'priceWindow': 'median Sell Offer over the last 13 weeks', 'goldWindow': 'mean weekly gross potential over the same weeks',
            'note': 'One instant of TibiaVIP counts: a cross-sectional association only; "known characters" is not an active population.', 'models': res}


def clean(o):
    """Strict JSON: non-finite numbers become null (a browser cannot parse NaN), numpy scalars become numbers."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return float(o) if math.isfinite(o) else None
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return str(o.date())
    return o


def main():
    p, meta = panel()
    results = {'format': 1, 'meta': meta, 'minCoverage': MIN_COVERAGE, 'levels': levels(p), 'unitRoots': unit_roots(p), 'changes': changes(p),
               'divergence': divergence(p), 'divergenceByQuarter': divergence_by_quarter(p), 'forecasting': forecasting(p), 'population': population(p),
               'reference': 'The owner recalls about 45% of TC price variation explained by gold generation in earlier work; it is a reference, not a target, and nothing here is tuned toward it.'}
    OUT.write_text(json.dumps(clean(results), indent=1, allow_nan=False) + '\n')
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
