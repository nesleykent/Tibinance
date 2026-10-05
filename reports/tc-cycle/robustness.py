"""Robustness of the published method, which stays the baseline.

The baseline outputs (results.json, complement.json, inflation.json, lifecycle.json) are never changed here. Each analysis
reruns one rule of the pipeline with an alternative and reports, beside the baseline figure, what the alternative gives and
whether a stated conclusion changes:

1. filter: the Buy/Sell floor of the cleaning rule (research_data.MIN_BID_ASK, 0.80) against 0.70, 0.75, 0.85 and no floor.
   The whole pipeline reruns on a temporary copy for every floor that changes the data; floors with identical data share a run.
2. transfer: the proportional transfer of Antica's forecast change (a 1:1 response) against a slope, and a slope with drift,
   estimated for each world on its own h-week changes completed before each origin and scored out of sample.
3. anchor: the latest capture against the median of the captures of the 24 and 72 hours up to it (research_data.window_quote),
   for every world, and Antica's ensemble scenario under each anchor. complement.py reads the same anchors for the probabilities.
4. independence: forecast origins against non-overlapping target windows and the effective number of independent loss
   differences; C+S against the published C+S+H on the published bootstrap resamples.
5. depth: the Amount at the best price, the visible depth and an upper bound on the average-price slippage of an order
   (research_data.slippage_bound), for every world and every capture.
6. challenger: the C+S scenario beside the published C+S+H, the pair that forecast-ledger.jsonl freezes for prospective scoring.

Reads research_data, analyze.py's model functions (loaded from its source, never copied), results.json and complement.json;
writes robustness.json. About eight minutes, almost all of it in the reruns of step 1. Needs numpy, pandas, scipy, statsmodels.
"""
from pathlib import Path
import ast, hashlib, json, math, shutil, subprocess, sys, tempfile
import numpy as np
import pandas as pd
import research_data as rd
from research_data import research_cutoff, load_captures, api_rows, build_daily, weekly_series, window_quote, slippage_bound
from universe import BENCHMARK, api_worlds

ROOT = Path(__file__).resolve().parent
ASOF = research_cutoff()
SIDES = ('ask', 'bid')
R = json.load(open(ROOT / 'results.json')); C = json.load(open(ROOT / 'complement.json'))
I = json.load(open(ROOT / 'inflation.json')); L = json.load(open(ROOT / 'lifecycle.json'))
A = R['benchmark']; assert A == BENCHMARK
WORLDS = [m['world'] for m in R['worlds']]

# analyze.py's own functions, so every forecast here is the published one (validate.py loads them the same way).
tree = ast.parse((ROOT / 'analyze.py').read_text())
ns = {'np': np, 'pd': pd, 'T0': pd.Timestamp('2023-01-01'), 'BOOT': 2000}
exec(compile(ast.Module(body=[x for x in tree.body if isinstance(x, ast.FunctionDef) and x.name in ('features', 'components', 'preds', 'blocks')],
                        type_ignores=[]), 'analyze.py', 'exec'), ns)
components, preds, blocks = ns['components'], ns['preds'], ns['blocks']


def js(x):
    if isinstance(x, dict): return {str(k): js(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [js(v) for v in x]
    if isinstance(x, np.generic): return js(x.item())
    if isinstance(x, pd.Timestamp): return str(x.date())
    if isinstance(x, float) and not math.isfinite(x): return None
    return x


def build(floor=rd.MIN_BID_ASK):
    """Daily books of every world under a Buy/Sell floor, with the cleaning counts; the baseline floor restored afterwards."""
    base = rd.MIN_BID_ASK; rd.MIN_BID_ASK = floor
    try:
        caps = load_captures(ASOF)
        out = {w: build_daily(api_rows(w), [c for c in caps if c['world'] == w], ASOF) for w in api_worlds()}
        return {w: v for w, v in out.items() if not v[0].empty}
    finally:
        rd.MIN_BID_ASK = base


data = build()
weeks = {w: weekly_series(d, ASOF) for w, (d, _) in data.items()}
bench = weeks[A]
# The rebuilt weekly series is the published history, value for value.
for x in R['history']:
    for side in SIDES:
        v = weeks[x['world']][side].get(pd.Timestamp(x['date']))
        assert (x[side] is None and (v is None or not np.isfinite(v))) or math.isclose(x[side], v), (x, side)
captures = load_captures(ASOF)
latest = {m['world']: m for m in R['worlds']}
future = pd.date_range(ASOF + pd.Timedelta(days=7), periods=52, freq='7D')
MILESTONES = {'nov': '2026-11-25', 'jun': '2027-06-30'}
near = lambda target: min(future, key=lambda d: abs(d - pd.Timestamp(target)))


# ---------------------------------------------------------------- 6. challenger: every component and combination of the live scenario
def live_paths(anchor):
    """The live scenario of every model for Antica from an anchor {'ask', 'bid'}, as analyze.py builds the published one."""
    out = {}
    for side in SIDES:
        y = bench[side].dropna().copy(); y.loc[ASOF] = anchor[side]
        c = components(y, ASOF, future)
        comb = lambda idx: anchor[side] * np.exp(np.nanmean(c[:, idx], axis=1))
        out[side] = {'Constante': comb([0]), 'Sazonal 52 semanas': comb([1]), 'Harmônico': comb([2]), 'C+S': comb([0, 1]), 'C+S+H': comb([0, 1, 2])}
    return out


published = {'ask': latest[A]['ask'], 'bid': latest[A]['bid']}
live = live_paths(published)
for f in R['forecast']:
    j = list(future).index(pd.Timestamp(f['date']))
    assert math.isclose(live[f['side']]['C+S+H'][j], f['base']) and math.isclose(live[f['side']]['Sazonal 52 semanas'][j], f['seasonal'])
challenger = [{'date': str(d.date()), 'side': side, **{k: float(v[j]) for k, v in live[side].items()}} for side in SIDES for j, d in enumerate(future)]


# ---------------------------------------------------------------- 4. independence: origins, windows and effective sample size
def n_eff(d, lags):
    """Effective number of independent observations of a series whose overlap spans `lags` periods (Bartlett weights, the
    Newey-West variance of a mean): n times the ratio of the plain to the long-run variance, never above n nor below one."""
    d = np.asarray(d, float) - np.mean(d); n = len(d); lags = min(lags, n - 1)
    g = [float(np.dot(d[k:], d[:n - k]) / n) for k in range(lags + 1)]
    lr = g[0] + 2 * sum((1 - k / (lags + 1)) * g[k] for k in range(1, lags + 1))
    return float(min(n, max(1.0, n * g[0] / lr))) if lr > 0 and g[0] > 0 else None


roll = pd.DataFrame(R['rollingDetail'])
independence = []
for (side, h), g in roll.groupby(['side', 'horizon'], sort=False):
    g = g.sort_values('origin'); n = len(g); actual = g.actual.to_numpy()
    ape = {m: np.abs(g[m].to_numpy() / actual - 1) * 100 for m in ('Constante', 'C+S', 'C+S+H')}
    span = (pd.Timestamp(g.origin.iloc[-1]) - pd.Timestamp(g.origin.iloc[0])).days // 7
    # Like the bootstrap intervals, the effective size is estimated only with at least two blocks of h origins; below that the
    # overlap spans most of the sample and a long-run variance cannot be estimated.
    ok = n >= 2 * h
    row = {'side': side, 'horizon': int(h), 'n': n, 'windows': int(span // h + 1), 'nEff': n_eff(ape['C+S+H'] - ape['Constante'], h - 1) if ok else None,
           'nEffChallenger': n_eff(ape['C+S'] - ape['C+S+H'], h - 1) if ok else None,
           'mapeCS': float(ape['C+S'].mean()), 'mapeCSH': float(ape['C+S+H'].mean()), 'diffPp': float(ape['C+S'].mean() - ape['C+S+H'].mean())}
    # The same resampled origins as the published intervals: analyze.py seeds one stream per side and horizon and draws once.
    if ok:
        idx = blocks(n, h, np.random.default_rng([20260928, list(SIDES).index(side), h]))
        diff = ape['C+S'][idx].mean(axis=1) - ape['C+S+H'][idx].mean(axis=1)
        row.update({'diffLow': float(np.percentile(diff, 2.5)), 'diffHigh': float(np.percentile(diff, 97.5)), 'shareCsBetter': float(np.mean(diff < 0))})
    else:
        row.update({'diffLow': None, 'diffHigh': None, 'shareCsBetter': None})
    independence.append(row)


# ---------------------------------------------------------------- 2. transfer: proportional against an estimated relationship
MIN_PAIRS = 26  # half a year of weekly h-week pairs before a slope is estimated at an origin


def pairs(y, ref, h, until):
    """The world's and Antica's log changes over every h-week span of the world's own weekly quotes that ends by `until`."""
    x, z = [], []
    for s in y.index:
        e = s + pd.Timedelta(weeks=h)
        if e > until: break
        if e in y.index and s in ref.index and e in ref.index:
            x.append(math.log(ref[e] / ref[s])); z.append(math.log(y[e] / y[s]))
    return np.array(x), np.array(z)


def fit_slope(x, z):
    beta = float(x @ z / (x @ x)) if len(x) and x @ x > 0 else None
    X = np.column_stack([np.ones(len(x)), x])
    ab = np.linalg.lstsq(X, z, rcond=None)[0] if len(x) > 2 else None
    return beta, (None if ab is None else (float(ab[0]), float(ab[1])))


transfer, transfer_current = [], []
for w in WORLDS:
    if w == A: continue
    for side in SIDES:
        y = weeks[w][side].dropna(); refy = bench[side].dropna()
        for h in (13, 26):
            rows = []
            for origin in y.index:
                target = origin + pd.Timedelta(weeks=h); tr = refy.loc[:origin]
                if target not in y.index or len(tr) < 90 or (origin - refy.index[0]).days < 728: continue
                x, z = pairs(y, refy, h, origin)
                if len(x) < MIN_PAIRS: continue
                beta, ab = fit_slope(x, z)
                if beta is None or ab is None: continue
                gA = float(np.log(preds(tr, origin, [target], 1.0)[0, 3]))
                p = {'prop': y[origin] * math.exp(gA), 'slope': y[origin] * math.exp(beta * gA), 'drift': y[origin] * math.exp(ab[0] + ab[1] * gA), 'naive': y[origin]}
                rows.append({'origin': str(origin.date()), 'beta': beta, **{k: abs(v / y[target] - 1) * 100 for k, v in p.items()}})
            out = {'world': w, 'side': side, 'horizon': h, 'n': len(rows)}
            if rows:
                d = pd.DataFrame(rows); span = (pd.Timestamp(rows[-1]['origin']) - pd.Timestamp(rows[0]['origin'])).days // 7
                out.update({'firstOrigin': rows[0]['origin'], 'lastOrigin': rows[-1]['origin'], 'windows': int(span // h + 1),
                            'mapeProp': float(d.prop.mean()), 'mapeSlope': float(d.slope.mean()), 'mapeDrift': float(d.drift.mean()), 'mapeNaive': float(d.naive.mean()),
                            'betaFirst': float(d.beta.iloc[0]), 'betaLast': float(d.beta.iloc[-1])})
                for k in ('slope', 'drift'):
                    out[f'skill_{k}'] = float((1 - d[k].mean() / d.prop.mean()) * 100)
                    if len(d) >= 2 * h:
                        idx = blocks(len(d), h, np.random.default_rng([20260928, WORLDS.index(w), SIDES.index(side), h, 1]))
                        s = (1 - d[k].to_numpy()[idx].mean(axis=1) / d.prop.to_numpy()[idx].mean(axis=1)) * 100
                        out[f'skill_{k}Low'], out[f'skill_{k}High'] = float(np.percentile(s, 2.5)), float(np.percentile(s, 97.5))
                    else:
                        out[f'skill_{k}Low'] = out[f'skill_{k}High'] = None
            transfer.append(out)
            # The relationship estimated on everything observed by the cutoff, and the world's live scenario under each rule.
            x, z = pairs(y, refy, h, ASOF)
            beta, ab = fit_slope(x, z) if len(x) >= MIN_PAIRS else (None, None)
            wf = [f for f in R['worldForecast'] if f['world'] == w and f['side'] == side]
            f = wf[h - 1] if len(wf) >= h else None
            ref = latest[w][f'{side}BenchmarkRef']; gA = math.log(next(x for x in R['forecast'] if x['side'] == side and x['date'] == f['date'])['base'] / ref) if f else None
            ci = None
            if beta is not None:
                idx = blocks(len(x), h, np.random.default_rng([20260928, WORLDS.index(w), SIDES.index(side), h, 2]))
                bs = (x[idx] * z[idx]).sum(axis=1) / (x[idx] ** 2).sum(axis=1); ci = [float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]
            transfer_current.append({'world': w, 'side': side, 'horizon': h, 'pairs': len(x), 'beta': beta, 'betaLow': ci[0] if ci else None, 'betaHigh': ci[1] if ci else None,
                                     'alpha': ab[0] if ab else None, 'betaDrift': ab[1] if ab else None, 'date': f['date'] if f else None,
                                     'prop': f['base'] if f else None, 'slope': latest[w][side] * math.exp(beta * gA) if f and f['base'] is not None and beta is not None else None,
                                     'drift': latest[w][side] * math.exp(ab[0] + ab[1] * gA) if f and f['base'] is not None and ab else None})


# ---------------------------------------------------------------- 3. anchor: the latest capture against 24- and 72-hour medians
anchors = []
for w in WORLDS:
    m = latest[w]; wf = {(f['side'], f['date']): f for f in R['worldForecast'] if f['world'] == w}
    row = {'world': w, 'date': m['date'], 'source': m['source'], 'ask': m['ask'], 'bid': m['bid'], 'costPct': m['costPct']}
    d13 = str(future[12].date()); f13 = wf.get(('ask', d13))
    row['bandPct'] = float((f13['high'] / f13['base'] - 1) * 100) if f13 and f13['base'] else None  # half-width of the 13-week stress band
    for hours in (24, 72):
        q = window_quote(w, captures, hours, ASOF) if m['source'] == 'Captura' else None
        row[f'n{hours}'] = q['n'] if q else None
        for side in SIDES:
            row[f'{side}{hours}'] = q[side] if q else None
            row[f'{side}Dev{hours}'] = float((m[side] / q[side] - 1) * 100) if q else None
    anchors.append(row)
anchor_live = []
for label, hours in (('latest', 0), ('24h', 24), ('72h', 72)):
    q = published if not hours else window_quote(A, captures, hours, ASOF)
    p = live_paths(q)
    anchor_live.append({'anchor': label, 'ask': q['ask'], 'bid': q['bid'], 'captures': 1 if not hours else q['n'],
                        **{f'{side}{k.capitalize()}': float(p[side]['C+S+H'][list(future).index(near(t))]) for side in SIDES for k, t in MILESTONES.items()},
                        **{f'{side}{k.capitalize()}CS': float(p[side]['C+S'][list(future).index(near(t))]) for side in SIDES for k, t in MILESTONES.items()}})


# ---------------------------------------------------------------- 5. depth: executable Amount and slippage bounds from the captures
SIZES = (100, 1000)
BOOK = {'ask': ('sell', 'sellTopAmount', 'sellVolume', 'goldDemand'), 'bid': ('buy', 'buyTopAmount', 'buyVolume', 'goldSupply')}


def book(c, side, q):
    best, top, vol, gold = (c.get(k) for k in BOOK[side])
    return slippage_bound(best, top, vol, gold, q)


# The gold fields are read as the value of each side: the Sell Offers book averages at or above its best price, the Buy Offers
# book at or below. Captures that contradict it are counted, never used.
consistent = lambda c: c['goldDemand'] / c['sellVolume'] >= c['sell'] and c['goldSupply'] / c['buyVolume'] <= c['buy']
all_caps = [c for c in captures if all(isinstance(c.get(k), (int, float)) and c.get(k) > 0 for k in ('sellVolume', 'buyVolume', 'goldDemand', 'goldSupply', 'sellTopAmount', 'buyTopAmount'))]
inconsistent = [c['hash'] for c in all_caps if not consistent(c)]
depth = []
for w in WORLDS:
    caps = [c for c in all_caps if c['world'] == w and c['hash'] not in inconsistent]
    if not caps: continue
    c = max(caps, key=lambda c: c['capturedAt'])
    row = {'world': w, 'capturedAt': c['capturedAt'], 'captures': len(caps), 'ask': c['sell'], 'bid': c['buy'],
           'askTop': c['sellTopAmount'], 'bidTop': c['buyTopAmount'], 'askVisible': c['sellVolume'], 'bidVisible': c['buyVolume'],
           'askBookAvg': c['goldDemand'] / c['sellVolume'], 'bidBookAvg': c['goldSupply'] / c['buyVolume'], 'costPct': (1 - c['buy'] / c['sell']) * 100}
    for q in SIZES:
        sa, sb = book(c, 'ask', q), book(c, 'bid', q)
        row[f'askSlip{q}'] = None if sa is None else sa * 100; row[f'bidSlip{q}'] = None if sb is None else sb * 100
        row[f'cost{q}'] = None if sa is None or sb is None else (1 - c['buy'] * (1 - sb) / (c['sell'] * (1 + sa))) * 100
        # How often the best price alone covered an order of that size across the world's captures.
        row[f'askTopCovers{q}'] = float(np.mean([x['sellTopAmount'] >= q for x in caps])); row[f'bidTopCovers{q}'] = float(np.mean([x['buyTopAmount'] >= q for x in caps]))
    depth.append(row)
bench_book = [{'capturedAt': c['capturedAt'], 'ask': c['sell'], 'bid': c['buy'], 'askTop': c['sellTopAmount'], 'bidTop': c['buyTopAmount'],
               **{f'{s}Slip{q}': (lambda v: None if v is None else v * 100)(book(c, s, q)) for s in SIDES for q in SIZES}}
              for c in sorted([c for c in all_caps if c['world'] == A], key=lambda c: c['capturedAt'])]


# ---------------------------------------------------------------- 1. filter: the whole pipeline under every Buy/Sell floor
# --baseline-only skips the reruns (for development); the published robustness.json always holds every floor.
FLOORS = (rd.MIN_BID_ASK,) if '--baseline-only' in sys.argv else (None, .70, .75, .80, .85)
PIPELINE = ['analyze.py', 'compare_trades.py', 'complement.py', 'inflation.py', 'lifecycle.py']


def fingerprint(d):
    return hashlib.sha256(''.join(f'{w}\n{frame.to_csv()}' for w, (frame, _) in sorted(d.items())).encode()).hexdigest()


def run_pipeline(floor):
    """The published pipeline on a temporary copy whose research_data.py sets another floor; returns its four outputs."""
    tmp = Path(tempfile.mkdtemp(prefix='tc-floor-'))
    try:
        for name in [*PIPELINE, 'research_data.py', 'universe.py', 'events_bridge.py', 'market-update.json', 'inputs', 'source-package']:
            (shutil.copytree if (ROOT / name).is_dir() else shutil.copy)(ROOT / name, tmp / name)
        src = (tmp / 'research_data.py').read_text(); line = 'MIN_BID_ASK = .8\n'; assert src.count(line) == 1
        (tmp / 'research_data.py').write_text(src.replace(line, f'MIN_BID_ASK = {floor!r}\n'))
        for script in PIPELINE: subprocess.run([sys.executable, script], cwd=tmp, check=True, stdout=subprocess.DEVNULL, env={**__import__('os').environ,'TIBINANCE_REPOSITORY':str(ROOT.parents[1])})
        return tuple(json.load(open(tmp / f)) for f in ('results.json', 'complement.json', 'inflation.json', 'lifecycle.json'))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def headlines(R, C, I, L):
    """The figures the report's conclusions rest on, keyed for comparison across floors."""
    h, P = {}, C['probabilistic']
    run = lambda side, sample: next(x for x in P['sides'][side][sample]['runs'] if x['seed'] == 11)
    h['worlds'] = len(R['worlds'])
    for side in SIDES:
        a = next(w for w in R['worlds'] if w['world'] == R['benchmark'])[side]; h[f'anchor.{side}'] = a
        fd = sorted({f['date'] for f in R['forecast']})
        for k, t in MILESTONES.items():
            d = min(fd, key=lambda x: abs(pd.Timestamp(x) - pd.Timestamp(t))); h[f'scenario.{side}.{k}'] = next(f for f in R['forecast'] if f['side'] == side and f['date'] == d)['base']
    for m in R['validation']['metrics']:
        if m['model'] in ('Constante', 'C+S', 'C+S+H'): h[f"mape.{m['side']}.{m['horizon']}.{m['model']}"] = m['mape']
    for s in R['validation']['skill']:
        if s['model'] == 'C+S+H' and s['reference'] == 'Constante':
            h[f"skill.{s['side']}.{s['horizon']}"] = s['skill']; h[f"skillLow.{s['side']}.{s['horizon']}"] = s['skillLow']
    for side in SIDES:
        for hz in (13, 26, 52):
            cells = [x for x in R['validation']['ablation'] if x['side'] == side and x['horizon'] == hz]
            if cells: h[f'best.{side}.{hz}'] = min(cells, key=lambda x: x['mape'])['model']
    for c in R['cycles']: h[f"cycle.{c['year']}.{c['side']}"] = f"{c['lowDate']}/{c['highDate']}"; h[f"range.{c['year']}.{c['side']}"] = c['rangePct']
    sw = C['swings']['sides']['ask']
    h['pivots.ask'] = ' '.join(f"{p['type']}{p['date']}" for p in sw['pivots']); h['declines.ask'] = [d['changePct'] for d in sw['declines']]
    s = [x for x in R['seasonality'] if x['side'] == 'ask' and x['medianPct'] is not None]
    h['season.high'] = max(s, key=lambda x: x['medianPct'])['month']; h['season.low'] = min(s, key=lambda x: x['medianPct'])['month']
    for sample in ('main', 'since2024'):
        r = run('ask', sample)
        for k in ('peakAbove3', 'peakAfterOct31', 'nov30AboveStart', 'jun28BelowStart', 'troughAbove2026', 'jun28BelowNov30'): h[f'prob.{sample}.{k}'] = r['prob'][k]
        h[f'prob.{sample}.fromPeakGt10'] = r['fall']['fromPeakGt10']; h[f'level.{sample}.peak'] = r['peakLevel'][1]; h[f'level.{sample}.trough'] = r['troughLevel'][1]
        h[f'prob.{sample}.takerGain'] = next(x for x in P['roundtrip'] if x['sample'] == sample and x['mode'] == 'aceitando')['pGain']
        if 'decisions' in P:
            h[f'prob.{sample}.buyerJun'] = next(x for x in P['decisions']['buyer'][sample] if x['plan'] == 'jun')['pBetter']
            h[f'prob.{sample}.sellerNov'] = next(x for x in P['decisions']['seller'][sample] if x['plan'] == 'nov')['pBetter']
    pooled = next(x for x in P['calibrationDiagnostics'] if x['side'] == 'ask' and x['horizon'] == 0); h['calibration.meanP'] = pooled['meanP']; h['calibration.freq'] = pooled['freq']
    for side in SIDES:
        t = [x for x in R['transferRolling'] if x['side'] == side and x['horizon'] == 13 and x.get('skillLow') is not None]
        h[f'transfer.{side}.beats'] = sum(x['skillLow'] > 0 for x in t); h[f'transfer.{side}.tested'] = len(t)
    for g in C['crossWorld']['groups']:
        if g['side'] == 'ask': h[f"premium.{g['group']}"] = g['recentMedianPct']
    for m in I['models']: h[f"trend.{m['side']}.{m['since'][:4]}"] = m['annualTrendPct']
    for x in I['comparison']:
        if x['world'] == R['benchmark']: h[f"inflation.{x['side']}"] = x['yoyPct']
    for x in L['terribra']['backtest']: h[f"terribra.{x['side']}.{x['horizon']}.{x['model']}"] = x['mape']
    for x in L['ageAnalogy']['scenarios']:
        if x['horizon'] in (4, 13) and x['model'] != 'Constant' and x.get('value') is not None: h[f"floribra.{x['side']}.{x['horizon']}.{x['model']}.{x['regime']}"] = x['value']
    return h


# Statements the report makes, as tests on the headline figures; a floor that flips one changes a conclusion.
VERDICTS = [
    ('Ensemble beats Constant at 13 weeks, interval above zero (Sell Offers)', lambda h: h['skillLow.ask.13'] is not None and h['skillLow.ask.13'] > 0),
    ('Ensemble beats Constant at 26 weeks, interval above zero (Sell Offers)', lambda h: h['skillLow.ask.26'] is not None and h['skillLow.ask.26'] > 0),
    ('Best component combination at 13, 26 and 52 weeks (Sell Offers)', lambda h: ' / '.join(h.get(f'best.ask.{z}', '') for z in (13, 26, 52))),
    ('Turning points of the Sell Offers', lambda h: h['pivots.ask']),
    ('Complete declines narrowing from cycle to cycle', lambda h: all(abs(b) < abs(a) for a, b in zip(h['declines.ask'], h['declines.ask'][1:]))),
    ('Months with the highest and lowest median change', lambda h: f"{h['season.high']} / {h['season.low']}"),
    ('Peak at least 3% above today more likely than not', lambda h: h['prob.main.peakAbove3'] > .5),
    ('Week of 28 June below today more likely than not', lambda h: h['prob.main.jun28BelowStart'] > .5),
    ('Fall of more than 10% from the peak more likely than not', lambda h: h['prob.main.fromPeakGt10'] > .5),
    ('Taker sell-and-rebuy gains in more than half of paths', lambda h: h['prob.main.takerGain'] > .5),
    ('Worlds where the transfer beats Constant (Sell Offers, 13 weeks)', lambda h: f"{h['transfer.ask.beats']} of {h['transfer.ask.tested']}"),
    ('Sign of 12-month inflation (Sell Offers)', lambda h: h['inflation.ask'] > 0),
]
base_fp = fingerprint(data); base_h = headlines(R, C, I, L)
runs, filter_rows = {base_fp: base_h}, []
for floor in FLOORS:
    d = data if floor == rd.MIN_BID_ASK else build(floor); fp = fingerprint(d)
    if fp not in runs: runs[fp] = headlines(*run_pipeline(floor))
    h = runs[fp]
    changed = {w: {side: int((~np.isclose(*d[w][0][side].align(data[w][0][side], join='outer'), equal_nan=True)).sum()) if w in data else None for side in SIDES}
               for w in d if w not in data or not d[w][0].equals(data[w][0])}
    diffs = {}
    for k, v in base_h.items():
        a = h.get(k)
        if isinstance(v, (int, float)) and isinstance(a, (int, float)) and not isinstance(v, bool): diffs[k] = a - v
    probs = {k: abs(v) * 100 for k, v in diffs.items() if k.startswith('prob.')}
    levels = {k: abs(h[k] / base_h[k] - 1) * 100 for k in diffs if k.startswith(('scenario.', 'level.', 'anchor.'))}
    mapes = {k: abs(v) for k, v in diffs.items() if k.startswith('mape.')}
    top = lambda m: max(m.items(), key=lambda kv: kv[1]) if m else (None, 0.0)
    filter_rows.append({'floor': floor, 'baseline': floor == rd.MIN_BID_ASK, 'sameData': fp == base_fp, 'excluded': sum(q['wideSpread'] for _, q in d.values()),
                        'excludedByWorld': {w: q['wideSpread'] for w, (_, q) in d.items() if q['wideSpread']}, 'changedDays': changed,
                        'maxProbPp': top(probs)[1], 'maxProbKey': top(probs)[0], 'maxLevelPct': top(levels)[1], 'maxLevelKey': top(levels)[0],
                        'maxMapePp': top(mapes)[1], 'maxMapeKey': top(mapes)[0],
                        'verdicts': [{'statement': s, 'baseline': f(base_h), 'value': f(h), 'changed': f(h) != f(base_h)} for s, f in VERDICTS],
                        'headlines': {k: h.get(k) for k in base_h}})

out = js({'asOf': str(ASOF.date()), 'benchmark': A,
          'filter': {'baselineFloor': rd.MIN_BID_ASK, 'floors': list(FLOORS), 'runs': len(runs), 'rows': filter_rows},
          'transfer': {'minPairs': MIN_PAIRS, 'rolling': transfer, 'current': transfer_current},
          'anchor': {'worlds': anchors, 'benchmark': anchor_live},
          'independence': independence,
          'depth': {'sizes': list(SIZES), 'worlds': depth, 'benchmark': bench_book, 'inconsistent': len(inconsistent), 'captures': len(all_caps)},
          'challenger': challenger,
          'sources': [{'file': f, 'sha256': hashlib.sha256((ROOT / f).read_bytes()).hexdigest()} for f in ('results.json', 'complement.json', 'inflation.json', 'lifecycle.json', 'market-update.json', 'research_data.py', 'analyze.py')]})
(ROOT / 'robustness.json').write_text(json.dumps(out, ensure_ascii=False, indent=1, allow_nan=False))
print(json.dumps({'filter': [{k: r[k] for k in ('floor', 'sameData', 'excluded', 'maxProbPp', 'maxLevelPct', 'maxMapePp')} | {'flips': [v['statement'] for v in r['verdicts'] if v['changed']]} for r in out['filter']['rows']],
                  'independence': [{k: r[k] for k in ('side', 'horizon', 'n', 'windows', 'nEff', 'diffPp', 'diffLow', 'diffHigh')} for r in independence]}, indent=1))
