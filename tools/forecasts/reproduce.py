"""Prediction reproducibility: rebuild an archived forecast's outputs from its archived input snapshot alone.

    python3 tools/forecasts/reproduce.py --all      every archived edition whose snapshot is complete
    python3 tools/forecasts/reproduce.py <contentHash prefix>

Needs numpy (the Research's pinned requirements). The model is the Research's C+S+H ensemble and world transfer
(reports/tc-cycle/analyze.py), restated here because analyze.py runs the whole pipeline when imported. Agreement is
required to 1e-12 relative; the published editions reproduce to machine precision (about 4e-16).

This checks prediction reproducibility only. Full research reproducibility, rebuilding the snapshot itself from the
frozen inputs, needs the repository at the edition's codeCommit and the Research pipeline.
"""
from __future__ import annotations

import math
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from archive import load, get_object  # noqa: E402

TOLERANCE = 1e-12
STATUS_MERGED = 'Suspenso: fusão anunciada'
STATUS_STALE = 'Condicional: cotação defasada'
STATUS_OK = 'Cenário de ofertas'
STATUS_CROSSED = 'Condicional: pontas cruzadas'


def _features(ds, t0):
    t = np.asarray([(d - t0).days / 365.25 for d in ds])
    return np.column_stack([np.ones(len(t)), t, *[f(2 * np.pi * k * t) for k in (1, 2) for f in (np.sin, np.cos)]])


def _components(train, origin, future, cfg):
    t0 = date.fromisoformat(cfg['harmonicOrigin'])
    train = [(d, v) for d, v in train if d <= origin and v is not None and d >= origin - timedelta(weeks=cfg['trainingWeeks'])]
    yy = np.log(np.array([v for _, v in train]))
    b = np.linalg.lstsq(_features([d for d, _ in train], t0), yy, rcond=None)[0]
    harmonic = (_features(future, t0) - _features([origin], t0)) @ b

    def prior(d):
        s = [(x, v) for x, v in train if abs((x - d).days) <= cfg['seasonalToleranceDays']]
        if not s:
            return None
        i = int(np.argmin([abs((x - d).days) for x, _ in s]))
        return float(np.log(s[i][1]))

    lag = timedelta(weeks=cfg['seasonalLagWeeks'])
    prev = prior(origin - lag)
    seasonal = []
    for d in future:
        v = prior(d - lag)
        seasonal.append(v - prev if v is not None and prev is not None else np.nan)
    return np.column_stack([np.zeros(len(future)), np.array(seasonal), harmonic])


def _quantile(xs, q):
    """Linear interpolation between order statistics (pandas' default)."""
    xs = sorted(xs)
    pos = (len(xs) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def scenarios(snapshot: dict) -> dict:
    cfg = snapshot['config']
    asof = date.fromisoformat(snapshot['asOf'])
    future = [asof + timedelta(days=cfg['stepDays'] * (j + 1)) for j in range(cfg['periods'])]
    bench = snapshot['benchmark']
    worlds = {w['world']: w for w in snapshot['worlds']}
    benchmark_paths, world_paths = [], []
    for side in ('ask', 'bid'):
        series = {date.fromisoformat(d): v for d, v in snapshot['benchmarkWeekly'][side]}
        ref = snapshot['benchmarkAnchor'][side]
        series[asof] = ref
        a = _components(sorted(series.items()), asof, future, cfg)
        pr = np.exp(np.log(ref) + np.column_stack([a, np.nanmean(a, axis=1)]))
        for j, d in enumerate(future):
            nearest = min(cfg['stressHorizons'], key=lambda v: abs(v - (j + 1)))
            err = [abs(e) for e in snapshot['backtestLogErrors'][side][str(nearest)]]
            stress = max(_quantile(err, cfg['stressQuantile']), float(np.nanmax(abs(np.log(pr[j, :3] / pr[j, 3])))))
            benchmark_paths.append({'date': str(d), 'side': side, 'constant': pr[j, 0], 'seasonal': pr[j, 1], 'harmonic': pr[j, 2],
                                    'base': pr[j, 3], 'low': pr[j, 3] * math.exp(-stress), 'high': pr[j, 3] * math.exp(stress), 'stressLog': stress})
    for w in sorted(worlds):
        m = worlds[w]
        rows = []
        for side in ('ask', 'bid'):
            fc = [x for x in benchmark_paths if x['side'] == side]
            for f in fc:
                base = m[side] * f['base'] / m[side + 'BenchmarkRef']
                stress = f['stressLog'] + m[side + 'LocalStress']
                merged = m.get('mergerDate') is not None and f['date'] >= m['mergerDate']
                rows.append({'world': w, 'date': f['date'], 'side': side, 'base': None if merged else base,
                             'low': None if merged else base * math.exp(-stress), 'high': None if merged else base * math.exp(stress),
                             'status': STATUS_MERGED if merged else STATUS_STALE if m['stale'] else STATUS_OK,
                             'anchorDate': m['date'], 'localStress': m[side + 'LocalStress']})
        asks = {x['date']: x for x in rows if x['side'] == 'ask'}
        crossed = {x['date'] for x in rows if x['side'] == 'bid' and x['base'] is not None and x['base'] >= asks[x['date']]['base']}
        for x in rows:
            if x['date'] in crossed:
                x['status'] = STATUS_CROSSED
        world_paths += rows
    return {'benchmarkPaths': benchmark_paths, 'worldPaths': world_paths}


def compare(rebuilt: dict, published: dict) -> dict:
    """Largest relative difference over every number, and the first mismatch of anything else."""
    worst, mismatch = 0.0, None
    for key in ('benchmarkPaths', 'worldPaths'):
        a = sorted(rebuilt[key], key=lambda x: (x.get('world', ''), x['side'], x['date']))
        b = sorted(published[key], key=lambda x: (x.get('world', ''), x['side'], x['date']))
        if len(a) != len(b):
            return {'ok': False, 'maxRelDiff': None, 'mismatch': f'{key}: {len(a)} rows rebuilt, {len(b)} published'}
        for x, y in zip(a, b):
            for k, v in y.items():
                if k in ('errorSample',):
                    continue
                u = x.get(k)
                if isinstance(v, float) and isinstance(u, (float, int)):
                    worst = max(worst, abs(u / v - 1) if v else abs(u))
                elif u != v and mismatch is None:
                    mismatch = f"{key} {y.get('world', '')} {y['side']} {y['date']} {k}: rebuilt {u!r}, published {v!r}"
    return {'ok': mismatch is None and worst <= TOLERANCE, 'maxRelDiff': worst, 'mismatch': mismatch}


def reproduce_record(record: dict) -> dict:
    snapshot = get_object(record['inputs']['object'])
    outputs = get_object(record['outputs']['object'])
    return compare(scenarios(snapshot), {'benchmarkPaths': outputs['benchmarkPaths'], 'worldPaths': outputs['worldPaths']})


def main() -> None:
    wanted = sys.argv[1] if len(sys.argv) > 1 else '--all'
    records = [r for r in load() if r['type'] == 'forecast' and r['product'] == 'tc-world-scenarios'
               and (wanted == '--all' or r['contentHash'].startswith(wanted))]
    failed = 0
    for r in records:
        if r['inputs']['missing']:
            print(f"SKIP {r['edition']} {r['contentHash'][:12]}: snapshot incomplete ({', '.join(r['inputs']['missing'])})")
            continue
        res = reproduce_record(r)
        failed += not res['ok']
        print(f"{'PASS' if res['ok'] else 'FAIL'} {r['edition']} {r['contentHash'][:12]}: max relative difference {res['maxRelDiff']}"
              + (f"; {res['mismatch']}" if res['mismatch'] else ''))
    print(f'{len(records) - failed} of {len(records)} editions reproduced from their snapshots' if records else 'no editions')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
