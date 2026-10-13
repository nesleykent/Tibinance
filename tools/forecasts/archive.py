"""The forecast archive: every forecast Tibinance publishes, recorded before publication and never rewritten.

    python3 tools/forecasts/archive.py --ensure     archive the working tree's forecast editions (Research world
                                                    scenarios, the Research ledger's frozen forecasts) and the
                                                    Markets projections that present them
    python3 tools/forecasts/archive.py --ensure --projections <file>
                                                    also archive a projections file about to be written
    python3 tools/forecasts/archive.py --backfill   archive every edition found in main's first-parent history
    python3 tools/forecasts/archive.py --check      verify the chain, every object, and that every published
                                                    representation in the working tree is archived
    python3 tools/forecasts/archive.py --reconcile <git-rev>
                                                    after a conflicting rebase: keep <rev>'s chain, re-append the
                                                    local records it lacks (same content, new position)

Standard library only, so it runs before any publication on any machine.

Layout (data/forecast-archive/):
  publications.jsonl  one record per line, an append-only SHA-256 hash chain (the pattern of
                      reports/tc-cycle/ledger.py): seq, prev (hash of the previous line), hash (of the record).
                      Every record also has a contentHash, the SHA-256 of its content without seq, prev, hash and
                      the archival event, so its identity survives a reconcile and duplicates are recognised.
  objects/<sha256>.json.gz  content-addressed, immutable: forecast outputs and input snapshots. The name is the
                      SHA-256 of the canonical JSON before compression.
  index.json          derived summary for the site; rebuilt by publish_evidence.py.

Record types:
  forecast            the immutable content of one edition: product, model, cutoff, target definition, horizon,
                      interval kind, outputs (object), input snapshot (object), datasets, programs, code commit,
                      reproducibility, source; createdAt with its basis; the archival event (archivedAt, basis).
  presentation        a surface that shows a forecast (the Markets projections file), by the file's SHA-256.
  supersession        a later edition for the same cutoff replaced an earlier one; both stay.
  publication-evidence, publication-failure   appended by publish_evidence.py.
An archived forecast is not thereby published: publication needs evidence (repository or website).
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / 'data' / 'forecast-archive'
CHAIN = ARCHIVE / 'publications.jsonl'
OBJECTS = ARCHIVE / 'objects'
RESULTS = 'reports/tc-cycle/results.json'
PROJECTIONS = 'data/market-projections/tibia-coin.json'
LEDGER = 'reports/tc-cycle/forecast-ledger.jsonl'
PROGRAMS = ('reports/tc-cycle/analyze.py', 'reports/tc-cycle/research_data.py', 'reports/tc-cycle/universe.py')
ZERO = '0' * 64
EVENT_KEYS = ('seq', 'prev', 'hash', 'contentHash', 'archive')

SCENARIO_TARGET = ('Weekly median of daily offers (API daily median; capture median only on days without one), '
                   'per side, for the Monday to Sunday week that holds the target date; the Research scoring rule')
SCENARIO_CONFIG = {
    'benchmarkModel': 'C+S+H: equal weights on the log changes of Constant, Seasonal Naive (52 weeks, nearest weekly '
                      'median within 10 days) and Harmonic (trend and two annual harmonic pairs, least squares on the '
                      'log weekly medians), trained on the 130 weeks before the origin, from the cutoff anchor',
    'trainingWeeks': 130, 'harmonicOrigin': '2023-01-01', 'seasonalLagWeeks': 52, 'seasonalToleranceDays': 10,
    'stepDays': 7, 'periods': 52, 'stressQuantile': 0.8, 'stressHorizons': [4, 13, 26, 39, 52],
    'stress': 'max(80th percentile of the absolute log errors of the ensemble backtest at the nearest horizon, '
              'largest absolute log divergence of a component from the ensemble)',
    'transfer': "world anchor x benchmark ensemble path / benchmark reference value on or before the world's anchor date",
    'worldBand': 'exp(+/-(benchmark stress + world local stress)); local stress = 80th percentile of 13-week absolute '
                 'log-premium changes over Antica, else premium dispersion, else 0.10',
    'statusRules': 'suspended from an announced merger week; conditional when the anchor is stale; conditional when '
                   'the central Buy Offer meets or passes the central Sell Offer',
}


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def sha(text: str | bytes) -> str:
    return hashlib.sha256(text.encode() if isinstance(text, str) else text).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def content_hash(record: dict) -> str:
    return sha(canonical({k: v for k, v in record.items() if k not in EVENT_KEYS}))


# Objects ---------------------------------------------------------------------------------------------------------

def put_object(value, root: Path = ARCHIVE) -> str:
    text = canonical(value)
    digest = sha(text)
    path = root / 'objects' / f'{digest}.json.gz'
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix('.tmp')
        with open(tmp, 'wb') as f:
            f.write(gzip.compress(text.encode(), mtime=0))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    return digest


def get_object(digest: str, root: Path = ARCHIVE):
    text = gzip.decompress((root / 'objects' / f'{digest}.json.gz').read_bytes()).decode()
    if sha(text) != digest:
        raise ValueError(f'object {digest} does not match its name')
    return json.loads(text)


# Chain -----------------------------------------------------------------------------------------------------------

def read_chain(text: str, name: str = 'publications.jsonl') -> list[dict]:
    records, prev = [], ZERO
    for line in text.splitlines():
        if not line:
            continue
        r = json.loads(line)
        body = {k: v for k, v in r.items() if k != 'hash'}
        if (r.get('seq') != len(records) + 1 or r.get('prev') != prev or r.get('hash') != sha(canonical(body))
                or canonical(r) != line or r.get('contentHash') != content_hash(r)):
            raise ValueError(f'{name}: chain broken at line {len(records) + 1}')
        records.append(r)
        prev = sha(line)
    return records


def load(path: Path = CHAIN) -> list[dict]:
    return read_chain(path.read_text(), path.name) if path.exists() else []


def append(records: list[dict], body: dict, basis: str, path: Path = CHAIN, by: str | None = None) -> dict | None:
    """Appends body unless a record with the same content exists; returns the new record (or None)."""
    ch = content_hash(body)
    if any(r['contentHash'] == ch for r in records):
        return None
    prev = sha(canonical(records[-1])) if records else ZERO
    record = {**body, 'archive': {'archivedAt': now(), 'basis': basis, **({'by': by} if by else {})},
              'contentHash': ch, 'seq': len(records) + 1, 'prev': prev}
    line = canonical({**record, 'hash': sha(canonical(record))})
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
        f.flush()
        os.fsync(f.fileno())
    record = json.loads(line)
    records.append(record)
    return record


# Editions --------------------------------------------------------------------------------------------------------

def scenario_digest(results: dict) -> str:
    """The identity of a published Research scenario edition: what its pages and the Markets projections show."""
    return sha(canonical({k: results.get(k) for k in ('asOf', 'benchmark', 'forecast', 'worldForecast')}))


def scenario_snapshot(results: dict) -> tuple[dict, list[str]]:
    """The minimal inputs that reproduce the edition's numbers (tools/forecasts/reproduce.py), and what is missing."""
    missing = []
    bench = results.get('benchmark')
    metrics = {w['world']: w for w in results.get('worlds', [])}
    weekly = {side: [[x['date'], x[side]] for x in results.get('history', []) if x['world'] == bench] for side in ('ask', 'bid')}
    if not weekly['ask']:
        missing.append('benchmark weekly series')
    errors = {side: {str(h): [x['logError'] for x in results.get('backtestDetail', [])
                              if x['side'] == side and x['horizon'] == h and x['model'] == 'Conjunto' and x['logError'] is not None]
                     for h in SCENARIO_CONFIG['stressHorizons']} for side in ('ask', 'bid')}
    if not any(errors['ask'].values()):
        missing.append('ensemble backtest errors')
    keep = ('world', 'ask', 'bid', 'date', 'source', 'stale', 'mergerDate', 'askBenchmarkRef', 'bidBenchmarkRef',
            'benchmarkRefDate', 'askLocalStress', 'bidLocalStress', 'askLocalStressBasis', 'bidLocalStressBasis')
    worlds = sorted(({k: m.get(k) for k in keep} for m in metrics.values()), key=lambda m: m['world'])
    if any(m.get('askBenchmarkRef') is None for m in worlds if m['world'] != bench):
        missing.append('benchmark reference per world')
    snapshot = {'kind': 'tc-world-scenarios-inputs', 'asOf': results.get('asOf'), 'benchmark': bench,
                'config': SCENARIO_CONFIG, 'benchmarkWeekly': weekly, 'benchmarkAnchor': {k: metrics.get(bench, {}).get(k) for k in ('ask', 'bid', 'date', 'source')},
                'backtestLogErrors': errors, 'worlds': worlds,
                'datasets': results.get('sources', []), 'dataPolicy': results.get('dataPolicy')}
    return snapshot, missing


def scenario_body(results: dict, *, programs: dict, code_commit: str | None, results_sha: str, created: dict,
                  source: dict) -> tuple[dict, dict, dict]:
    snapshot, missing = scenario_snapshot(results)
    outputs = {'kind': 'tc-world-scenarios', 'asOf': results['asOf'], 'benchmark': results['benchmark'],
               'benchmarkPaths': results['forecast'], 'worldPaths': results['worldForecast']}
    body = {
        'type': 'forecast', 'product': 'tc-world-scenarios', 'edition': f"tc-world-scenarios/{results['asOf']}",
        'model': {'id': 'C+S+H transfer', 'version': programs.get('reports/tc-cycle/analyze.py'), 'config': SCENARIO_CONFIG},
        'dataCutoff': results['asOf'], 'createdAt': created,
        'target': {'definition': SCENARIO_TARGET, 'unit': 'gold per Tibia Coin', 'sides': ['ask', 'bid'],
                   'sideNames': {'ask': 'Sell Offers', 'bid': 'Buy Offers'}},
        'horizon': {'unit': 'week', 'steps': len({x['date'] for x in results['forecast']}), 'stepDays': 7},
        'interval': {'kind': 'heuristic-stress-band', 'meaning': 'observed backtest error, model divergence and premium '
                     'instability; not a confidence interval and not calibrated'},
        'outputs': {'object': None, 'digest': scenario_digest(results), 'rows': len(results['worldForecast'])},
        'inputs': {'object': None, 'missing': missing, 'datasets': [{'path': RESULTS, 'sha256': results_sha}],
                   'programs': programs, 'codeCommit': code_commit, 'seed': None,
                   'runtime': 'deterministic least squares and quantiles; no random component'},
        'reproducibility': {'prediction': 'complete inputs (tools/forecasts/reproduce.py rebuilds the outputs)' if not missing else 'partial',
                            'research': 'from this repository at codeCommit (frozen inputs listed in the snapshot datasets)',
                            'missing': missing},
        'provenance': 'authentic', 'source': source,
    }
    return body, outputs, snapshot


def ledger_bodies(text: str, source_for) -> list[tuple[dict, dict]]:
    """The Research ledger's frozen forecasts, imported read-only (the ledger itself is never changed)."""
    out = []
    for line in text.splitlines():
        r = json.loads(line)
        if r.get('type') != 'forecast':
            continue
        outputs = {'kind': 'research-ledger-forecast', **{k: r[k] for k in ('benchmark', 'anchor', 'targets', 'weekEnding', 'antica', 'fan', 'worlds')}}
        body = {
            'type': 'forecast', 'product': 'research-ledger', 'edition': f"research-ledger/{r['id']}",
            'model': {'id': 'Research ledger: C, S, H, C+S, C+S+H; simulated fan; world transfers',
                      'version': r['config']['programs'].get('analyze.py'), 'config': {k: v for k, v in r['config'].items() if k not in ('programs', 'inputs')}},
            'dataCutoff': r['cutoff'], 'createdAt': {'value': r['recordedAt'], 'basis': 'ledger recordedAt'},
            'target': {'definition': r['config']['scoring'], 'unit': 'gold per Tibia Coin', 'sides': ['ask', 'bid']},
            'horizon': {'unit': 'week', 'steps': len(r['targets']), 'stepDays': 7},
            'interval': {'kind': 'simulated-p10-p90', 'meaning': 'quantiles of simulated paths (seed 11) for Antica'},
            'outputs': {'object': None, 'digest': sha(canonical(outputs))},
            'inputs': {'object': None, 'missing': ['simulation inputs of the fan (complement.py)', 'robustness inputs of the slope and drift transfers'],
                       'datasets': [{'path': f'reports/tc-cycle/{p}', 'sha256': h} for p, h in sorted(r['config']['inputs'].items())],
                       'programs': {f'reports/tc-cycle/{p}': h for p, h in sorted(r['config']['programs'].items())},
                       'codeCommit': (source_for(r) or {}).get('commit'), 'seed': 11,
                       'runtime': 'ARIMA paths with seed 11 (complement.py); the rest deterministic'},
            'reproducibility': {'prediction': 'partial', 'research': 'from this repository at codeCommit',
                                'missing': ['fan and world transfers need the full Research pipeline']},
            'provenance': 'authentic', 'source': {**(source_for(r) or {}), 'ledger': {'seq': r['seq'], 'hash': r['hash']}},
        }
        out.append((body, outputs))
    return out


# Git -------------------------------------------------------------------------------------------------------------

def git(*args: str, check: bool = True) -> str:
    r = subprocess.run(['git', *args], cwd=ROOT, capture_output=True)
    if check and r.returncode:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.decode().strip()}")
    return r.stdout.decode() if r.returncode == 0 else ''


def git_bytes(rev: str, path: str) -> bytes | None:
    r = subprocess.run(['git', 'show', f'{rev}:{path}'], cwd=ROOT, capture_output=True)
    return r.stdout if r.returncode == 0 else None


def program_hashes(read) -> dict:
    return {p: sha(b) for p in PROGRAMS if (b := read(p)) is not None}


# Operations ------------------------------------------------------------------------------------------------------

def ensure_scenario(records, results_bytes, *, basis, programs, code_commit, created, source):
    results = json.loads(results_bytes)
    body, outputs, snapshot = scenario_body(results, programs=programs, code_commit=code_commit, results_sha=sha(results_bytes),
                                            created=created, source=source)
    body['outputs']['object'] = put_object(outputs)
    body['inputs']['object'] = put_object(snapshot)
    existing = next((r for r in records if r['type'] == 'forecast' and r['product'] == body['product'] and r['outputs']['digest'] == body['outputs']['digest']), None)
    if existing:
        return existing, False
    earlier = [r for r in records if r['type'] == 'forecast' and r['product'] == body['product'] and r['dataCutoff'] == body['dataCutoff']]
    new = append(records, body, basis)
    for old in earlier:
        if not any(r['type'] == 'supersession' and r['supersedes'] == old['contentHash'] and r['by'] == new['contentHash'] for r in records):
            append(records, {'type': 'supersession', 'supersedes': old['contentHash'], 'by': new['contentHash'], 'edition': body['edition'],
                             'reason': 'a later edition for the same data cutoff, with different published numbers; both stay archived'}, basis)
    return new, True


def ensure_ledger(records, ledger_text, *, basis, source_for):
    added = 0
    for body, outputs in ledger_bodies(ledger_text, source_for):
        body['outputs']['object'] = put_object(outputs)
        if any(r['type'] == 'forecast' and r['product'] == 'research-ledger' and r['outputs']['digest'] == body['outputs']['digest'] for r in records):
            continue
        added += append(records, body, basis) is not None
    return added


def ensure_presentation(records, projections_bytes, results_bytes, *, basis, source):
    proj = json.loads(projections_bytes)
    if proj['source']['sha256'] != sha(results_bytes):
        raise SystemExit(f"{PROJECTIONS} was built from results.json {proj['source']['sha256'][:12]}, not from the results.json beside it: rebuild it")
    digest = scenario_digest(json.loads(results_bytes))
    target = next((r for r in records if r['type'] == 'forecast' and r['product'] == 'tc-world-scenarios' and r['outputs']['digest'] == digest), None)
    if target is None:
        raise SystemExit(f'{PROJECTIONS} presents a Research edition that is not archived: archive the edition first')
    body = {'type': 'presentation', 'surface': 'markets-projections', 'path': PROJECTIONS, 'sha256': sha(projections_bytes),
            'forecast': target['contentHash'], 'edition': target['edition'],
            'note': 'Markets shows the edition rounded to whole gold, from its anchor when it is the latest observation',
            'source': source}
    if any(r['type'] == 'presentation' and r['sha256'] == body['sha256'] for r in records):
        return None
    return append(records, body, basis)


def working_source(path: str) -> dict:
    return {'kind': 'working-tree', 'path': path, 'note': 'archived before its commit; repository and website '
            'evidence are appended when it reaches main and is deployed'}


def cmd_ensure(projections: str | None) -> None:
    records = load()
    head = git('rev-parse', 'HEAD', check=False).strip() or None
    read = lambda p: (ROOT / p).read_bytes() if (ROOT / p).exists() else None
    results_bytes = read(RESULTS)
    new, added = ensure_scenario(records, results_bytes, basis='live', programs=program_hashes(read), code_commit=head,
                                 created={'value': None, 'basis': 'generation time is not recorded by analyze.py; no later than archive.archivedAt'},
                                 source=working_source(RESULTS))
    n = ensure_ledger(records, read(LEDGER).decode(), basis='live', source_for=lambda r: working_source(LEDGER))
    p = None
    for path in [x for x in (projections, str(ROOT / PROJECTIONS)) if x]:
        if Path(path).exists():
            p = ensure_presentation(records, Path(path).read_bytes(), results_bytes, basis='live', source=working_source(PROJECTIONS)) or p
            break
    print(f"{CHAIN.relative_to(ROOT)}: scenario edition {new['edition']} {'archived' if added else 'already archived'}; "
          f'{n} ledger forecasts added; projections {"archived" if p else "already archived"}; {len(records)} records')


def cmd_backfill(rev: str) -> None:
    """Every edition committed on rev's first-parent history, oldest first, with the commit that first held it."""
    records = load()
    lines = [l.split(' ', 1) for l in git('log', '--first-parent', '--reverse', '--format=%H %cI', rev, '--', RESULTS, PROJECTIONS, LEDGER).splitlines() if l]
    first_ledger = {}
    for commit, when in lines:
        src = {'kind': 'git', 'commit': commit, 'committedAt': when}
        results_bytes = git_bytes(commit, RESULTS)
        if results_bytes:
            ensure_scenario(records, results_bytes, basis='backfill', programs=program_hashes(lambda p: git_bytes(commit, p)), code_commit=commit,
                            created={'value': None, 'notAfter': when, 'basis': 'generation time is not recorded by analyze.py; bounded by the first commit that holds it'},
                            source={**src, 'path': RESULTS})
        ledger = git_bytes(commit, LEDGER)
        if ledger:
            for line in ledger.decode().splitlines():
                first_ledger.setdefault(json.loads(line)['hash'], {**src, 'path': LEDGER})
            ensure_ledger(records, ledger.decode(), basis='backfill', source_for=lambda r: first_ledger.get(r['hash']))
        projections = git_bytes(commit, PROJECTIONS)
        if projections:
            ensure_presentation(records, projections, results_bytes, basis='backfill', source={**src, 'path': PROJECTIONS})
    print(f'{CHAIN.relative_to(ROOT)}: {len(records)} records after backfilling {len(lines)} commits of {rev}')


def check() -> list[str]:
    problems = []
    try:
        records = load()
    except ValueError as e:
        return [str(e)]
    for r in records:
        for key in ('outputs', 'inputs'):
            digest = (r.get(key) or {}).get('object')
            if digest:
                try:
                    get_object(digest)
                except (OSError, ValueError) as e:
                    problems.append(f"{r['type']} {r.get('edition')}: {key} object {digest[:12]}: {e}")
        if r['type'] == 'forecast' and r['product'] == 'tc-world-scenarios' and r['outputs'].get('object'):
            o = get_object(r['outputs']['object'])
            if scenario_digest({'asOf': o['asOf'], 'benchmark': o['benchmark'], 'forecast': o['benchmarkPaths'], 'worldForecast': o['worldPaths']}) != r['outputs']['digest']:
                problems.append(f"{r['edition']}: outputs object does not match the recorded digest")
    by_hash = {r['contentHash'] for r in records}
    for r in records:
        for key in ('forecast', 'supersedes', 'by'):
            if key in r and r[key] not in by_hash:
                problems.append(f"{r['type']} refers to a missing record {r[key][:12]}")
    # Every published representation in this tree is archived.
    results_path = ROOT / RESULTS
    if results_path.exists():
        digest = scenario_digest(json.loads(results_path.read_bytes()))
        if not any(r['type'] == 'forecast' and r['outputs']['digest'] == digest for r in records):
            problems.append(f'{RESULTS}: its scenario edition is not archived (run archive.py --ensure)')
    ledger_path = ROOT / LEDGER
    if ledger_path.exists():
        archived = {r['source'].get('ledger', {}).get('hash') for r in records if r['type'] == 'forecast' and r['product'] == 'research-ledger'}
        for line in ledger_path.read_text().splitlines():
            x = json.loads(line)
            if x['type'] == 'forecast' and x['hash'] not in archived:
                problems.append(f"{LEDGER}: frozen forecast {x['id']} is not archived")
    proj_path = ROOT / PROJECTIONS
    if proj_path.exists() and not any(r['type'] == 'presentation' and r['sha256'] == sha(proj_path.read_bytes()) for r in records):
        problems.append(f'{PROJECTIONS}: this version is not archived as a presentation')
    return problems


def cmd_reconcile(rev: str) -> None:
    theirs = read_chain((git_bytes(rev, str(CHAIN.relative_to(ROOT))) or b'').decode())
    ours = load()
    keep = {r['contentHash'] for r in theirs}
    tmp = CHAIN.with_suffix('.reconcile')
    tmp.write_text(''.join(canonical(r) + '\n' for r in theirs))
    merged = read_chain(tmp.read_text())
    for r in ours:
        if r['contentHash'] not in keep:
            body = {k: v for k, v in r.items() if k not in ('seq', 'prev', 'hash', 'contentHash', 'archive')}
            prev = sha(canonical(merged[-1])) if merged else ZERO
            rec = {**body, 'archive': r['archive'], 'contentHash': r['contentHash'], 'seq': len(merged) + 1, 'prev': prev}
            line = canonical({**rec, 'hash': sha(canonical(rec))})
            with open(tmp, 'a') as f:
                f.write(line + '\n')
            merged.append(json.loads(line))
    read_chain(tmp.read_text())
    os.replace(tmp, CHAIN)
    print(f'reconciled: {len(theirs)} records from {rev} kept, {len(merged) - len(theirs)} local records re-appended')


def main() -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ensure', action='store_true')
    ap.add_argument('--projections')
    ap.add_argument('--backfill', nargs='?', const='HEAD')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--reconcile')
    a = ap.parse_args()
    lock = ARCHIVE / '.lock'
    if a.ensure or a.backfill or a.reconcile:
        ARCHIVE.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            raise SystemExit(f'{lock} exists: another archive process is running (remove it only if none is)')
        os.write(fd, f'{os.getpid()}\n'.encode())
        os.close(fd)
    try:
        if a.reconcile:
            cmd_reconcile(a.reconcile)
        if a.backfill:
            cmd_backfill(a.backfill)
        if a.ensure:
            cmd_ensure(a.projections)
        if a.check:
            problems = check()
            for p in problems:
                print(f'FAIL {p}')
            records = load() if not problems else []
            print(f"PASS: {len(records)} archive records; chain, objects and published representations consistent" if not problems
                  else f'FAIL: {len(problems)} problems')
            sys.exit(1 if problems else 0)
    finally:
        if lock.exists() and (a.ensure or a.backfill or a.reconcile):
            lock.unlink()


if __name__ == '__main__':
    main()
