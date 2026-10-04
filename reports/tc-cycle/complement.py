"""Complement to analyze.py: the analyses of the received package that the offer-only edition had
set aside, recomputed exclusively on sell_offer / buy_offer with analyze.py's own cleaning rules,
server day (10:00 Europe/Berlin) and weekly grid (weeks ending Sunday).

Reads inputs/, results.json and the received package's forecast outputs (only to compare against
them, never as model input). Writes complement.json. Never reads day_average_* / month_average_*.

The universe (every world analyze.py modelled from market-update.json) is read from results.json; no world list lives here.

Run after analyze.py and compare_trades.py. Needs numpy, pandas, scipy and statsmodels.
Every random draw is seeded, so a rerun reproduces complement.json exactly.
"""
from pathlib import Path
import json, hashlib, math, warnings
import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.discrete.discrete_model import Logit

warnings.filterwarnings('ignore')
ROOT = Path(__file__).resolve().parent
SIDES = {'ask': 'sell_offer', 'bid': 'buy_offer'}
from research_data import research_cutoff, load_daily, load_captures, weekly_series, window_quote, slippage_bound
ASOF = research_cutoff()
T0 = pd.Timestamp('2023-01-01')
WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
FEE = 0.02          # tibia.com manual: 2% of the offer price, min 20 gp, max 1,000,000 gp, paid when the offer is placed
MIN_LEG_WEEKS = 8   # swings shorter than this are counter-moves inside a phase, not cycle legs
BREAK_PCT = 15      # a premium level shift at least this large splits a world's series
N_DRAWS = 300       # parameter vectors drawn from the fitted distribution per simulation
PATHS_PER_DRAW = 20 # shock paths simulated for each parameter draw


def js(x):
    if isinstance(x, dict): return {str(k): js(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [js(v) for v in x]
    if isinstance(x, np.generic): return js(x.item())
    if isinstance(x, pd.Timestamp): return str(x.date())
    if isinstance(x, float) and not math.isfinite(x): return None
    return x


def pct(logv): return float(np.expm1(logv) * 100)
def week_of(d): return pd.Timestamp(d).to_period('W-SUN').end_time.normalize()  # W-SUN label, Sunday-safe


# ---------------------------------------------------------------- data (identical rules to analyze.py)
def load(w):
    return load_daily(w, ASOF)


results = json.load(open(ROOT / 'results.json'))
A = results['benchmark']
WORLDS = [m['world'] for m in results['worlds']]
OTHERS = [w for w in WORLDS if w != A]  # every other world is measured against the benchmark
PRED = [p['world'] for p in results['predecessor']]
captures = load_captures(ASOF)
daily = {w: load(w) for w in WORLDS + PRED}
weekly = {w: weekly_series(d, ASOF) for w, d in daily.items()}
# One point per week (the last server day with a quote). Changes of weekly medians are smoothed and
# autocorrelated by construction; point changes are not, so dependence and volatility use these.
point = {w: weekly_series(d, ASOF, 'last') for w, d in daily.items()}
# The complement must stand on exactly the weekly series the edition published.
hist = pd.DataFrame(results['history'])
for w in WORLDS + PRED:
    pub = hist[hist.world == w].set_index(pd.to_datetime(hist[hist.world == w].date))[['ask', 'bid']]
    assert np.allclose(pub.to_numpy(dtype=float), weekly[w].to_numpy(dtype=float), equal_nan=True), w
latest = {m['world']: m for m in results['worlds']}
anchor_date = pd.Timestamp(latest[A]['date'])
anchor_week = week_of(anchor_date)
antica_caps = sorted([c for c in captures if c['world'] == A], key=lambda c: c['capturedAt'])


# ---------------------------------------------------------------- 1. swings (zigzag) on Antica weekly offers
def zigzag(s, thr):
    """Pivots on log prices. A pivot is confirmed only once price has retraced `thr` from it,
    so the last leg is always provisional. Same reversal rule as the received package's zig()."""
    s = np.log(s.dropna()); up, down = np.log(1 + thr), np.log(1 / (1 - thr))
    hi = lo = (s.index[0], s.iloc[0]); trend = 0; piv = []; ext = None
    for t, v in s.items():
        if trend == 0:
            if v > hi[1]: hi = (t, v)
            if v < lo[1]: lo = (t, v)
            if hi[1] - lo[1] >= up and hi[0] > lo[0]: piv = [('T',) + lo]; trend = 1; ext = hi
            elif hi[1] - lo[1] >= up and lo[0] > hi[0]: piv = [('P',) + hi]; trend = -1; ext = lo
        elif trend == 1:
            if v > ext[1]: ext = (t, v)
            elif ext[1] - v >= down: piv.append(('P',) + ext); trend = -1; ext = (t, v)
        else:
            if v < ext[1]: ext = (t, v)
            elif v - ext[1] >= up: piv.append(('T',) + ext); trend = 1; ext = (t, v)
    return piv


cap_median = {side: float(np.median([c['sell' if side == 'ask' else 'buy'] for c in antica_caps])) for side in SIDES}
swings = {'threshold': 0.05, 'minLegWeeks': MIN_LEG_WEEKS, 'sides': {}, 'sensitivity': []}
for side in SIDES:
    s = weekly[A][side]; first = s.dropna().index[0]
    piv = zigzag(s, 0.05)
    legs = []
    for a, b in zip(piv[:-1], piv[1:]):
        weeks = int((b[1] - a[1]).days // 7)
        # censored: starts on the first observation, the true extreme may lie before the data.
        # short: a counter-move inside a phase (e.g. the four-week winter dip of Buy Offers in 2025-26).
        legs.append({'from': a[0], 'start': str(a[1].date()), 'end': str(b[1].date()), 'startLevel': float(np.exp(a[2])),
                     'endLevel': float(np.exp(b[2])), 'changePct': pct(b[2] - a[2]), 'weeks': weeks,
                     'direction': 'alta' if a[0] == 'T' else 'queda', 'censored': bool(a[1] == first), 'short': weeks < MIN_LEG_WEEKS})
    cycle = [l for l in legs if not l['censored'] and not l['short']]
    ups = [l for l in cycle if l['direction'] == 'alta']
    # A cycle decline is the fall that follows a complete rise: peak (autumn) to the next trough (summer).
    declines = [d for u, d in zip(legs[:-1], legs[1:]) if u in ups and d['direction'] == 'queda' and not d['short']]
    last = next(p for p in reversed(piv) if p[0] == 'T')
    now = latest[A][side]; lastw = s.dropna()
    current = {'start': str(last[1].date()), 'startLevel': float(np.exp(last[2])), 'end': str(anchor_date.date()), 'endLevel': now,
               'changePct': pct(np.log(now) - last[2]), 'weeks': int((anchor_date - last[1]).days // 7), 'provisional': True,
               'lastWeekly': str(lastw.index[-1].date()), 'lastWeeklyLevel': float(lastw.iloc[-1]),
               'toLastWeeklyPct': pct(np.log(lastw.iloc[-1]) - last[2]),
               'captureMedian': cap_median[side], 'toCaptureMedianPct': pct(np.log(cap_median[side]) - last[2]),
               'captureDates': [c['capturedAt'][:10] for c in antica_caps]}
    # Retracement in price terms: share of the preceding rise given back by the decline.
    retr = [{'peak': u['end'], 'retracePct': (u['endLevel'] - d['endLevel']) / (u['endLevel'] - u['startLevel']) * 100}
            for u, d in zip(legs[:-1], legs[1:]) if u in ups and d in declines]
    compare = [{'start': u['start'], 'end': u['end'], 'changePct': u['changePct'], 'weeks': u['weeks'],
                'impliedEnd': str((pd.Timestamp(current['start']) + pd.Timedelta(weeks=u['weeks'])).date()),
                'impliedLevel': current['startLevel'] * (1 + u['changePct'] / 100)} for u in ups]
    # Weekly labels put every peak in November; on daily data (7-day centred median) the top is often
    # a plateau that starts in October. Record the daily maximum and the span within 2% of it.
    r7 = daily[A][side].asfreq('D').rolling(7, center=True, min_periods=4).median()
    for u, d in zip(legs[:-1], legs[1:]):
        if u in ups and d in declines:
            win = r7[pd.Timestamp(u['start']):pd.Timestamp(d['end'])].ffill(); top = win.idxmax(); hi = win.max()
            near = win >= .98 * hi; lo_ = top; hi_ = top
            while lo_ - pd.Timedelta(days=1) in near.index and near[lo_ - pd.Timedelta(days=1)]: lo_ -= pd.Timedelta(days=1)
            while hi_ + pd.Timedelta(days=1) in near.index and near[hi_ + pd.Timedelta(days=1)]: hi_ += pd.Timedelta(days=1)
            u.update({'dailyPeakDate': str(top.date()), 'plateauStart': str(lo_.date()), 'plateauEnd': str(hi_.date()), 'plateauDays': int((hi_ - lo_).days + 1)})
    prev = s[s.index < '2026-01-01']
    current.update({'weeksToLastWeekly': int((lastw.index[-1] - last[1]).days // 7), 'previousPeak': float(prev.max()), 'previousPeakWeek': str(prev.idxmax().date()),
                    'aboveAllPreviousPeaksPct': pct(np.log(now) - np.log(prev.max()))})
    swings['sides'][side] = {'pivots': [{'type': p[0], 'date': str(p[1].date()), 'level': float(np.exp(p[2]))} for p in piv],
                             'legs': legs, 'current': current, 'declines': declines, 'retracements': retr, 'currentVsPastRises': compare,
                             'stats': {'upN': len(ups), 'upMedianPct': float(np.median([l['changePct'] for l in ups])),
                                       'upMedianWeeks': float(np.median([l['weeks'] for l in ups])),
                                       'declineN': len(declines), 'declineMedianPct': float(np.median([l['changePct'] for l in declines])),
                                       'declineMedianWeeks': float(np.median([l['weeks'] for l in declines]))}}
    for thr in (0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10):
        p = zigzag(s, thr)
        swings['sensitivity'].append({'side': side, 'threshold': thr, 'pivots': len(p),
                                      'peaks': [str(x[1].date()) for x in p if x[0] == 'P'],
                                      'troughs': [str(x[1].date()) for x in p if x[0] == 'T']})


# ---------------------------------------------------------------- 2. volatility, dependence, spread
def consecutive_changes(s, days):
    s = np.log(s.dropna()); gap = s.index.to_series().diff().dt.days
    return (s - s.shift(1))[gap == days].dropna()


def exact_changes(s, days):
    s = np.log(s.dropna()); lagged = s.reindex(s.index - pd.Timedelta(days=days)).to_numpy()
    return pd.Series(s.to_numpy() - lagged, index=s.index).dropna()


def describe(x):
    return {'n': int(len(x)), 'stdPct': float(x.std() * 100), 'medianAbsPct': float(x.abs().median() * 100),
            'p90AbsPct': float(x.abs().quantile(.9) * 100), 'maxUpPct': pct(x.max()), 'maxDownPct': pct(x.min())}


volatility = {'antica': [], 'byYear': [], 'worlds': []}
for side in SIDES:
    d = consecutive_changes(daily[A][side], 1); wp = consecutive_changes(point[A][side], 7)
    wm = consecutive_changes(weekly[A][side], 7); d7 = exact_changes(daily[A][side], 7)
    volatility['antica'] += [{'side': side, 'basis': 'diária (dias consecutivos)', **describe(d)},
                             {'side': side, 'basis': 'semanal (um ponto por semana)', **describe(wp)},
                             {'side': side, 'basis': 'sete dias exatos', **describe(d7)},
                             {'side': side, 'basis': 'mediana semanal (suavizada)', **describe(wm)}]
    for yr in sorted(set(wp.index.year)):
        wy = wp[wp.index.year == yr]; dy = d[d.index.year == yr]
        volatility['byYear'].append({'side': side, 'year': int(yr), 'weeklyStdPct': float(wy.std() * 100), 'weeklyN': int(len(wy)),
                                     'dailyMedianAbsPct': float(dy.abs().median() * 100), 'dailyN': int(len(dy))})
    ra = np.log(point[A][side]).diff()
    for wd in OTHERS:
        # Same basis (one point per week) and the same weeks for the world and for Antica.
        rw = np.log(point[wd][side]).diff()
        both = pd.concat([rw, ra], axis=1, keys=['w', 'a']).dropna()
        ok = len(both) >= 10
        volatility['worlds'].append({'world': wd, 'side': side, 'n': int(len(both)),
                                     'weeklyStdPct': float(both.w.std() * 100) if ok else None,
                                     'anticaSameWeeksStdPct': float(both.a.std() * 100) if ok else None,
                                     'ratio': float(both.w.std() / both.a.std()) if ok else None,
                                     'medianDaysPerWeek': float(daily[wd].resample('W-SUN').size().replace(0, np.nan).median())})


def null_acf(side, sims=1000, seed=7):
    """ACF of weekly changes under 'random walk + independent daily quote noise', simulated on Antica's
    actual quote days and calibrated to its 1-day and 7-day change variances."""
    s = np.log(daily[A][side]); v1 = exact_changes(daily[A][side], 1).var(); v7 = exact_changes(daily[A][side], 7).var()
    walk = max((v7 - v1) / 6, 1e-12); noise = max((v1 - walk) / 2, 0.0)
    days = pd.date_range(s.index.min(), s.index.max(), freq='D'); keep = days.isin(s.index)
    rng = np.random.default_rng(seed)
    x = np.cumsum(rng.normal(0, np.sqrt(walk), (sims, len(days))), axis=1)[:, keep] + rng.normal(0, np.sqrt(noise), (sims, keep.sum()))
    wk = pd.DatetimeIndex(days[keep]).to_period('W-SUN').to_numpy()
    labels, idx = np.unique(wk, return_inverse=True)
    med = np.stack([np.median(x[:, idx == i], axis=1) for i in range(len(labels))], axis=1)
    last = np.stack([x[:, np.where(idx == i)[0][-1]] for i in range(len(labels))], axis=1)
    out = {}
    for name, series_ in (('point', last), ('median', med)):
        r = np.diff(series_, axis=1)
        out[name] = [{'lag': lag, 'mean': float(np.mean(v := [np.corrcoef(r[k, lag:], r[k, :-lag])[0, 1] for k in range(sims)])),
                      'p05': float(np.percentile(v, 5)), 'p95': float(np.percentile(v, 95))} for lag in range(1, 5)]
    return {'walkSdPct': float(np.sqrt(walk) * 100), 'noiseSdPct': float(np.sqrt(noise) * 100), **out}


def harmonics(idx):
    t = np.asarray((pd.DatetimeIndex(idx) - T0).days / 365.25)
    return np.column_stack([np.ones(len(t)), np.sin(2 * np.pi * t), np.cos(2 * np.pi * t), np.sin(4 * np.pi * t), np.cos(4 * np.pi * t)])


def deseason(x):
    # Descriptive: the annual cycle fitted on the whole sample (two harmonics plus a constant).
    b = np.linalg.lstsq(harmonics(x.index), x.to_numpy(), rcond=None)[0]
    return x - harmonics(x.index) @ b, pd.Series(harmonics(x.index) @ b, index=x.index)


momentum = {}
for side in SIDES:
    s = np.log(point[A][side]); r = s.diff()  # NaN wherever either week is missing
    rd, _ = deseason(r.dropna()); rd = rd.reindex(r.index)
    acf = []
    wmr = np.log(weekly[A][side]).diff()
    for lag in range(1, 5):
        pair = pd.concat([r, r.shift(lag)], axis=1).dropna(); wpair = pd.concat([wmr, wmr.shift(lag)], axis=1).dropna()
        dpair = pd.concat([rd, rd.shift(lag)], axis=1).dropna()
        acf.append({'lag': lag, 'r': float(pair.corr().iloc[0, 1]), 'n': int(len(pair)), 'rWeeklyMedian': float(wpair.corr().iloc[0, 1]),
                    'rDeseasonalised': float(dpair.corr().iloc[0, 1])})
    past4 = s - s.shift(4); fwd4 = s.shift(-4) - s
    both = pd.concat([past4, fwd4], axis=1, keys=['past', 'fwd']).dropna()
    # Seasonal expectation of each 4-week forward move, from the same harmonic fit of weekly changes.
    _, fitted = deseason(r.dropna()); seas4 = fitted.reindex(r.index).rolling(4).sum().shift(-4)
    q80 = both.past.quantile(.8); q20 = both.past.quantile(.2)

    def cond(mask, label):
        x = both.fwd[mask]; dates = x.index
        # Episodes: runs of qualifying weeks no more than one week apart.
        episodes = int(1 + (pd.Series(dates).diff().dt.days > 7).sum()) if len(dates) else 0
        runs = []
        for t in dates:
            if runs and (t - runs[-1][1]).days <= 7: runs[-1][1] = t
            else: runs.append([t, t])
        # Same calendar months in other years: how much of the edge the season alone explains.
        pools = [both.fwd[(both.index.month == t.month) & (both.index.year != t.year)] for t in dates]
        pools = [p for p in pools if len(p)]
        # Non-overlapping subsamples: every fourth week, four offsets.
        sub = [x[x.index.isin(both.index[k::4])] for k in range(4)]
        adj = (x - seas4.reindex(x.index)).dropna()
        # De-clustered, as the received package did: qualifying weeks at least 21 days apart vs every other week.
        keep = []
        for t in dates:
            if not keep or (t - keep[-1]).days >= 21: keep.append(t)
        # Tested on season-adjusted moves, so the season alone cannot produce a difference.
        adj_all = (both.fwd - seas4.reindex(both.index)).dropna(); rest = adj_all[~adj_all.index.isin(dates)]
        mw = mannwhitneyu(adj_all.reindex(keep).dropna(), rest, alternative='two-sided').pvalue if len(keep) >= 3 and len(x) < len(both) else None
        return {'condition': label, 'n': int(len(x)), 'episodes': episodes,
                'episodeRanges': [[str(a.date()), str(b.date())] for a, b in runs] if len(x) < len(both) else [], 'medianFwdPct': pct(x.median()), 'shareUp': float((x > 0).mean()),
                'monthMatchedShareUp': float(np.mean([(p > 0).mean() for p in pools])) if pools else None,
                'monthMatchedMedianFwdPct': pct(np.median([p.median() for p in pools])) if pools else None,
                'nonOverlapShareUp': [float((v > 0).mean()) for v in sub if len(v)], 'nonOverlapN': [int(len(v)) for v in sub],
                'seasonAdjMedianFwdPct': pct(adj.median()) if len(adj) else None, 'seasonAdjShareUp': float((adj > 0).mean()) if len(adj) else None,
                'declustered': len(keep), 'declusteredMedianFwdPct': pct(x[keep].median()) if keep else None, 'declusteredP': mw}
    lastp = s.dropna()
    ref_week = anchor_week - pd.Timedelta(weeks=4)
    momentum[side] = {'acf': acf, 'band': float(1.96 / np.sqrt(acf[0]['n'])), 'null': null_acf(side),
                      'dailyLag1': float(consecutive_changes(daily[A][side], 1).autocorr()),
                      'conditional': [cond(both.past >= q80, 'após alta forte (20% maiores altas em 4 semanas)'),
                                      cond(both.past <= q20, 'após queda forte (20% maiores quedas em 4 semanas)'),
                                      cond(both.past == both.past, 'todas as semanas')],
                      'thresholdUpPct': pct(q80), 'thresholdDownPct': pct(q20),
                      'historicalPast4Pct': pct(lastp.iloc[-1] - s.get(lastp.index[-1] - pd.Timedelta(weeks=4), np.nan)),
                      'historicalWeek': str(lastp.index[-1].date()),
                      # The capture is the current anchor everywhere else; measure the same 4 weeks back from its week.
                      'anchorPast4Pct': pct(np.log(latest[A][side]) - s.get(ref_week, np.nan)), 'anchorRefWeek': str(ref_week.date())}

spread = {'anticaByYear': [], 'anticaMonthEffect': [], 'worlds': []}
a = daily[A]; rel = (1 - a.bid / a.ask) * 100
for yr in sorted(set(rel.index.year)):
    x = rel[rel.index.year == yr]
    spread['anticaByYear'].append({'year': int(yr), 'medianPct': float(x.median()), 'p90Pct': float(x.quantile(.9)), 'n': int(len(x))})
full_years = rel[(rel.index.year >= 2023) & (rel.index.year <= 2025)]
demeaned = full_years - full_years.groupby(full_years.index.year).transform('median')
for mo in range(1, 13):
    x = demeaned[demeaned.index.month == mo]
    spread['anticaMonthEffect'].append({'month': mo, 'effectPp': float(x.median()), 'n': int(len(x))})
for w in WORLDS:
    d = daily[w]; x = (1 - d.bid / d.ask) * 100; recent = x[x.index > ASOF - pd.Timedelta(days=180)]
    spread['worlds'].append({'world': w, 'historyMedianPct': float(x.median()), 'recentMedianPct': float(recent.median()) if len(recent) else None,
                             'shareRecentAtLeastNow': float((recent >= latest[w]['costPct']).mean()) if len(recent) else None,
                             'recentN': int(len(recent)), 'nowPct': latest[w]['costPct'], 'nowDate': latest[w]['date'], 'n': int(len(x))})


# ---------------------------------------------------------------- 3. weekday (server day) on daily offers
def weekday_frame(w, side, min_periods=5):
    s = np.log(daily[w][side]).asfreq('D')
    base = s.rolling(7, center=True, min_periods=min_periods).median()  # descriptive: neighbouring days on both sides
    dev = (s - base).dropna()
    return pd.DataFrame({'dev': dev, 'wd': dev.index.dayofweek, 'world': w, 'block': dev.index.to_period('W-SUN').astype(str)})


def weekday_tests(frame, rng, perms=4000):
    dev = frame.dev.to_numpy(); lab = frame.wd.to_numpy()
    def stat(labels):
        m = np.array([dev[labels == k].mean() if (labels == k).any() else 0 for k in range(7)]); return float(((m - dev.mean()) ** 2).sum())
    obs = stat(lab); blocks = [np.where((frame.world + frame.block).to_numpy() == b)[0] for b in (frame.world + frame.block).unique()]
    iid = block = 0
    for _ in range(perms):
        if stat(rng.permutation(lab)) >= obs: iid += 1
        shuffled = lab.copy()
        for ix in blocks: shuffled[ix] = rng.permutation(lab[ix])
        if stat(shuffled) >= obs: block += 1
    return (iid + 1) / (perms + 1), (block + 1) / (perms + 1)


weekday = {'rows': [], 'tests': [], 'coverage': []}
for w in OTHERS:
    per_week = daily[w].resample('W-SUN').size()
    per_week = per_week[per_week > 0]
    weekday['coverage'].append({'world': w, 'medianDaysPerWeek': float(per_week.median()), 'usableDays': int(len(weekday_frame(w, 'ask'))),
                                'usableDaysFlexible': int(len(weekday_frame(w, 'ask', 3)))})
# The other worlds rarely have quotes on consecutive days: the 5-of-7 window keeps almost only Quelibra, so
# their pooled comparison uses a 3-of-7 window (weaker baseline) and lists who contributes.
scopes = [(A, [A], 5), ('Demais mundos', OTHERS, 3)]
for si, side in enumerate(SIDES):
    for ki, (scope, members, mp) in enumerate(scopes):
        # One seeded stream per test: adding a world to the pool never shifts the benchmark's draws.
        rng = np.random.default_rng([20260924, si, ki])
        f = pd.concat([weekday_frame(w, side, mp) for w in members])
        for i, name in enumerate(WEEKDAYS):
            x = f.dev[f.wd == i]
            boots = [rng.choice(x.to_numpy(), len(x)).mean() for _ in range(1000)] if len(x) else [np.nan]
            weekday['rows'].append({'scope': scope, 'side': side, 'weekday': name, 'order': i, 'n': int(len(x)), 'devPct': pct(x.mean()),
                                    'ciLowPct': pct(np.percentile(boots, 2.5)), 'ciHighPct': pct(np.percentile(boots, 97.5))})
        g = f.groupby('wd').dev.mean(); p_iid, p_block = weekday_tests(f, rng)
        weekday['tests'].append({'scope': scope, 'side': side, 'n': int(len(f)), 'pIid': p_iid, 'pBlock': p_block, 'window': f'{mp} de 7 dias',
                                 'contributors': {k: int(v) for k, v in f.world.value_counts().items()},
                                 'rangePct': pct(g.max() - g.min()), 'high': WEEKDAYS[int(g.idxmax())], 'low': WEEKDAYS[int(g.idxmin())]})
# Holm correction across every weekday test, on the within-week block permutation p-values.
order = np.argsort([t['pBlock'] for t in weekday['tests']]); m = len(order); running = 0
for rank, i in enumerate(order):
    running = max(running, min(1, (m - rank) * weekday['tests'][i]['pBlock'])); weekday['tests'][i]['pHolm'] = running


# ---------------------------------------------------------------- 4. cross-world relative value vs Antica
def current_premium(w, side):
    """Median of same-day pairs: each capture of the world against the Antica capture of the same date
    (nearest in time). A world without captures uses its last historical day against Antica's same day."""
    key = 'sell' if side == 'ask' else 'buy'
    own = [c for c in captures if c['world'] == w]
    pairs = []
    for c in own:
        same = [a for a in antica_caps if a['capturedAt'][:10] == c['capturedAt'][:10]]
        if not same: continue
        a = min(same, key=lambda a: abs(pd.Timestamp(a['capturedAt']) - pd.Timestamp(c['capturedAt'])))
        pairs.append({'date': c['capturedAt'][:10], 'premiumPct': pct(np.log(c[key] / a[key]))})
    if pairs:
        return float(np.median([p['premiumPct'] for p in pairs])), 'capturas no mesmo dia', pairs
    d = daily[w].index.max(); av = daily[A][side].get(d, np.nan)
    if np.isfinite(av):
        return pct(np.log(daily[w][side][d] / av)), f'último histórico ({d.date()}) contra Antica no mesmo dia', []
    return None, 'sem par', []


def level_shift(prem):
    """Largest change between the median premium of the 8 weeks before a week and the 8 weeks from it."""
    best = None
    for t in prem.dropna().index:
        before = prem[(prem.index >= t - pd.Timedelta(weeks=8)) & (prem.index < t)].dropna()
        after = prem[(prem.index >= t) & (prem.index < t + pd.Timedelta(weeks=8))].dropna()
        if len(before) >= 4 and len(after) >= 4:
            shift = after.median() - before.median()
            if best is None or abs(shift) > abs(best[1]): best = (t, shift)
    return best


cross = {'worlds': [], 'leadLag': [], 'leadLagConvention': 'lag > 0: a variação de Antica k semanas antes', 'groupsByQuarter': []}
aw = weekly[A]
for w in OTHERS:
    for side in SIDES:
        prem = np.log(weekly[w][side] / aw[side])  # NaN where either week is missing
        row = {'world': w, 'side': side, 'type': latest[w].get('type'), 'battleye': latest[w].get('battleye')}
        brk = level_shift(prem)
        seg = prem
        if brk is not None:
            row.update({'largestShiftPct': pct(brk[1]), 'largestShiftWeek': str(brk[0].date())})
            if abs(pct(brk[1])) >= BREAK_PCT:  # a regime change: only the new regime describes the world now
                # First week that already sits closer to the new level than to the old one.
                t = brk[0]; pre = prem[prem.index < t].dropna().iloc[-8:].median(); post = prem[prem.index >= t].dropna().iloc[:8].median()
                t = next(k for k, v in prem[prem.index >= t - pd.Timedelta(weeks=4)].dropna().items() if abs(v - post) < abs(v - pre))
                row.update({'breakWeek': str(t.date()), 'preBreakMedianPct': pct(prem[prem.index < t].median())})
                seg = prem[prem.index >= t]
        if 'breakWeek' in row:
            dd = np.log(daily[w][side] / daily[A][side]).dropna()
            bw = pd.Timestamp(row['breakWeek'])
            row['breakDaily'] = [{'date': str(k.date()), 'premiumPct': pct(v)} for k, v in dd[(dd.index >= bw - pd.Timedelta(weeks=3)) & (dd.index <= bw + pd.Timedelta(weeks=1))].items()]
            eight = prem[(prem.index < bw)].dropna().iloc[-8:]
            row['preBreak8Pct'] = pct(eight.median()); row['preBreak8End'] = str(eight.index.max().date())
        p = seg.dropna(); last = p.index.max()
        cur, basis, pairs = current_premium(w, side)
        rw = np.log(weekly[w][side]).diff(); ra = np.log(aw[side]).diff()
        cm = pd.concat([rw, ra], axis=1).dropna()
        row.update({'weeks': int(len(prem.dropna())), 'segmentWeeks': int(len(p)), 'first': str(prem.dropna().index.min().date()), 'last': str(last.date()),
                    'medianPremiumPct': pct(p.median()),
                    'recentPremiumPct': pct(p[p.index > last - pd.Timedelta(weeks=26)].median()), 'recentWeeks': int((p.index > last - pd.Timedelta(weeks=26)).sum()),
                    'last8PremiumPct': pct(p[p.index > last - pd.Timedelta(weeks=8)].median()), 'last8Weeks': int((p.index > last - pd.Timedelta(weeks=8)).sum()),
                    'currentPremiumPct': cur, 'currentBasis': basis, 'currentPairs': pairs,
                    'corrWeekly': float(cm.corr().iloc[0, 1]) if len(cm) >= 10 else None, 'corrN': int(len(cm))})
        row['currentVsLast8Pp'] = row['currentPremiumPct'] - row['last8PremiumPct'] if row['currentPremiumPct'] is not None else None
        cross['worlds'].append(row)


def group_of(r):
    if r['type'] == 'Optional PvP': return f"Optional PvP; BattlEye {r['battleye']}"
    if r['type'] == 'Open PvP': return 'Open PvP'
    return None


cw = pd.DataFrame(cross['worlds']); cw['group'] = cw.apply(group_of, axis=1)
# A world whose premium shifted level is described only by its new regime, so it stays out of every
# cross-world summary (groups, ranges); a world whose type has no group is listed, never dropped silently.
cross['breaks'] = sorted(set(cw[cw.breakWeek.notna()].world)) if 'breakWeek' in cw else []
cross['ungrouped'] = [{'world': w, 'type': latest[w].get('type')} for w in sorted(set(cw[cw.group.isna()].world))]
pooled = cw[~cw.world.isin(cross['breaks']) & cw.group.notna()]
cross['groups'] = [{'group': grp, 'side': side, 'worlds': sorted(g.world),
                    **{k + 'MedianPct': float(g[k + 'PremiumPct'].median()) for k in ('recent', 'last8', 'current')}}
                   for (grp, side), g in pooled.groupby(['group', 'side'])]
for side in SIDES:
    for grp, g in pooled[pooled.side == side].groupby('group'):
        q = pd.concat([np.log(weekly[w][side] / aw[side]).rename(w) for w in g.world], axis=1).resample('QE').median()
        for qd, v in q.iterrows():
            v = v.dropna()
            if len(v): cross['groupsByQuarter'].append({'side': side, 'group': grp, 'quarter': f'{qd.year}-T{(qd.month - 1) // 3 + 1}', 'worlds': int(len(v)), 'members': sorted(v.index), 'medianPremiumPct': pct(v.median())})
    ra = np.log(point[A][side]).diff()
    rb = pd.concat([np.log(point[w][side]).diff() for w in OTHERS], axis=1)
    agg = rb.median(axis=1, skipna=True).where(rb.notna().sum(axis=1) >= 3)
    for lag in range(-3, 4):
        pair = pd.concat([agg, ra.shift(lag)], axis=1).dropna(); pair = pair[pair.index >= '2025-02-01']
        cross['leadLag'].append({'side': side, 'lag': lag, 'r': float(pair.corr().iloc[0, 1]), 'n': int(len(pair)), 'band': float(1.96 / np.sqrt(len(pair)))})


# ---------------------------------------------------------------- 5. round trip with Create Offer (upper bound) beside the accept version
maker = []
for rt in results['roundtrips']:
    d = daily[rt['world']]; yr = int(rt['cycle'][:4]); mo = rt['sellMonth']
    sell_ask = d[(d.index.year == yr) & (d.index.month == mo)].ask.median()
    rebuy_bid = d[(d.index.year == yr + 1) & (d.index.month.isin([5, 6, 7]))].bid.median()
    maker.append({'world': rt['world'], 'cycle': rt['cycle'], 'sellMonth': mo, 'acceptPct': rt['tcGainPct'],
                  'makerGrossPct': float((sell_ask / rebuy_bid - 1) * 100),
                  'makerNetPct': float((sell_ask * (1 - FEE) / (rebuy_bid * (1 + FEE)) - 1) * 100),
                  'sellAskMedian': float(sell_ask), 'rebuyBidMedian': float(rebuy_bid)})


# ---------------------------------------------------------------- 6. probabilistic cycle on offers (the received package's M1, re-specified on offers)
def feats(idx, harmonics=2, trend=True):
    # The main specification: a linear trend and two annual harmonics. The sensitivity variants drop the trend or a harmonic.
    t = np.asarray((pd.DatetimeIndex(idx) - T0).days / 365.25)
    cols = {'t': t} if trend else {}
    for k in range(1, harmonics + 1): cols.update({f'c{k}': np.cos(2 * np.pi * k * t), f's{k}': np.sin(2 * np.pi * k * t)})
    return pd.DataFrame(cols, index=idx)


def fit(y, order=(1, 1, 0), **spec):
    m = SARIMAX(y, exog=feats(y.index, **spec), order=order)
    return m, m.fit(disp=False, maxiter=1000)


def simulate(m, r, fut, ndraw, reps, seed, **spec):
    rng = np.random.default_rng(seed); mu = r.params.values; cov = r.cov_params().values; names = m.param_names
    out = []; tries = 0; ex = feats(fut, **spec)
    while len(out) < ndraw and tries < ndraw * 20:
        tries += 1
        p = rng.multivariate_normal(mu, cov) if out else mu
        if any((n == 'sigma2' and v <= 0) or (n.startswith(('ar.', 'ma.')) and abs(v) >= .99) for n, v in zip(names, p)): continue
        # rng is essential: without it statsmodels draws the innovations from an unseeded generator, so a
        # "seed" would fix only the parameter draws (the received models.simulate has that gap).
        s = np.asarray(m.filter(p).simulate(len(fut), repetitions=reps, anchor='end', exog=ex, rng=rng)).reshape(len(fut), -1)
        if np.isfinite(s).all(): out.append(s)
    return np.concatenate(out, axis=1)


def series(side, start, end=None, anchor=True):
    s = np.log(weekly[A][side].dropna())
    s = s[s.index >= pd.Timestamp(start)]
    if end is not None: s = s[s.index <= pd.Timestamp(end)]
    if anchor:  # latest observed quote anchors the labelled week; never used in backtests
        s.loc[anchor_week] = np.log(latest[A][side])
    grid = pd.date_range(s.index.min(), s.index.max(), freq='W-SUN')
    return s.reindex(grid)


TROUGH_2026 = {side: float(weekly[A].loc[f'{ASOF.year}-01-01':ASOF, side].min()) for side in SIDES}
TROUGH_2026_DATE = {side: str(weekly[A].loc[f'{ASOF.year}-01-01':ASOF, side].idxmin().date()) for side in SIDES}
# Weeks aligned with the package's Monday-labelled weeks: its week "2026-11-30" is Mon 30/11 to Sun 06/12,
# which is the week ending 06/12 here. Peak window to 28/02; trough window 01/03 to 26/09.
PKG_WEEK = {'nov30': '2026-12-06', 'mar29': '2027-04-04', 'jun28': '2027-07-04'}
EDITION_WEEK = {'2026-11-25': '2026-11-29', '2027-03-31': '2027-04-04', '2027-06-30': '2027-07-04'}


def summarise(sims, fut, start, side):
    y0 = np.log(start)
    w1 = fut <= pd.Timestamp('2027-02-28'); w2 = (fut >= pd.Timestamp('2027-03-01')) & (fut <= pd.Timestamp('2027-09-26'))
    pki = sims[w1].argmax(axis=0); tri = sims[w2].argmin(axis=0)
    pk = sims[w1].max(axis=0); pkd = fut[w1][pki]; tr = sims[w2].min(axis=0); trd = fut[w2][tri]
    at = lambda d: sims[fut.get_loc(pd.Timestamp(d))]
    q = lambda a: [float(np.exp(np.percentile(a, p))) for p in (10, 50, 90)]
    def qd(d):
        v = np.sort(np.asarray(d, dtype='datetime64[D]').astype('int64'))
        return [str(np.datetime64(int(np.percentile(v, p)), 'D')) for p in (10, 50, 90)]
    return {'start': start, 'paths': int(sims.shape[1]),
            'peakLevel': q(pk), 'peakDate': qd(pkd), 'troughLevel': q(tr), 'troughDate': qd(trd),
            # Paths whose extreme sits on a window edge have no turning point inside the window.
            'peakOnEdge': float(np.mean((pki == 0) | (pki == w1.sum() - 1))), 'troughOnEdge': float(np.mean((tri == 0) | (tri == w2.sum() - 1))),
            # By the Monday that starts each week, the convention of the package and of peakAfterOct31.
            'peakMonthShare': {'out': float(np.mean((pkd - pd.Timedelta(days=6)).month == 10)), 'novDez': float(np.mean((pkd - pd.Timedelta(days=6)).month.isin([11, 12]))),
                               'janFev': float(np.mean((pkd - pd.Timedelta(days=6)).month.isin([1, 2])))},
            'drawdownPct': [float(v) for v in np.percentile(np.expm1(tr - pk) * 100, [10, 50, 90])],
            'levels': {d: q(at(d)) for d in sorted(set(PKG_WEEK.values()) | set(EDITION_WEEK.values()))},
            'prob': {'peakAbove3': float(np.mean(pk > y0 + np.log(1.03))),
                     'peakAfterOct31': float(np.mean(pkd > pd.Timestamp('2026-11-01'))),  # from the week of Mon 02/11
                     'nov30AboveStart': float(np.mean(at(PKG_WEEK['nov30']) > y0)),
                     'jun28BelowStart': float(np.mean(at(PKG_WEEK['jun28']) < y0)),
                     'troughAbove2026': float(np.mean(tr > np.log(TROUGH_2026[side]))),
                     'jun28BelowNov30': float(np.mean(at(PKG_WEEK['jun28']) < at(PKG_WEEK['nov30'])))}}


# ---------------------------------------------------------------- 6b. will the price fall? Downside read off the same paths
NOV_WEEK, JUN_WEEK = pd.Timestamp(PKG_WEEK['nov30']), pd.Timestamp(PKG_WEEK['jun28'])
FALLS = (5, 10, 15, 20, 25)


def falls(sims, fut, start):
    """Three different falls on every path, in % (negative is a fall). From the path's own peak (its maximum up to 28/02/2027)
    to its lowest week after that peak, up to the end of the horizon; from the week of 30/11 to the week of 28/06; and from
    the start to the week of 28/06. A path can fall from its peak and still end above the start: the questions differ."""
    w1 = fut <= pd.Timestamp('2027-02-28'); pki = sims[w1].argmax(axis=0); pk = sims[w1].max(axis=0)
    later = np.where(np.arange(len(fut))[:, None] >= pki[None, :], sims, np.inf)
    nov, jun = sims[fut.get_loc(NOV_WEEK)], sims[fut.get_loc(JUN_WEEK)]
    return {'fromPeak': np.expm1(later.min(axis=0) - pk) * 100, 'lowDate': fut[later.argmin(axis=0)],
            'junVsNov': np.expm1(jun - nov) * 100, 'junVsStart': np.expm1(jun - np.log(start)) * 100}


def fall_scalars(sims, fut, start):
    f = falls(sims, fut, start)
    return {'fromPeakGt10': float(np.mean(f['fromPeak'] <= -10)), 'fromPeakMedianPct': float(np.median(f['fromPeak']))}


def downside(sims, fut, start):
    f = falls(sims, fut, start); y0 = np.log(start); nov = sims[fut.get_loc(NOV_WEEK)]
    q5 = lambda a: [float(np.percentile(a, p)) for p in (10, 25, 50, 75, 90)]
    lows = np.sort(np.asarray(f['lowDate'], dtype='datetime64[D]').astype('int64'))
    w2 = (fut >= pd.Timestamp('2027-03-01')) & (fut <= pd.Timestamp('2027-09-26'))
    return {'fromPeak': q5(f['fromPeak']), 'junVsNov': q5(f['junVsNov']), 'junVsStart': q5(f['junVsStart']),
            'lowDate': [str(np.datetime64(int(np.percentile(lows, p)), 'D')) for p in (10, 50, 90)],
            'troughBelowStart': float(np.mean(sims[w2].min(axis=0) < y0)),
            'thresholds': [{'fallPct': x, 'fromPeak': float(np.mean(f['fromPeak'] <= -x)), 'junVsNov': float(np.mean(f['junVsNov'] <= -x)),
                            'junVsStart': float(np.mean(f['junVsStart'] <= -x))} for x in FALLS],
            # The chance of trading below today's price, and below the path's own level in the week of 30/11 once that week has passed.
            'curve': [{'date': str(d.date()), 'belowStart': float(np.mean(sims[j] < y0)),
                       'belowNov': float(np.mean(sims[j] < nov)) if d > NOV_WEEK else None} for j, d in enumerate(fut)]}


prob = {'spec': {'model': 'log(oferta semanal de Antica) = tendência linear + 2 harmônicos anuais, erros ARIMA(1,1,0)',
                 'paths': f"{N_DRAWS} sorteios de parâmetros × {PATHS_PER_DRAW} trajetórias = {f'{N_DRAWS * PATHS_PER_DRAW:,}'.replace(',', '.')} por semente; choques semeados",
                 'draws': N_DRAWS, 'pathsPerDraw': PATHS_PER_DRAW, 'seeds': [11, 99, 123, 2026],
                 'mainSample': 'desde a primeira semana válida (2023-01-15)', 'sensitivitySample': 'desde 2024-01-15, como o M1_2024 do pacote',
                 'anchor': f"captura de Antica em {latest[A]['date']}, na semana encerrada em {anchor_week.date()}",
                 'calibration': f"origens quinzenais de 2025-01-05 até {(ASOF-pd.Timedelta(weeks=4)).date()}, amostra expansiva desde 2023, 100 × 20 trajetórias por origem, semente por origem",
                 'packageWeeks': PKG_WEEK, 'editionWeeks': EDITION_WEEK, 'trough2026': TROUGH_2026, 'trough2026Date': TROUGH_2026_DATE},
        'sides': {}, 'fan': [], 'fit': []}
keep11 = {}
for side in SIDES:
    for label, start in (('main', '2023-01-01'), ('since2024', '2024-01-15')):
        y = series(side, start); m, r = fit(y)
        fut = pd.date_range(y.index[-1] + pd.Timedelta(weeks=1), periods=52, freq='W-SUN')
        prob['fit'].append({'side': side, 'sample': label, 'weeks': int(y.notna().sum()), 'driftPerYear': float(r.params['t']), 'driftSe': float(r.bse['t']),
                            'ar1': float(r.params['ar.L1']), 'weeklySigma': float(np.sqrt(r.params['sigma2'])), 'aic': float(r.aic)})
        runs = []
        for seed in prob['spec']['seeds']:
            sims = simulate(m, r, fut, N_DRAWS, PATHS_PER_DRAW, seed)
            runs.append({'seed': seed, **summarise(sims, fut, float(latest[A][side]), side), 'fall': fall_scalars(sims, fut, float(latest[A][side]))})
            if seed == 11:
                keep11[(side, label)] = (sims, fut)
                qs = np.percentile(sims, [10, 25, 50, 75, 90], axis=1)
                for j, d in enumerate(fut):
                    prob['fan'].append({'side': side, 'sample': label, 'date': str(d.date()), **{k: float(np.exp(qs[i][j])) for i, k in enumerate(['p10', 'p25', 'p50', 'p75', 'p90'])}})
        keys = runs[0]['prob'].keys()
        prob['sides'].setdefault(side, {})[label] = {
            'runs': runs,
            'seedRange': {k: [min(x['prob'][k] for x in runs), max(x['prob'][k] for x in runs)] for k in keys},
            'peakP50Range': [min(x['peakLevel'][1] for x in runs), max(x['peakLevel'][1] for x in runs)],
            'troughP50Range': [min(x['troughLevel'][1] for x in runs), max(x['troughLevel'][1] for x in runs)]}

# Sell now, buy back in the week of 28/06/2027, from the same seed-11 paths. Accepting: sell at today's
# Buy Offers, rebuy at the simulated Sell Offers. Creating offers: sell at today's Sell Offers and rebuy at the
# simulated Buy Offers, paying 2% on each placement, and assuming both offers fill.
jun = pd.Timestamp(PKG_WEEK['jun28']); prob['roundtrip'] = []
for label in ('main', 'since2024'):
    for mode, side, now in (('aceitando', 'ask', latest[A]['bid']), ('criando ofertas', 'bid', latest[A]['ask'] * (1 - FEE))):
        sims, fut = keep11[(side, label)]
        later = np.exp(sims[fut.get_loc(jun)]) * (1 if mode == 'aceitando' else 1 + FEE)
        g = (now / later - 1) * 100
        prob['roundtrip'].append({'sample': label, 'mode': mode, 'pGain': float(np.mean(g > 0)), 'gainPct': [float(v) for v in np.percentile(g, [10, 50, 90])],
                                  'pLoss': float(np.mean(g < 0)), 'pLossGt10': float(np.mean(g < -10)), 'pGainGt10': float(np.mean(g > 10)),
                                  'quantiles': [float(v) for v in np.percentile(g, [10, 25, 50, 75, 90])]})

# Downside and the economics of selling now to repurchase later, on the same seed-11 paths as every probability above.
# Break-even: the highest repurchase quote that returns at least the target gain in TC. Taking offers sells at today's Buy
# Offers and repurchases at the Sell Offers; making offers sells at today's Sell Offers less the fee and repurchases at the
# Buy Offers plus the fee (both offers assumed filled). Required changes are measured against today's quote of the side
# repurchased and against today's Sell Offers, the price the report follows.
prob['downside'] = {side: {label: downside(*keep11[(side, label)], float(latest[A][side])) for label in ('main', 'since2024')} for side in SIDES}
ask0, bid0 = float(latest[A]['ask']), float(latest[A]['bid'])
prob['rebuyCurve'] = []
for label in ('main', 'since2024'):
    (ask_s, fut), (bid_s, _) = keep11[('ask', label)], keep11[('bid', label)]
    take = bid0 / np.exp(ask_s) - 1; make = ask0 * (1 - FEE) / (np.exp(bid_s) * (1 + FEE)) - 1
    prob['rebuyCurve'] += [{'sample': label, 'date': str(d.date()), 'taker': float(np.mean(take[j] > 0)), 'maker': float(np.mean(make[j] > 0))} for j, d in enumerate(fut)]
prob['breakEven'] = []
for target in (0, 5, 10):
    for mode, side, most, same in (('aceitando', 'ask', bid0 / (1 + target / 100), ask0), ('criando ofertas', 'bid', ask0 * (1 - FEE) / ((1 + FEE) * (1 + target / 100)), bid0)):
        prob['breakEven'].append({'targetPct': target, 'mode': mode, 'rebuyAtMost': most, 'vsSamePct': (most / same - 1) * 100, 'vsSellPct': (most / ask0 - 1) * 100,
                                  'pByJune': {label: float(np.mean(keep11[(side, label)][0][keep11[(side, label)][1].get_loc(jun)] < np.log(most))) for label in ('main', 'since2024')}})
prob['roundtripPackageFail'] = json.load(open(ROOT / 'source-package/roundtrip.json'))
prob['roundtripPackageFail'] = {k: prob['roundtripPackageFail'][k] for k in ('fail_case_accept_pct', 'fail_case_maker_pct')}


# ---------------------------------------------------------------- 6c. buy or sell? The two one-way decisions, on the same seed-11 paths
# A gold holder who wants TC and a TC holder who wants gold each compare acting today with acting later. Every outcome is the
# TC (buyer) or gold (seller) obtained relative to taking today's quote, which is the buyer paying today's Sell Offers and the
# seller receiving today's Buy Offers, with no fee. Each plan is read off the simulated side the actor trades against, and every
# date comes from the research design or from the paths: the edition's November and June weeks (the weeks of the ensemble
# scenarios), the P10 to P90 dates of the turning point the actor waits for (one equal tranche a week: gold for the buyer, TC for
# the seller), and each path's own peak and low, bounds that only hindsight reaches. Making an offer pays the fee and assumes a fill.
DEC_WEEK = {'nov': pd.Timestamp(EDITION_WEEK['2026-11-25']), 'jun': pd.Timestamp(EDITION_WEEK['2027-06-30'])}


def plan(rel, name, **extra):
    g = (rel - 1) * 100
    return {'plan': name, **extra, 'pBetter': float(np.mean(g > 0)), 'quantiles': [float(v) for v in np.percentile(g, [10, 25, 50, 75, 90])],
            'mean': float(np.mean(g)), 'gainIfBetter': float(np.median(g[g > 0])) if (g > 0).any() else None,
            'lossIfWorse': float(np.median(g[g < 0])) if (g < 0).any() else None}


prob['decisions'] = {'weeks': {k: str(v.date()) for k, v in DEC_WEEK.items()}, 'buyer': {}, 'seller': {}}
for label in ('main', 'since2024'):
    (ask_s, fut), (bid_s, _) = keep11[('ask', label)], keep11[('bid', label)]
    at = lambda s, k: s[fut.get_loc(DEC_WEEK[k])]
    w1 = fut <= pd.Timestamp('2027-02-28'); w2 = (fut >= pd.Timestamp('2027-03-01')) & (fut <= pd.Timestamp('2027-09-26'))
    run11 = lambda side: next(x for x in prob['sides'][side][label]['runs'] if x['seed'] == 11)
    tranches = lambda dates: (lambda lo, hi: ((fut >= lo) & (fut <= hi), [str(lo.date()), str(hi.date())]))(pd.Timestamp(dates[0]), pd.Timestamp(dates[2]))
    buy = lambda s: ask0 / np.exp(s)   # TC per gold, relative to taking today's Sell Offers
    win, dates = tranches(run11('ask')['troughDate'])
    prob['decisions']['buyer'][label] = [
        plan(buy(at(ask_s, 'nov')), 'nov'), plan(buy(at(ask_s, 'jun')), 'jun'),
        plan(ask0 / (np.exp(at(bid_s, 'jun')) * (1 + FEE)), 'junMake'),
        plan(.5 + .5 * buy(at(ask_s, 'jun')), 'half'),
        plan(buy(ask_s[win]).mean(axis=0), 'staged', window=dates, weeks=int(win.sum())),
        plan(buy(ask_s[w1].max(axis=0)), 'peak'), plan(buy(ask_s[w2].min(axis=0)), 'low')]
    sell = lambda s: np.exp(s) / bid0  # gold per TC, relative to taking today's Buy Offers
    win, dates = tranches(run11('bid')['peakDate'])
    prob['decisions']['seller'][label] = [
        plan(sell(at(bid_s, 'nov')), 'nov'),
        plan(np.exp(at(ask_s, 'nov')) * (1 - FEE) / bid0, 'novMake'),
        plan(sell(at(bid_s, 'jun')), 'jun'),
        plan(.5 + .5 * sell(at(bid_s, 'nov')), 'half'),
        plan(sell(bid_s[win]).mean(axis=0), 'staged', window=dates, weeks=int(win.sum())),
        plan(sell(bid_s[w1].max(axis=0)), 'peak'), plan(sell(bid_s[w2].min(axis=0)), 'low')]

# Anchor sensitivity: every available Antica capture, imposed on the current forecast week.
# This is a retrospective anchor perturbation, never a historical out-of-sample forecast.
prob['anchorSensitivity'] = []
ref = float(latest[A]['ask'])
for c in antica_caps:
    y = series('ask', '2023-01-01'); y.loc[anchor_week] = np.log(c['sell']); m, r = fit(y)
    fut = pd.date_range(y.index[-1] + pd.Timedelta(weeks=1), periods=52, freq='W-SUN'); sims = simulate(m, r, fut, N_DRAWS, PATHS_PER_DRAW, 11)
    sm = summarise(sims, fut, float(c['sell']), 'ask'); w1 = fut <= pd.Timestamp('2027-02-28')
    prob['anchorSensitivity'].append({'capture': c['capturedAt'][:10], 'anchor': c['sell'], 'peakP50': sm['peakLevel'][1], 'troughP50': sm['troughLevel'][1],
                                      'pPeakAbove3OfReference': float(np.mean(sims[w1].max(axis=0) > np.log(ref * 1.03))),
                                      'pJun28BelowReference': float(np.mean(sims[fut.get_loc(jun)] < np.log(ref))),
                                      'pJun28BelowNov30': sm['prob']['jun28BelowNov30'], **fall_scalars(sims, fut, float(c['sell']))})

# Anchor alternatives: the median of Antica's captures in the 24 and 72 hours up to the latest one (research_data.window_quote)
# against the latest capture itself. The model starts from each alternative on both sides; every threshold stays at the latest
# capture, the quote a player can trade on today, so the rows show how far one quote moves the probabilities and the economics
# built on them. The latest row reuses the published seed-11 paths, so it repeats the published figures.
prob['anchorAlternatives'] = []
fut11 = keep11[('ask', 'main')][1]
jw, nw_, pw = fut11.get_loc(jun), fut11.get_loc(DEC_WEEK['nov']), fut11.get_loc(NOV_WEEK)
w1 = fut11 <= pd.Timestamp('2027-02-28'); w2 = (fut11 >= pd.Timestamp('2027-03-01')) & (fut11 <= pd.Timestamp('2027-09-26'))
for label, hours in (('latest', 0), ('24h', 24), ('72h', 72)):
    q = {'ask': ask0, 'bid': bid0, 'n': 1} if not hours else window_quote(A, captures, hours, ASOF)
    paths = {}
    for side in SIDES:
        if not hours: paths[side] = keep11[(side, 'main')][0]; continue
        y = series(side, '2023-01-01'); y.loc[anchor_week] = np.log(q[side]); m, r = fit(y)
        paths[side] = simulate(m, r, fut11, N_DRAWS, PATHS_PER_DRAW, 11)
    a, b = paths['ask'], paths['bid']
    prob['anchorAlternatives'].append({
        'anchor': label, 'hours': hours, 'captures': q['n'], 'ask': q['ask'], 'bid': q['bid'],
        'peakP50': float(np.exp(np.median(a[w1].max(axis=0)))), 'troughP50': float(np.exp(np.median(a[w2].min(axis=0)))),
        'novP50': float(np.exp(np.median(a[nw_]))), 'junP50': float(np.exp(np.median(a[jw]))),
        'pPeakAbove3': float(np.mean(a[w1].max(axis=0) > np.log(ask0 * 1.03))), 'pJunBelowToday': float(np.mean(a[jw] < np.log(ask0))),
        'pJunBelowNov': float(np.mean(a[jw] < a[pw])), 'fromPeakGt10': fall_scalars(a, fut11, q['ask'])['fromPeakGt10'],
        'takerGain': float(np.mean(bid0 > np.exp(a[jw]))), 'buyerNov': float(np.mean(ask0 > np.exp(a[nw_]))),
        'sellerNov': float(np.mean(np.exp(b[nw_]) > bid0)), 'sellerJun': float(np.mean(np.exp(b[jw]) > bid0))})

# Executability: the sell-and-rebuy round trip for an order of q TC instead of one TC at the best quotes. The sale takes today's
# Buy Offers and loses at most the slippage bound of the latest capture's book (research_data.slippage_bound); the repurchase
# takes the simulated Sell Offers and is charged the relative bound of today's Sell Offers book, since no future book is
# observed. Bounds make each probability of a gain a lower bound. 100 TC is the decisions chapter's unit and 1,000 TC the
# largest round order below the fee cap at today's price.
prob['depthRoundtrip'] = []
for q in (100, 1000):
    sb = slippage_bound(bid0, latest[A]['buyTopAmount'], latest[A]['buyVolume'], latest[A]['goldSupply'], q)
    sa = slippage_bound(ask0, latest[A]['sellTopAmount'], latest[A]['sellVolume'], latest[A]['goldDemand'], q)
    row = {'tc': q, 'sellSlipPct': None if sb is None else sb * 100, 'buySlipPct': None if sa is None else sa * 100}
    if sb is not None and sa is not None:
        row['breakEven'] = bid0 * (1 - sb) / (1 + sa)
        for label in ('main', 'since2024'):
            ask_s, fut = keep11[('ask', label)]
            g = (bid0 * (1 - sb) / (np.exp(ask_s[fut.get_loc(jun)]) * (1 + sa)) - 1) * 100
            row[label] = {'pGain': float(np.mean(g > 0)), 'quantiles': [float(v) for v in np.percentile(g, [10, 25, 50, 75, 90])]}
    prob['depthRoundtrip'].append(row)

# Specification sensitivity: the main sample, the current anchor and seed 11, changing one modelling choice at a time.
SPECS = [('ARIMA(0,1,1) errors', (0, 1, 1), {}), ('ARIMA(2,1,0) errors', (2, 1, 0), {}), ('One annual harmonic', (1, 1, 0), {'harmonics': 1}),
         ('No drift', (1, 1, 0), {'trend': False})]
prob['specSensitivity'] = []
for name, order, spec in SPECS:
    y = series('ask', '2023-01-01'); m, r = fit(y, order, **spec)
    fut = pd.date_range(y.index[-1] + pd.Timedelta(weeks=1), periods=52, freq='W-SUN'); sims = simulate(m, r, fut, N_DRAWS, PATHS_PER_DRAW, 11, **spec)
    sm = summarise(sims, fut, ref, 'ask')
    prob['specSensitivity'].append({'spec': name, 'aic': float(r.aic), 'peakP50': sm['peakLevel'][1], 'troughP50': sm['troughLevel'][1], **sm['prob'], **fall_scalars(sims, fut, ref)})

# One row per probability and per source of variation, from the runs above: the seeds of the main run, the two training
# windows, every starting capture (thresholds kept at today's price) and the specifications. The base is the main run, seed 11.
base_run = next(x for x in prob['sides']['ask']['main']['runs'] if x['seed'] == 11)
METRICS = {'peakAbove3': (lambda x: x['prob']['peakAbove3'], 'pPeakAbove3OfReference', 'peakAbove3'),
           'jun28BelowStart': (lambda x: x['prob']['jun28BelowStart'], 'pJun28BelowReference', 'jun28BelowStart'),
           'jun28BelowNov30': (lambda x: x['prob']['jun28BelowNov30'], 'pJun28BelowNov30', 'jun28BelowNov30'),
           'fromPeakGt10': (lambda x: x['fall']['fromPeakGt10'], 'fromPeakGt10', 'fromPeakGt10')}
prob['tornado'] = []
for metric, (read, anchor_key, spec_key) in METRICS.items():
    factors = {'seed': [(str(x['seed']), read(x)) for x in prob['sides']['ask']['main']['runs']],
               'window': [('Since 2023', read(base_run)), ('Since 2024', read(next(x for x in prob['sides']['ask']['since2024']['runs'] if x['seed'] == 11)))],
               'anchor': [(f"{a['capture']} ({a['anchor']:.0f})", a[anchor_key]) for a in prob['anchorSensitivity']],
               'spec': [('Main', read(base_run))] + [(x['spec'], x[spec_key]) for x in prob['specSensitivity']]}
    prob['tornado'].append({'metric': metric, 'base': read(base_run),
                            'factors': [{'factor': k, 'low': min(v for _, v in vals), 'high': max(v for _, v in vals), 'values': [{'label': a, 'value': b} for a, b in vals]}
                                        for k, vals in factors.items()]})

# Calibration: rolling origins every two weeks, fitted only on weeks up to the origin (expanding sample
# from 2023), scored on the weekly offer actually observed h weeks later. Origins overlap heavily.
calib_rows = []
origins = pd.date_range('2025-01-05', ASOF-pd.Timedelta(weeks=4), freq='2W-SUN')
for side in SIDES:
    full = np.log(weekly[A][side])
    for k, o in enumerate(origins):
        if not np.isfinite(full.get(o, np.nan)): continue
        y = series(side, '2023-01-01', end=o, anchor=False)
        if (o - y.index[0]).days < 728: continue
        m, r = fit(y)
        fut = pd.date_range(o + pd.Timedelta(weeks=1), periods=52, freq='W-SUN')
        sims = simulate(m, r, fut, 100, 20, 20260924 + k)
        for h in (4, 13, 26, 52):
            tgt = o + pd.Timedelta(weeks=h); act = full.get(tgt, np.nan)
            if not np.isfinite(act): continue
            path = sims[h - 1]
            # Two simple references for the direction: the same h-week window one year earlier (seasonal naive),
            # and the share of past h-week rises observed before the origin (climatology).
            a0 = full.get(o - pd.Timedelta(weeks=52), np.nan); a1 = full.get(o - pd.Timedelta(weeks=52 - h), np.nan)
            past = full[:o]; rises = (past.shift(-h) > past)[past.shift(-h).notna()]
            calib_rows.append({'side': side, 'origin': str(o.date()), 'horizon': h, 'pit': float(np.mean(path <= act)),
                               'pUp': float(np.mean(path > full[o])), 'up': bool(act > full[o]),
                               'pUpSeasonal': float(a1 > a0) if np.isfinite(a0) and np.isfinite(a1) else None, 'pUpClimate': float(rises.mean()),
                               'median': float(np.exp(np.median(path))), 'actual': float(np.exp(act))})
cal = pd.DataFrame(calib_rows); calibration = []
for (side, h), g in cal.groupby(['side', 'horizon']):
    span = (pd.Timestamp(g.origin.max()) - pd.Timestamp(g.origin.min())).days // 7
    calibration.append({'side': side, 'horizon': int(h), 'n': int(len(g)), 'firstOrigin': g.origin.min(), 'lastOrigin': g.origin.max(),
                        'windows': int(span // h + 1),  # target windows that do not overlap
                        'cov50': float(((g.pit >= .25) & (g.pit <= .75)).mean()), 'cov80': float(((g.pit >= .1) & (g.pit <= .9)).mean()),
                        'below10': float((g.pit < .1).mean()), 'above90': float((g.pit > .9).mean()),
                        'brier': float(((g.pUp - g.up) ** 2).mean()), 'brierHalf': float(((.5 - g.up) ** 2).mean()),
                        'brierSeasonal': float(((g.pUpSeasonal - g.up) ** 2).mean()), 'seasonalN': int(g.pUpSeasonal.notna().sum()),
                        'brierClimate': float(((g.pUpClimate - g.up) ** 2).mean()),
                        'meanPUp': float(g.pUp.mean()), 'freqUp': float(g.up.mean()),
                        'mapePct': float((np.abs(g['median'] / g.actual - 1)).mean() * 100)})
prob['calibration'] = calibration; prob['calibrationDetail'] = calib_rows


# Calibration of the probability of a fall (one minus the probability of a rise; an unchanged price counts as no rise):
# reliability in five equal bins, the Murphy decomposition of the Brier score (reliability - resolution + uncertainty,
# exact up to the spread of forecasts inside each bin) and the logistic calibration line, whose intercept is 0 and slope 1
# for calibrated forecasts. Horizon 0 pools the four horizons of a side; pooled origins overlap even more.
def calib_stats(p, o, bins=5):
    k = np.minimum((p * bins).astype(int), bins - 1); n = len(p); base = o.mean()
    cells = [{'lo': i / bins, 'hi': (i + 1) / bins, 'n': int((k == i).sum()), 'meanP': float(p[k == i].mean()), 'freq': float(o[k == i].mean())} for i in range(bins) if (k == i).any()]
    out = {'n': int(n), 'brier': float(np.mean((p - o) ** 2)), 'reliability': float(sum(c['n'] * (c['meanP'] - c['freq']) ** 2 for c in cells) / n),
           'resolution': float(sum(c['n'] * (c['freq'] - base) ** 2 for c in cells) / n), 'uncertainty': float(base * (1 - base)),
           'meanP': float(p.mean()), 'freq': float(base), 'bins': cells, 'intercept': None, 'slope': None, 'slopeSe': None}
    try:
        x = np.log(np.clip(p, .01, .99) / (1 - np.clip(p, .01, .99)))
        f = Logit(o, np.column_stack([np.ones(n), x])).fit(disp=0, maxiter=200)
        # A separable sample has no finite estimate: it is reported as missing, never as a huge number.
        if f.mle_retvals.get('converged') and abs(f.params[1]) < 50:
            out.update({'intercept': float(f.params[0]), 'slope': float(f.params[1]), 'slopeSe': float(f.bse[1])})
    except Exception:
        pass
    return out


cal['pFall'] = 1 - cal.pUp; cal['fall'] = (~cal.up.astype(bool)).astype(float)
prob['calibrationDiagnostics'] = ([{'side': side, 'horizon': int(h), **calib_stats(g.pFall.to_numpy(), g.fall.to_numpy())} for (side, h), g in cal.groupby(['side', 'horizon'])]
                                  + [{'side': side, 'horizon': 0, **calib_stats(g.pFall.to_numpy(), g.fall.to_numpy())} for side, g in cal.groupby('side')])

# The received package's own numbers, for comparison only (day_average-based index of 71 worlds).
pkg = json.load(open(ROOT / 'source-package/forecast.json'))['M1_2024']
stab = json.load(open(ROOT / 'source-package/forecast_stability.json'))['seeds']
keys = ['p_peak_gt3', 'p_peak_after_oct31', 'p_jun27_below', 'p_trough_above_2026']
prob['package'] = {'start': pkg['start'], 'model': pkg['model'], 'peak': pkg['peak'], 'trough': pkg['trough'], 'prob': pkg['prob'],
                   'stability': stab,
                   'stabilityRange': {k: [min(s[k] for s in stab), max(s[k] for s in stab)] for k in keys + ['peak_p50', 'trough_p50']},
                   'seed11VsPublished': {'peakP50': [stab[0]['peak_p50'], pkg['peak']['level_p10_p50_p90'][1]],
                                         'troughP50': [stab[0]['trough_p50'], pkg['trough']['level_p10_p50_p90'][1]]},
                   'seedsFixOnlyParameterDraws': True,  # source-package/models.py simulate() passes no generator
                   # Binomial Monte Carlo error if every path were independent vs if only the parameter draws were. The package's
                   # M1_2024 runs share this design (source-package/forecast.py: ndraw=300, reps=20).
                   'mcErrorPp': {k: [float(np.sqrt(p * (1 - p) / (N_DRAWS * PATHS_PER_DRAW)) * 100), float(np.sqrt(p * (1 - p) / N_DRAWS) * 100)]
                                 for k, p in (('p_peak_gt3', stab[0]['p_peak_gt3']), ('p_jun27_below', stab[0]['p_jun27_below']))}}

monthly = daily[A].resample('ME').median()
year_ago = week_of(anchor_date - pd.Timedelta(days=364))
context = {'captureVsYearAgo': [{'side': side, 'yearAgoWeek': str(year_ago.date()), 'yearAgoLevel': float(weekly[A][side][year_ago]),
                                 'capture': float(latest[A][side]), 'pct': pct(np.log(latest[A][side] / weekly[A][side][year_ago]))} for side in SIDES],
           'yoy': [{'month': str(k.date())[:7], 'side': side, 'pct': float((monthly[side][k] / monthly[side][k - pd.DateOffset(years=1) + pd.offsets.MonthEnd(0)] - 1) * 100),
                    'days': int(daily[A][side][str(k.date())[:7]].size)}
                   for side in SIDES for k in monthly.index if k.year == 2026]}

out = js({'asOf': str(ASOF.date()), 'context': context, 'fee': {'rate': FEE, 'min': 20, 'max': 1_000_000, 'capBindsAboveTc': 1_000_000 / (FEE * latest[A]['ask'])},
          'swings': swings, 'volatility': volatility, 'momentum': momentum, 'spread': spread, 'weekday': weekday,
          'crossWorld': cross, 'roundtripMaker': maker, 'probabilistic': prob,
          'sources': [{'file': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                      for p in [ROOT / 'results.json', ROOT / 'market-update.json', ROOT / 'source-package/forecast.json', ROOT / 'source-package/forecast_stability.json']]})
(ROOT / 'complement.json').write_text(json.dumps(out, ensure_ascii=False, indent=1, allow_nan=False))
print(json.dumps(js({'swings': {s: swings['sides'][s]['current'] for s in SIDES}, 'calibration': calibration,
                     'main': {s: prob['sides'][s]['main']['runs'][0]['prob'] for s in SIDES},
                     'since2024': {s: prob['sides'][s]['since2024']['runs'][0]['prob'] for s in SIDES}}), ensure_ascii=False, indent=1)[:4000])
