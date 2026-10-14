"""Publication evidence: when each archived forecast became public, and how we know.

    python3 tools/forecasts/publish_evidence.py            repository and website evidence from git and GitHub
    python3 tools/forecasts/publish_evidence.py --live     also compare the live site's files with the archive
    python3 tools/forecasts/publish_evidence.py --offline  repository evidence from git only (no API calls)

Archiving a forecast proves archival, never publication. Evidence is appended to publications.jsonl as separate
records about an archived forecast or presentation (the subject, by contentHash); nothing about the subject changes.

  repository  the subject's content was main's head: the earliest listed moment main held it, from GitHub push
              events (exact) or legacy Pages builds of main (no later than). A commit that only reached main as
              a merge parent was never served and gives no evidence. Before the listed period (GitHub keeps
              about 90 days of events) the first first-parent commit holding it gives a lower bound (committer
              date), with the basis stated.
  website     a GitHub Pages deployment that served the subject's content succeeded (time of its success status).
              Before 2026-10-13 Pages deployed main itself ("pages build and deployment"), so the deployed tree
              is the deployment's commit. Since then it deploys only approved releases ("Pages release"), so the
              deployed tree is the release commit named by release/production.json at the deployment's commit.
              Or a live fetch of the site whose bytes match (basis live-fetch, observedAt).
  publication-failure   a Pages deployment of a tree holding the subject failed or errored.
A subject with neither kind of evidence stays archived-unpublished.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402
from index import write_index  # noqa: E402

REPO = 'nesleykent/Tibinance'
LIVE = 'https://nesleykent.github.io/Tibinance/'


def token() -> str | None:
    for key in ('GH_TOKEN', 'GITHUB_TOKEN'):
        if os.environ.get(key):
            return os.environ[key]
    r = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
    return r.stdout.strip() or None if r.returncode == 0 else None


def api(path: str, tok: str | None):
    out, url = [], f'https://api.github.com/{path}'
    while url:
        req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'tibinance-evidence',
                                                   **({'Authorization': f'Bearer {tok}'} if tok else {})})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            link = resp.headers.get('Link') or ''
        if not isinstance(data, list):
            return data
        out += data
        url = next((p.split(';')[0].strip('<> ') for p in link.split(',') if 'rel="next"' in p), None)
    return out


@lru_cache(maxsize=None)
def blob(rev: str, path: str) -> bytes | None:
    return ar.git_bytes(rev, path)


def holds(record: dict, rev: str) -> bool:
    """Whether the tree at rev holds the subject's published content."""
    if record['type'] == 'presentation':
        data = blob(rev, ar.PROJECTIONS)
        return data is not None and ar.sha(data) == record['sha256']
    if record['product'] == 'tc-world-scenarios':
        data = blob(rev, ar.RESULTS)
        return data is not None and ar.scenario_digest(json.loads(data)) == record['outputs']['digest']
    if record['product'] == 'research-ledger':
        data = blob(rev, ar.LEDGER)
        return data is not None and f'"hash":"{record["source"]["ledger"]["hash"]}"' in data.decode()
    return False


def is_ancestor(a: str, b: str) -> bool:
    return subprocess.run(['git', 'merge-base', '--is-ancestor', ar.historical_revision(a), ar.historical_revision(b)], cwd=ar.ROOT, capture_output=True).returncode == 0


def subjects(records):
    return [r for r in records if r['type'] in ('forecast', 'presentation') and r.get('provenance', 'authentic') == 'authentic']


def has(records, subject, level):
    return any(r['type'] == 'publication-evidence' and r['subject'] == subject['contentHash'] and r['level'] == level for r in records)


def main_states(pushes, deployments):
    """Moments when main's head is known: GitHub push events (head and the head before it) and legacy Pages builds,
    which deploy main itself. Branch commits that only reached main as merge parents never appear here."""
    states = [{'at': p['at'], 'sha': p['head'], 'before': p['before'], 'basis': 'github-push-event'} for p in pushes]
    states += [{'at': d['at'], 'sha': d['sha'], 'before': None, 'basis': 'github-pages-build-of-main'}
               for d in deployments if d['workflow'] == 'pages build and deployment']
    return sorted(states, key=lambda s: s['at'])


def repository_evidence(records, rev, pushes, deployments):
    added = 0
    states = main_states(pushes, deployments)
    history = [l.split(' ', 1) for l in ar.git('log', '--first-parent', '--reverse', '--format=%H %cI', rev, '--', ar.RESULTS, ar.PROJECTIONS, ar.LEDGER).splitlines() if l]
    earliest_known = states[0]['at'] if states else None
    for s in subjects(records):
        if has(records, s, 'repository'):
            continue
        state = next((x for x in states if holds(s, x['sha'])), None)
        if state:
            already = state['before'] and ar.git('cat-file', '-t', state['before'], check=False).strip() == 'commit' and holds(s, state['before'])
            body = {'type': 'publication-evidence', 'level': 'repository', 'subject': s['contentHash'], 'edition': s.get('edition'),
                    'commit': state['sha'], 'at': state['at'], 'basis': state['basis'] + ('-upper-bound' if already else ''),
                    'uncertainty': ('main already held it before this push; it was published earlier than this time' if already else
                                    'exact time GitHub received the push' if state['basis'] == 'github-push-event' else
                                    'a Pages build of main started at this time, so main held it no later than this')}
        else:
            # Older than every listed main state (GitHub lists about 90 days of events): fall back to the first
            # first-parent commit that holds it, whose committer date is a lower bound.
            first = next(((c, t) for c, t in history if holds(s, c)), None)
            if not first or (earliest_known and first[1] and ar.git('show', '-s', '--format=%cI', first[0]).strip() and
                             _utc(first[1]) >= earliest_known):
                continue  # within the listed period yet never main's head: archived, not published
            body = {'type': 'publication-evidence', 'level': 'repository', 'subject': s['contentHash'], 'edition': s.get('edition'),
                    'commit': first[0], 'at': _utc(first[1]), 'basis': 'git-committer-date',
                    'uncertainty': 'older than the listed push events; published at or after this committer date'}
        added += ar.append(records, body, 'evidence') is not None
    return added


def _utc(iso: str) -> str:
    from datetime import datetime, timezone
    return datetime.fromisoformat(iso).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def website_evidence(records, deployments):
    added = 0
    for d in deployments:
        for s in subjects(records):
            if not holds(s, d['tree']):
                continue
            if d['state'] == 'success' and not has(records, s, 'website'):
                body = {'type': 'publication-evidence', 'level': 'website', 'subject': s['contentHash'], 'edition': s.get('edition'),
                        'at': d['at'], 'basis': 'github-pages-deployment-success', 'deployment': {k: d[k] for k in ('id', 'sha', 'tree', 'workflow', 'release')},
                        'uncertainty': 'time of the successful deployment status; caches may serve the previous site for a few minutes'}
                added += ar.append(records, body, 'evidence') is not None
            elif d['state'] in ('failure', 'error'):
                body = {'type': 'publication-failure', 'subject': s['contentHash'], 'edition': s.get('edition'), 'at': d['at'],
                        'reason': f"GitHub Pages deployment {d['id']} ended in {d['state']}", 'deployment': {k: d[k] for k in ('id', 'sha', 'tree', 'workflow', 'release')}}
                added += ar.append(records, body, 'evidence') is not None
    return added


def live_evidence(records, observed_at):
    fetched = {}
    for path in (ar.RESULTS, ar.PROJECTIONS, ar.LEDGER):
        with urllib.request.urlopen(urllib.request.Request(LIVE + path, headers={'Cache-Control': 'no-cache', 'User-Agent': 'tibinance-evidence'}), timeout=60) as r:
            fetched[path] = r.read()
    added = 0
    for s in subjects(records):
        if has(records, s, 'website'):
            continue
        if s['type'] == 'presentation':
            ok = ar.sha(fetched[ar.PROJECTIONS]) == s['sha256']
        elif s['product'] == 'tc-world-scenarios':
            ok = ar.scenario_digest(json.loads(fetched[ar.RESULTS])) == s['outputs']['digest']
        else:
            ok = f'"hash":"{s["source"]["ledger"]["hash"]}"' in fetched[ar.LEDGER].decode()
        if ok:
            added += ar.append(records, {'type': 'publication-evidence', 'level': 'website', 'subject': s['contentHash'], 'edition': s.get('edition'),
                                         'at': observed_at, 'basis': 'live-fetch', 'uncertainty': 'served at observation time; first-served time unknown'}, 'evidence') is not None
    return added


def gather(tok):
    pushes = sorted(({'at': e['created_at'], 'head': e['payload'].get('head'), 'before': e['payload'].get('before')}
                     for e in api(f'repos/{REPO}/events?per_page=100', tok)
                     if e['type'] == 'PushEvent' and e['payload'].get('ref') == 'refs/heads/main'), key=lambda p: p['at'])
    pushes = [p for p in pushes if p['head'] and ar.git('cat-file', '-t', p['head'], check=False).strip() == 'commit']
    deployments = []
    runs = {}
    for d in api(f'repos/{REPO}/deployments?environment=github-pages&per_page=100', tok):
        statuses = api(f"repos/{REPO}/deployments/{d['id']}/statuses?per_page=100", tok)
        final = next((s for s in statuses if s['state'] in ('success', 'failure', 'error', 'inactive')), None)
        if not final:
            continue
        success = next((s for s in statuses if s['state'] == 'success'), None)
        run_id = (final.get('log_url') or '').split('/runs/')[-1].split('/')[0]
        if run_id and run_id not in runs:
            runs[run_id] = api(f'repos/{REPO}/actions/runs/{run_id}', tok).get('name')
        workflow = runs.get(run_id)
        sha = d['sha']
        if ar.git('cat-file', '-t', sha, check=False).strip() != 'commit':
            continue
        release = None
        tree = sha
        if workflow == 'Pages release':
            manifest = blob(sha, 'release/production.json')
            if not manifest:
                continue
            release = json.loads(manifest)
            tree = release['commit']
            release = release['tag']
        deployments.append({'id': d['id'], 'sha': sha, 'tree': tree, 'workflow': workflow, 'release': release,
                            'state': 'success' if success else final['state'], 'at': (success or final)['created_at']})
    return pushes, sorted(deployments, key=lambda d: d['at'])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--rev', default='origin/main')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--live', action='store_true')
    a = ap.parse_args()
    records = ar.load()
    pushes, deployments = ([], []) if a.offline else gather(token())
    n = repository_evidence(records, a.rev, pushes, deployments)
    w = 0 if a.offline else website_evidence(records, deployments)
    l = live_evidence(records, ar.now()) if a.live else 0
    write_index(records)
    print(f'evidence: {n} repository, {w} website or failure, {l} live-fetch records added; '
          f'{len(deployments)} deployments and {len(pushes)} push events read; {len(records)} records; index rebuilt')


if __name__ == '__main__':
    main()
