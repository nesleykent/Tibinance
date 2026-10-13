"""data/forecast-archive/index.json: what the site reads, rebuilt deterministically from the archive's chains.

Lifecycle of a forecast (never stored, always derived from the records):
  archived              recorded, with no publication evidence yet (archived-unpublished)
  published             with repository evidence (on main) and, when deployed, website evidence; the level
                        says which: "repository" or "website"
  publication-failed    a deployment holding it failed and no deployment succeeded
  superseded            a later edition for the same cutoff replaced it (it stays archived and evaluable)
Evaluations (evaluations.jsonl, by evaluate.py) add each target's status: awaiting observation, observation
unavailable, evaluated, or evaluation superseded by a corrected observation.
"""
from __future__ import annotations

import json
from pathlib import Path

import archive as ar

INDEX = 'index.json'
EVALUATIONS = 'evaluations.jsonl'


def load_evaluations() -> list[dict]:
    path = ar.ARCHIVE / EVALUATIONS
    return ar.read_chain(path.read_text(), EVALUATIONS) if path.exists() else []


def build_index(records: list[dict], evaluations: list[dict] | None = None) -> dict:
    evaluations = load_evaluations() if evaluations is None else evaluations
    by_subject: dict[str, list[dict]] = {}
    for r in records:
        if 'subject' in r:
            by_subject.setdefault(r['subject'], []).append(r)
    superseded_by = {r['supersedes']: r['by'] for r in records if r['type'] == 'supersession'}
    presentations = [r for r in records if r['type'] == 'presentation']
    current = {}  # (forecast, weekEnding) -> the evaluation in force; superseded ones stay in evaluations.jsonl
    for e in evaluations:
        key = (e['forecast'], e['weekEnding'])
        if e['type'] == 'evaluation':
            current[key] = e
        elif e['type'] == 'evaluation-superseded':
            current.pop(key, None)

    def summary(items):
        pct = [i['pctError'] for i in items if i.get('pctError') is not None]
        signed = [100 * (i['predicted'] / i['actual'] - 1) for i in items if i.get('actual')]
        inside = [i['inside'] for i in items if i.get('inside') is not None]
        return {'n': len(items), 'mape': sum(pct) / len(pct) if pct else None, 'bias': sum(signed) / len(signed) if signed else None,
                'coverage': sum(inside) / len(inside) if inside else None}

    def evidence(subject, level):
        ev = [r for r in by_subject.get(subject, []) if r['type'] == 'publication-evidence' and r['level'] == level]
        if not ev:
            return None
        first = min(ev, key=lambda r: r['at'])
        return {k: first[k] for k in ('at', 'basis', 'uncertainty') if k in first} | ({'commit': first['commit']} if 'commit' in first else {}) \
            | ({'release': first['deployment'].get('release'), 'deployment': first['deployment']['id']} if 'deployment' in first else {})

    def lifecycle(r):
        repo, web = evidence(r['contentHash'], 'repository'), evidence(r['contentHash'], 'website')
        failures = [f for f in by_subject.get(r['contentHash'], []) if f['type'] == 'publication-failure']
        if web or repo:
            state, level = 'published', 'website' if web else 'repository'
        elif failures:
            state, level = 'publication-failed', None
        else:
            state, level = 'archived', None
        return {'state': state, 'evidenceLevel': level, 'superseded': r['contentHash'] in superseded_by,
                'supersededBy': superseded_by.get(r['contentHash']),
                'evidence': {'repository': repo, 'website': web}, 'failures': [{'at': f['at'], 'reason': f['reason']} for f in failures]}

    forecasts = []
    for r in records:
        if r['type'] != 'forecast':
            continue
        evals = [e for (f, week), e in sorted(current.items()) if f == r['contentHash']]
        forecasts.append({
            'contentHash': r['contentHash'], 'seq': r['seq'], 'product': r['product'], 'edition': r['edition'],
            'provenance': r['provenance'], 'dataCutoff': r['dataCutoff'], 'model': {'id': r['model']['id'], 'version': r['model'].get('version')},
            'createdAt': r['createdAt'], 'archivedAt': r['archive']['archivedAt'], 'archiveBasis': r['archive']['basis'],
            'horizon': r['horizon'], 'interval': r['interval']['kind'], 'target': r['target']['definition'],
            'outputs': r['outputs']['object'], 'inputs': r['inputs']['object'], 'reproducibility': r['reproducibility'],
            'presentations': [{'surface': p['surface'], 'sha256': p['sha256']} for p in presentations if p['forecast'] == r['contentHash']],
            **lifecycle(r),
            'evaluation': {'points': sum(len(e['items']) for e in evals),
                           'weeks': [{'weekEnding': e['weekEnding'], 'observationCutoff': e['observation']['cutoff'], 'record': e['contentHash'],
                                      **summary(e['items'])} for e in evals]},
        })
    head = records[-1]['hash'] if records else None
    return {'format': 1, 'note': 'Derived from publications.jsonl and evaluations.jsonl by tools/forecasts/index.py; do not edit.',
            'chain': {'records': len(records), 'head': head, 'evaluations': len(evaluations)},
            'forecasts': forecasts,
            'presentations': [{'contentHash': p['contentHash'], 'surface': p['surface'], 'sha256': p['sha256'], 'forecast': p['forecast'],
                               'edition': p['edition'], **lifecycle(p)} for p in presentations]}


def render(index: dict) -> str:
    return json.dumps(index, ensure_ascii=False, indent=1, sort_keys=True) + '\n'


def write_index(records: list[dict]) -> Path:
    path = ar.ARCHIVE / INDEX
    path.write_text(render(build_index(records)))
    return path


def stale(records: list[dict]) -> bool:
    path = ar.ARCHIVE / INDEX
    return not path.exists() or path.read_text() != render(build_index(records))
