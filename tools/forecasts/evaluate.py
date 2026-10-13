"""Forecast evaluation: score archived forecasts once their target weeks have closed, on validated observations.

    python3 tools/forecasts/evaluate.py          append evaluations for every newly closed target week
    python3 tools/forecasts/evaluate.py --dry    report what would be appended

Needs pandas (the Research's pinned requirements): the actual of a target is computed with the Research's own rules,
imported from reports/tc-cycle/research_data.py, never restated: per world, the daily median of TibiaMarket offers on
each server day, a capture median only on days without one, the Research's Buy/Sell floor; then the median of the
days of the Monday to Sunday week that holds the target date. That is the target definition every archived Research
forecast states.

Observations are the current validated datasets, newest copies included: TibiaMarket histories frozen by the Research
(reports/tc-cycle/inputs/api/) and by Markets (data/market-history/inputs/tibiamarket/, including increments), and the
canonical captures (data/observations.json) plus validated manual observations. A row present in two copies must be
identical. The files and their SHA-256 are stored as one archive object per run and cited by every evaluation.

A target week is scored once it is closed: its Sunday is on or before the observation cutoff (the latest valid offer
day in the data, as the Research defines its cutoff). A closed week with no valid offer for a world stays unscored
(observation unavailable) and is checked again on the next run. Evaluations are appended to evaluations.jsonl (a hash
chain); a later run that finds a different actual for an already scored week appends evaluation-superseded and a new
evaluation, so the earlier score stays on record. The forecasts themselves are never touched.
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402
from index import EVALUATIONS, load_evaluations, write_index  # noqa: E402

TC = ar.ROOT / 'reports' / 'tc-cycle'
sys.path.insert(0, str(TC))
import pandas as pd  # noqa: E402
import research_data as rd  # noqa: E402

API_DIRS = ('reports/tc-cycle/inputs/api', 'data/market-history/inputs/tibiamarket')
CAPTURES = ('data/observations.json',)
MANUAL = 'data/market-history/inputs/manual'


def observations(root: Path = None):
    """(rows by world, captures, files with SHA-256). Copies of one world's history merge by timestamp."""
    root = root or ar.ROOT
    rows, files, conflicts = {}, [], []
    for d in API_DIRS:
        base = root / d
        if not base.exists():
            continue
        for p in sorted(base.rglob('*.json*')):
            if p.name == 'manifest.json':
                continue
            raw = p.read_bytes()
            data = json.loads(gzip.decompress(raw) if p.suffix == '.gz' else raw)
            if not isinstance(data, list):
                continue
            world = p.name.split('.')[0].lower()
            files.append({'path': str(p.relative_to(root)), 'sha256': ar.sha(raw)})
            seen = rows.setdefault(world, {})
            for r in data:
                t = r.get('time')
                if t in seen and seen[t] != r:
                    conflicts.append(f'{world} {t}')
                seen.setdefault(t, r)
    if conflicts:
        raise SystemExit(f'conflicting copies of the same TibiaMarket rows: {conflicts[:5]}')
    captures = []
    for c in CAPTURES + tuple(str(p.relative_to(root)) for p in sorted((root / MANUAL).glob('*.json')) if (root / MANUAL).exists()):
        raw = (root / c).read_bytes()
        files.append({'path': c, 'sha256': ar.sha(raw)})
        captures += [x for x in json.loads(raw) if isinstance(x, dict) and 'sell' in x and 'buy' in x]
    return {w: list(v.values()) for w, v in rows.items()}, captures, files


def cutoff_of(rows, captures):
    return rd.cutoff_from([r for v in rows.values() for r in v], captures)


def weekly_actuals(rows, captures, cutoff):
    """{world: {'ask': Series, 'bid': Series}} of weekly medians labelled by the week's Sunday."""
    out = {}
    by_world = {}
    for c in captures:
        by_world.setdefault(c['world'].lower(), []).append(c)
    for world in sorted(set(rows) | set(by_world)):
        daily, _ = rd.build_daily(rows.get(world, []), by_world.get(world, []), cutoff)
        if not daily.empty:
            out[world] = rd.weekly_series(daily, cutoff)
    return out


def week_of(iso: str) -> str:
    t = pd.Timestamp(iso)
    return str((t + pd.Timedelta(days=(6 - t.weekday()) % 7)).date())


def items_of(record: dict):
    """(weekEnding, horizon, world, side, model, predicted, low, high) for every point of an archived forecast."""
    o = ar.get_object(record['outputs']['object'])
    if record['product'] == 'tc-world-scenarios':
        weeks = sorted({x['date'] for x in o['worldPaths']})
        for x in o['worldPaths']:
            if x['base'] is not None:
                yield week_of(x['date']), weeks.index(x['date']) + 1, x['world'], x['side'], record['model']['id'], x['base'], x['low'], x['high'], x['date']
    elif record['product'] == 'research-ledger':
        for side, models in o['antica'].items():
            for model, values in models.items():
                for j, target in enumerate(o['targets']):
                    yield week_of(target), j + 1, o['benchmark'], side, model, values[j], None, None, target
        for x in o['worlds']:
            for model in ('prop', 'slope', 'drift'):
                if x.get(model) is not None:
                    yield x['weekEnding'], x['horizon'], x['world'], x['side'], f'transfer {model}', x[model], None, None, x['date']


def score(predicted, actual, low, high):
    return {'predicted': predicted, 'actual': actual, 'absError': abs(actual - predicted),
            'pctError': 100 * abs(actual - predicted) / abs(actual) if actual else None,
            'logError': 100 * math.log(actual / predicted) if actual > 0 and predicted > 0 else None,
            'low': low, 'high': high, 'inside': (low <= actual <= high) if low is not None and high is not None else None}


def evaluate(records, evaluations, rows, captures, files, *, write=True, path: Path = None):
    path = path or (ar.ARCHIVE / EVALUATIONS)
    cutoff = cutoff_of(rows, captures)
    actuals = weekly_actuals(rows, captures, cutoff)
    dataset = {'kind': 'observation-dataset', 'cutoff': str(cutoff.date()), 'files': files}
    obs = {'object': ar.sha(ar.canonical(dataset)), 'cutoff': str(cutoff.date())}  # stored only if an evaluation cites it
    current = {}
    for e in evaluations:
        key = (e['forecast'], e['weekEnding'])
        if e['type'] == 'evaluation':
            current[key] = e
        else:
            current.pop(key, None)
    added = []
    for r in records:
        if r['type'] != 'forecast':
            continue
        by_week = {}
        for week, horizon, world, side, model, predicted, low, high, target in items_of(r):
            if pd.Timestamp(week) > cutoff:
                continue  # awaiting observation
            series = actuals.get(world.lower(), {}).get(side) if world.lower() in actuals else None
            value = series.get(pd.Timestamp(week)) if series is not None else None
            if value is None or not math.isfinite(value):
                continue  # observation unavailable for now
            by_week.setdefault(week, []).append({'world': world, 'side': side, 'model': model, 'horizon': horizon, 'target': target,
                                                 **score(predicted, float(value), low, high)})
        for week, items in sorted(by_week.items()):
            items.sort(key=lambda x: (x['world'], x['side'], x['model']))
            old = current.get((r['contentHash'], week))
            if old and old['items'] == items:
                continue
            body = {'type': 'evaluation', 'forecast': r['contentHash'], 'edition': r['edition'], 'weekEnding': week,
                    'definition': r['target']['definition'], 'observation': obs, 'items': items}
            if old:
                body_sup = {'type': 'evaluation-superseded', 'forecast': r['contentHash'], 'weekEnding': week, 'previous': old['contentHash'],
                            'reason': 'the observations of this week changed (a corrected or newly added observation)'}
                if write:
                    ar.append(evaluations, body_sup, 'evaluation', path=path)
            if write:
                ar.put_object(dataset)
                rec = ar.append(evaluations, body, 'evaluation', path=path)
                if rec:
                    current[(r['contentHash'], week)] = rec
                    added.append(rec)
            else:
                added.append(body)
    return cutoff, added


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    records = ar.load()
    evaluations = load_evaluations()
    rows, captures, files = observations()
    cutoff, added = evaluate(records, evaluations, rows, captures, files, write=not a.dry)
    pending = sum(1 for r in records if r['type'] == 'forecast' for item in items_of(r) if pd.Timestamp(item[0]) > cutoff)
    if not a.dry:
        write_index(records)
    print(f'observation cutoff {cutoff.date()}: {len(added)} evaluation records {"would be " if a.dry else ""}added '
          f'({sum(len(x["items"]) for x in added)} scored points); {pending} forecast points await their target week')


if __name__ == '__main__':
    main()
