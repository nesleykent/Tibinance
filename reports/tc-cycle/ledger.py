"""The prospective forecast ledger: forecast-ledger.jsonl, append-only.

Each edition's forecasts are frozen once, at the first run for a research cutoff, before any of their targets can be observed;
later runs for the same cutoff never replace them. Once a target week closes (its Sunday on or before a later cutoff), one
outcome record is appended with the realized weekly median and the error of every model for that week. No line is ever
rewritten: each line carries the SHA-256 of the line before it and of its own content, and validate.py checks the chain and
that the committed ledger is a prefix of the working one.

A forecast record holds, for Antica, the weekly scenario of Constant (C), Seasonal Naive (S), Harmonic (H), the registered
challenger C+S and the published ensemble C+S+H, on both sides; the P10 to P90 of the simulated paths (seed 11, both training
windows); and, for every other world, its 13- and 26-week scenario under the proportional transfer and under the estimated
slope and slope-with-drift relationships. It also records the anchor, the cutoff and the SHA-256 of every program and input,
enough to reconstruct what each model predicted from which data before the outcome was known.

A target is the week, ending on Sunday, that holds the forecast date; it is scored on that week's median of daily offers, the
series every backtest uses. Run after analyze.py, compare_trades.py, complement.py and robustness.py.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, math
import pandas as pd
from research_data import research_cutoff, load_captures, api_rows, build_daily, weekly_series
from universe import api_worlds

ROOT = Path(__file__).resolve().parent
LEDGER = ROOT / 'forecast-ledger.jsonl'
SIDES = ('ask', 'bid')
MODELS = {'C': 'Constante', 'S': 'Sazonal 52 semanas', 'H': 'Harmônico', 'C+S': 'C+S', 'C+S+H': 'C+S+H'}
PROGRAMS = ('research_data.py', 'universe.py', 'events_bridge.py', '../../js/events.js', '../../tools/events.mjs', 'analyze.py', 'compare_trades.py', 'complement.py', 'robustness.py', 'ledger.py')
INPUTS = ('market-update.json', '../../data/events/events.json', 'results.json', 'complement.json', 'robustness.json')
sha = lambda b: hashlib.sha256(b).hexdigest()
week_of = lambda iso: str((pd.Timestamp(iso) + pd.Timedelta(days=(6 - pd.Timestamp(iso).weekday()) % 7)).date())


def canonical(record):
    return json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def read():
    """The ledger's records after checking every link of the chain."""
    records, prev = [], '0' * 64
    for line in LEDGER.read_text().splitlines() if LEDGER.exists() else []:
        r = json.loads(line); body = {k: v for k, v in r.items() if k != 'hash'}
        assert r['prev'] == prev and r['hash'] == sha(canonical(body).encode()) and r['seq'] == len(records) + 1, f"ledger broken at line {len(records) + 1}"
        records.append(r); prev = sha(line.encode())
    return records, prev


def append(records, prev, record):
    record = {'seq': len(records) + 1, 'prev': prev, **record}
    line = canonical({**record, 'hash': sha(canonical(record).encode())})
    with LEDGER.open('a') as f: f.write(line + '\n')
    records.append(json.loads(line))
    return sha(line.encode())


def forecast_record(cutoff):
    R, C, X = (json.loads((ROOT / f).read_text()) for f in ('results.json', 'complement.json', 'robustness.json'))
    assert R['asOf'] == C['asOf'] == X['asOf'] == str(cutoff.date()), 'outputs from another cutoff: rerun the pipeline first'
    A = R['benchmark']; m = next(w for w in R['worlds'] if w['world'] == A)
    dates = sorted({x['date'] for x in X['challenger']})
    antica = {side: {k: [next(x for x in X['challenger'] if x['side'] == side and x['date'] == d)[v] for d in dates] for k, v in MODELS.items()} for side in SIDES}
    fan = {}
    for f in C['probabilistic']['fan']:
        fan.setdefault(f['sample'], {}).setdefault(f['side'], {}).setdefault('weeks', []).append(f['date'])
        fan[f['sample']][f['side']].setdefault('quantiles', []).append([f[k] for k in ('p10', 'p25', 'p50', 'p75', 'p90')])
    worlds = [{k: x[k] for k in ('world', 'side', 'horizon', 'date', 'prop', 'slope', 'drift', 'beta', 'alpha', 'betaDrift')} | {'weekEnding': week_of(x['date'])}
              for x in X['transfer']['current'] if x['date'] and x['prop'] is not None]
    return {'type': 'forecast', 'id': str(cutoff.date()), 'cutoff': str(cutoff.date()), 'recordedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'benchmark': A, 'anchor': {k: m[k] for k in ('ask', 'bid', 'date', 'source')},
            'config': {'programs': {p: sha((ROOT / p).read_bytes()) for p in PROGRAMS}, 'inputs': {p: sha((ROOT / p).read_bytes()) for p in INPUTS},
                       'published': 'C+S+H: equal weights on the log changes of Constant, Seasonal Naive (52 weeks) and Harmonic (trend and two annual harmonics), trained on the 130 weeks before the origin',
                       'challenger': 'C+S: equal weights on Constant and Seasonal Naive, same training',
                       'fan': 'ARIMA(1,1,0) errors around a trend and two annual harmonics, 300 parameter draws x 20 paths, seed 11',
                       'transfer': 'proportional: the world anchor times the benchmark ensemble change; slope and drift: estimated on the world\'s h-week changes to the cutoff',
                       'scoring': 'weekly median of daily offers in the week ending on the Sunday that holds the target date'},
            'targets': dates, 'weekEnding': [week_of(d) for d in dates], 'antica': antica, 'fan': fan, 'worlds': worlds}


def observed(cutoff):
    caps = load_captures(cutoff)
    out = {}
    for w in api_worlds():
        d = build_daily(api_rows(w), [c for c in caps if c['world'] == w], cutoff)[0]
        if not d.empty: out[w] = weekly_series(d, cutoff)
    return out


def outcomes(records, prev, cutoff):
    """One record per frozen forecast and closed target week not yet scored; weeks without an offer are skipped until observed."""
    weeks, done = None, {(r['forecast'], r['weekEnding']) for r in records if r['type'] == 'outcome'}
    for f in [r for r in records if r['type'] == 'forecast']:
        due = sorted({w for w in f['weekEnding'] if pd.Timestamp(w) <= cutoff} | {x['weekEnding'] for x in f['worlds'] if pd.Timestamp(x['weekEnding']) <= cutoff})
        for wk in due:
            if (f['seq'], wk) in done: continue
            weeks = weeks or observed(cutoff); t = pd.Timestamp(wk)
            actual = lambda w, side: (lambda v: None if v is None or not math.isfinite(v) else float(v))(weeks[w][side].get(t)) if w in weeks else None
            score = lambda p, a: {'predicted': p, 'ape': abs(p / a - 1) * 100, 'logError': math.log(a / p) * 100}
            rec = {'type': 'outcome', 'forecast': f['seq'], 'forecastHash': f['hash'], 'weekEnding': wk, 'cutoff': str(cutoff.date()),
                   'recordedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'antica': {}, 'fan': {}, 'worlds': []}
            if wk in f['weekEnding']:
                j = f['weekEnding'].index(wk)
                for side in SIDES:
                    a = actual(f['benchmark'], side)
                    if a is None: continue
                    rec['antica'][side] = {'actual': a, 'horizon': j + 1, **{k: score(v[j], a) for k, v in f['antica'][side].items()}}
                for sample, sides in f['fan'].items():
                    for side, q in sides.items():
                        a = actual(f['benchmark'], side)
                        if a is not None and wk in q['weeks']:
                            qs = q['quantiles'][q['weeks'].index(wk)]
                            rec['fan'].setdefault(sample, {})[side] = {'actual': a, 'inside80': qs[0] <= a <= qs[4], 'inside50': qs[1] <= a <= qs[3], 'belowMedian': a < qs[2]}
            for x in f['worlds']:
                a = actual(x['world'], x['side'])
                if x['weekEnding'] == wk and a is not None:
                    rec['worlds'].append({'world': x['world'], 'side': x['side'], 'horizon': x['horizon'], 'actual': a,
                                          **{k: score(x[k], a) for k in ('prop', 'slope', 'drift') if x[k] is not None}})
            if rec['antica'] or rec['worlds']: prev = append(records, prev, rec)
    return prev


if __name__ == '__main__':
    cutoff = research_cutoff()
    records, prev = read()
    if not any(r['type'] == 'forecast' and r['id'] == str(cutoff.date()) for r in records):
        prev = append(records, prev, forecast_record(cutoff))
    prev = outcomes(records, prev, cutoff)
    print(f"{LEDGER.name}: {sum(r['type'] == 'forecast' for r in records)} frozen forecasts, {sum(r['type'] == 'outcome' for r in records)} scored weeks")
