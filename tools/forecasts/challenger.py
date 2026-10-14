"""A prospective challenger: Tibia Coin Sell Offer forecasts from gold generation potential, archived, never shown.

    python tools/forecasts/challenger.py            generate today's edition and archive it (idempotent)
    python tools/forecasts/challenger.py --dry-run  print what would be archived

Stage E (reports/economy/README.md) found that no gold-based specification beats the no-change forecast out of
sample, so none enters the published Projections. The plan still registers the best one as a challenger, so that
genuine forecasts, made before their outcomes and archived with complete inputs, accumulate for a later comparison.
That is specification E, the best of the gold specifications at 4 and 13 weeks:

    log(P[t+h] / P[t]) = a_h + b_h * g13(gross potential)[t] + c_h * g13(players killed)[t]

where P is the Research weekly median Sell Offer (reports/tc-cycle rules), g13 the 13-week log growth of a world's
weekly gross potential from valued creatures (data/economy/gold, latest evidence) and of players killed by creatures,
and h is 1, 4 or 13 weeks. The coefficients are least squares on every pair whose target had been observed by the
cutoff, pooled over worlds. At generation everything used is available, so the forecast is point-in-time by
construction; the snapshot keeps the exact feature values and coefficients, so later evidence corrections never
change what was predicted (corrections 11 and 12).

The edition is a `tc-gold-challenger` forecast in the archive (role: challenger). It has no website representation:
it is published to the repository by tools/forecasts/publish.py, evaluated by evaluate.py like any forecast, and
never presented as a Tibinance projection.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import archive as ar  # noqa: E402

PRODUCT = 'tc-gold-challenger'
HORIZONS = (1, 4, 13)
GROWTH_WEEKS = 13
MAX_FEATURE_AGE_WEEKS = 6
MIN_COVERAGE = 0.9
FEATURES = ('grossPotential', 'playerDeaths')
TARGET = ('Weekly median of daily Sell Offers (API daily median; capture median only on days without one) for the '
          'Monday to Sunday week that holds the target date; the Research scoring rule')
CONFIG = {'specification': 'E: log price change on the 13-week log growth of gross potential and of players killed',
          'side': 'ask', 'horizonsWeeks': list(HORIZONS), 'growthWeeks': GROWTH_WEEKS, 'maxFeatureAgeWeeks': MAX_FEATURE_AGE_WEEKS,
          'minKillCoverage': MIN_COVERAGE, 'fit': 'ordinary least squares with a constant, pooled over worlds, on every '
          'origin whose target week was observed by the cutoff', 'interval': 'none: point forecasts'}
PROGRAMS = ('tools/forecasts/challenger.py', 'reports/economy/economy_research.py', 'reports/tc-cycle/research_data.py',
            'tools/forecasts/evaluate.py', 'tools/economy/build_gold.mjs')
DATASETS = ('data/economy/gold/index.json', 'data/economy/sources/killstats.json', 'data/market-history/tibia-coin/index.json')


def predict(snapshot: dict) -> dict:
    """The outputs from the snapshot alone (standard library), so reproduce.py can rebuild them exactly."""
    paths = []
    for w in snapshot['worlds']:
        for h in HORIZONS:
            c = snapshot['coefficients'][str(h)]
            log_change = c['const'] + sum(c[f] * w['features'][f] for f in FEATURES)
            paths.append({'world': w['world'], 'side': 'ask', 'horizon': h,
                          'date': (_add_days(snapshot['origin'], 7 * h)), 'base': w['p0'] * math.exp(log_change),
                          'low': None, 'high': None, 'origin': snapshot['origin'], 'p0': w['p0']})
    return {'kind': PRODUCT, 'asOf': snapshot['asOf'], 'origin': snapshot['origin'], 'worldPaths': paths}


def _add_days(iso: str, k: int) -> str:
    from datetime import date, timedelta
    return (date.fromisoformat(iso) + timedelta(days=k)).isoformat()


def _sha_file(path: str) -> str:
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def snapshot_now() -> dict:
    """Features, training and coefficients from the data in the working tree."""
    import numpy as np
    import pandas as pd
    sys.path.insert(0, str(ROOT / 'reports' / 'economy'))
    import economy_research as er

    gold = er.gold_weekly(er.gold_daily(er.GOLD))
    prices, cutoff, _ = er.weekly_prices()
    cutoff = pd.Timestamp(cutoff)
    gold['wkey'] = gold['world'].str.lower()
    frames = []
    for world, g in gold.groupby('world'):
        g = g.set_index('week').asfreq('W-SUN')
        f = pd.DataFrame({c: np.log(g[c].where(g[c] > 0)).diff(GROWTH_WEEKS) for c in FEATURES})
        f['coverage'] = g['coverage']
        f['world'] = world
        frames.append(f.reset_index())
    feats = pd.concat(frames, ignore_index=True).replace([np.inf, -np.inf], np.nan).dropna(subset=[*FEATURES, 'coverage'])
    feats = feats[feats['coverage'] >= MIN_COVERAGE]
    names = {w.lower(): w for w in gold['world'].unique()}
    ask = {names[k]: s.set_index('week')['ask'].dropna() for k, s in prices.groupby('wkey') if k in names}
    # The origin: the last complete price week (its Sunday on or before the cutoff).
    origin = cutoff - pd.Timedelta(days=(cutoff.weekday() + 1) % 7)
    if origin.weekday() != 6:
        raise SystemExit(f'origin {origin.date()} is not a Sunday')

    def feature_at(world, t):
        x = feats[(feats['world'] == world) & (feats['week'] <= t) & (feats['week'] >= t - pd.Timedelta(weeks=MAX_FEATURE_AGE_WEEKS))]
        return None if x.empty else x.sort_values('week').iloc[-1]

    by_world = {w: g.sort_values('week').set_index('week') for w, g in feats.groupby('world')}
    coefficients, training = {}, {}
    for h in HORIZONS:
        rows = []
        for world, s in ask.items():
            f = by_world.get(world)
            if f is None:
                continue
            for t, p0 in s.items():
                t1 = t + pd.Timedelta(weeks=h)
                if t1 > origin or t1 not in s.index or not (p0 > 0 and s[t1] > 0):
                    continue
                known = f[(f.index <= t) & (f.index >= t - pd.Timedelta(weeks=MAX_FEATURE_AGE_WEEKS))]
                if known.empty:
                    continue
                x = known.iloc[-1]
                rows.append([math.log(s[t1] / p0), *[float(x[c]) for c in FEATURES]])
        a = np.asarray(rows, float)
        X = np.column_stack([np.ones(len(a)), a[:, 1:]])
        beta = np.linalg.lstsq(X, a[:, 0], rcond=None)[0]
        coefficients[str(h)] = {'const': float(beta[0]), **{c: float(b) for c, b in zip(FEATURES, beta[1:])}}
        training[str(h)] = {'pairs': int(len(a)), 'worlds': int(len({r for r in ask if r in by_world})),
                            'residualStd': float(np.std(a[:, 0] - X @ beta, ddof=X.shape[1]))}
    worlds = []
    for world, s in sorted(ask.items()):
        if origin not in s.index or not s[origin] > 0:
            continue
        x = feature_at(world, origin)
        if x is None:
            continue
        worlds.append({'world': world, 'p0': float(s[origin]), 'featureWeek': str(x['week'].date()),
                       'features': {c: float(x[c]) for c in FEATURES}, 'killCoverage': float(x['coverage'])})
    gold_index = json.loads((ROOT / DATASETS[0]).read_text())
    return {'kind': f'{PRODUCT}-inputs', 'asOf': str(cutoff.date()), 'origin': str(origin.date()), 'config': CONFIG,
            'coefficients': coefficients, 'training': training, 'worlds': worlds,
            'gold': {'mode': gold_index.get('mode'), 'methodology': gold_index.get('methodology'), 'evidence': gold_index.get('evidence'),
                     'killstats': gold_index.get('killstats')},
            'datasets': [{'path': p, 'sha256': _sha_file(p)} for p in DATASETS]}


def body_of(snapshot: dict, outputs: dict) -> dict:
    programs = {p: _sha_file(p) for p in PROGRAMS}
    gold_through = max((w['featureWeek'] for w in snapshot['worlds']), default=snapshot['origin'])
    return {
        'type': 'forecast', 'product': PRODUCT, 'role': 'challenger',
        'edition': f"{PRODUCT}/{snapshot['asOf']}/{gold_through}",
        'model': {'id': 'E gold challenger', 'version': programs['tools/forecasts/challenger.py'], 'config': CONFIG},
        'dataCutoff': snapshot['asOf'], 'createdAt': {'value': ar.now(), 'basis': 'generation time'},
        'target': {'definition': TARGET, 'unit': 'gold per Tibia Coin', 'sides': ['ask'], 'sideNames': {'ask': 'Sell Offers'}},
        'horizon': {'unit': 'week', 'steps': len(HORIZONS), 'weeks': list(HORIZONS), 'stepDays': 7},
        'interval': {'kind': 'none', 'meaning': 'point forecasts only'},
        'outputs': {'object': None, 'digest': ar.sha(ar.canonical(outputs)), 'rows': len(outputs['worldPaths'])},
        'inputs': {'object': None, 'missing': [], 'datasets': snapshot['datasets'], 'programs': programs,
                   'codeCommit': ar.git('rev-parse', 'HEAD', check=False).strip() or None, 'seed': None,
                   'runtime': 'deterministic least squares; no random component'},
        'reproducibility': {'prediction': 'complete inputs (tools/forecasts/reproduce.py rebuilds the outputs)',
                            'research': 'from this repository at codeCommit with the economy caches rebuilt (PROGRESS.md)',
                            'missing': []},
        'provenance': 'authentic', 'source': {'generator': 'tools/forecasts/challenger.py'},
    }


def ensure(records: list[dict], snapshot: dict, *, basis: str = 'generation') -> dict | None:
    """Archives the edition unless the same outputs are already archived; returns the new record or None."""
    outputs = predict(snapshot)
    digest = ar.sha(ar.canonical(outputs))
    if any(r['type'] == 'forecast' and r['product'] == PRODUCT and r['outputs']['digest'] == digest for r in records):
        return None
    body = body_of(snapshot, outputs)
    body['outputs']['object'] = ar.put_object(outputs)
    body['inputs']['object'] = ar.put_object(snapshot)
    return ar.append(records, body, basis)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args()
    snapshot = snapshot_now()
    if args.dry_run:
        outputs = predict(snapshot)
        print(json.dumps({'asOf': snapshot['asOf'], 'origin': snapshot['origin'], 'coefficients': snapshot['coefficients'],
                          'training': snapshot['training'], 'worlds': len(snapshot['worlds']), 'rows': len(outputs['worldPaths'])}, indent=1))
        return
    records = ar.load()
    record = ensure(records, snapshot)
    if record:
        from index import write_index   # the derived view the site reads stays a fresh build of the chains
        write_index(records)
    print(f"archived {record['edition']} ({record['outputs']['rows']} points)" if record else 'challenger: these outputs are already archived')


if __name__ == '__main__':
    main()
