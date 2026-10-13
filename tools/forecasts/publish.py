"""Transactional forecast publication: archive, validate and commit a publication unit, then push it to main.

    python3 tools/forecasts/publish.py --message "<subject>" [--with <path> ...] [--no-push] [--remote origin]

A forecast is published by committing its representation (reports/tc-cycle/results.json, the Research ledger,
data/market-projections/tibia-coin.json) to main. This makes that one transaction:

1. Archive: archive.py --ensure records every edition the working tree presents (durably, fsync).
2. Stage one publication unit: the representations, data/forecast-archive/ (chains, new objects, index.json) and
   any --with paths (for example the whole Research update).
3. Validate before committing: chains, objects, every representation archived, index fresh, and the Research ledger
   on main is a prefix of the working ledger (no line of it changed).
4. Build one commit on top of the remote main with git plumbing (the working tree and index are not touched). The
   archive chains are reconciled by contentHash if the remote appended meanwhile: the remote's records first, then
   ours that it lacks, nothing dropped or duplicated. Any other unit file changed on the remote since this
   checkout aborts the publication: another publication is never overwritten.
5. Validate the commit's tree again, then push it without force. A rejected push (main moved) rebuilds on the new
   main and retries; a failed push leaves the local archive as it is, so rerunning is safe (content hashes dedupe).
6. Afterwards the local branch fast-forwards to the published commit.

Repository publication is this push; website publication is a later, separate event (tools/release.mjs --data and
the Pages deployment), recorded by publish_evidence.py. Only one publish runs at a time per checkout (a lock in the
git directory); CI rejects any commit whose representations are not archived, whatever made it.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402
from index import EVALUATIONS, write_index  # noqa: E402

UNIT = [ar.RESULTS, ar.LEDGER, ar.PROJECTIONS, 'data/forecast-archive']
CHAINS = ['data/forecast-archive/publications.jsonl', f'data/forecast-archive/{EVALUATIONS}', 'data/forecast-archive/index.json']


def run(*args, input=None, env=None, check=True):
    r = subprocess.run(args, cwd=ar.ROOT, capture_output=True, input=input, env={**os.environ, **(env or {})})
    if check and r.returncode:
        raise SystemExit(f"{' '.join(args)} failed:\n{r.stderr.decode()}{r.stdout.decode()}")
    return r


def git(*args, **kw):
    return run('git', *args, **kw)


def out(*args):
    return git(*args).stdout.decode().strip()


def changed_paths(paths):
    """Working-tree files under paths that differ from HEAD (modified, added or untracked)."""
    files = set()
    for flags in (['diff', '--name-only', 'HEAD', '--'], ['ls-files', '--others', '--exclude-standard', '--']):
        files |= {l for l in out(*flags, *paths).splitlines() if l}
    deleted = {l for l in out('diff', '--name-only', '--diff-filter=D', 'HEAD', '--', *paths).splitlines() if l}
    return sorted(files - deleted), sorted(deleted)


def blob(rev, path):
    r = git('show', f'{rev}:{path}', check=False)
    return r.stdout if r.returncode == 0 else None


def reconcile_chain(theirs: bytes | None, ours: bytes | None, name: str) -> bytes:
    """Theirs is kept as it is; our records it lacks follow, re-chained, contents unchanged."""
    theirs_text, ours_text = (theirs or b'').decode(), (ours or b'').decode()
    if ours_text.startswith(theirs_text):
        return ours_text.encode()
    base = ar.read_chain(theirs_text, name)
    have = {r['contentHash'] for r in base}
    text = theirs_text
    for r in ar.read_chain(ours_text, name):
        if r['contentHash'] in have:
            continue
        body = {k: v for k, v in r.items() if k not in ('seq', 'prev', 'hash')}
        prev = ar.sha(text.splitlines()[-1]) if text else ar.ZERO
        rec = {**body, 'seq': len(base) + 1, 'prev': prev}
        line = ar.canonical({**rec, 'hash': ar.sha(ar.canonical(rec))})
        text += line + '\n'
        base.append(rec)
    ar.read_chain(text, name)
    return text.encode()


def build_commit(base: str, files: list[str], deleted: list[str], message: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        env = {'GIT_INDEX_FILE': str(Path(tmp) / 'index')}
        git('read-tree', base, env=env)
        for path in files:
            data = (ar.ROOT / path).read_bytes()
            sha = git('hash-object', '-w', '--stdin', input=data).stdout.decode().strip()
            git('update-index', '--add', '--cacheinfo', f'100644,{sha},{path}', env=env)
        for path in deleted:
            git('update-index', '--remove', '--', path, env=env)
        tree = git('write-tree', env=env).stdout.decode().strip()
        return out('commit-tree', tree, '-p', base, '-m', message)


def validate_tree(commit: str) -> list[str]:
    """archive.py --check on the commit's own tree, in a temporary worktree."""
    with tempfile.TemporaryDirectory() as tmp:
        git('worktree', 'add', '--detach', tmp, commit)
        try:
            r = subprocess.run([sys.executable, str(Path(tmp) / 'tools/forecasts/archive.py'), '--check'], cwd=tmp, capture_output=True, text=True)
            return [] if r.returncode == 0 else [r.stdout.strip() or r.stderr.strip()]
        finally:
            git('worktree', 'remove', '--force', tmp)


def ledger_prefix_problem(base: str) -> str | None:
    committed, working = blob(base, ar.LEDGER), (ar.ROOT / ar.LEDGER).read_bytes() if (ar.ROOT / ar.LEDGER).exists() else None
    if committed and working is not None and not working.startswith(committed):
        return f'{ar.LEDGER}: a committed line was changed or removed (the Research ledger is append-only)'
    return None


def follow(published: str, files: list[str]) -> bool:
    """Fast-forward the local branch to the published commit; working files equal to it are taken from it."""
    if git('merge-base', '--is-ancestor', 'HEAD', published, check=False).returncode:
        return False
    saved = {}
    for path in files:
        data = blob(published, path)
        local = ar.ROOT / path
        if data is not None and local.exists() and local.read_bytes() == data:
            saved[path] = data
            if git('cat-file', '-e', f'HEAD:{path}', check=False).returncode == 0:
                git('checkout', 'HEAD', '--', path)
            else:
                local.unlink()
    r = git('merge', '--ff-only', '--quiet', published, check=False)
    if r.returncode:
        for path, data in saved.items():
            (ar.ROOT / path).parent.mkdir(parents=True, exist_ok=True)
            (ar.ROOT / path).write_bytes(data)
        print(f'note: the local branch was not fast-forwarded: {r.stderr.decode().strip()}')
        return False
    return True


def publish(message: str, with_paths: list[str], push: bool = True, remote: str = 'origin', ensure: bool = True) -> str:
    gitdir = Path(out('rev-parse', '--git-common-dir'))
    lock = (gitdir if gitdir.is_absolute() else ar.ROOT / gitdir) / 'tibinance-publish.lock'
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f'{os.getpid()}\n'.encode())
        os.close(fd)
    except FileExistsError:
        raise SystemExit(f'another publication is running ({lock}); remove it only if no publish process is alive')
    try:
        if ensure:
            run(sys.executable, str(Path(__file__).resolve().parent / 'archive.py'), '--ensure')
        main_ref = f'{remote}/main' if push else 'HEAD'
        for attempt in range(1, 6):
            if push:
                git('fetch', '--quiet', remote, 'main')
                if git('merge-base', '--is-ancestor', 'HEAD', main_ref, check=False).returncode:
                    raise SystemExit(f'HEAD has commits not on {main_ref}: push your checkpoint first, then publish')
            base = out('rev-parse', main_ref)
            problem = ledger_prefix_problem(base)
            if problem:
                raise SystemExit(problem)
            # Refuse before touching anything when main changed a unit file other than the archive's own.
            files, deleted = changed_paths(UNIT + with_paths)
            # Objects are content-addressed (same name, same bytes), so only other files can conflict.
            moved = [p for p in files + deleted if p not in CHAINS and not p.startswith('data/forecast-archive/objects/')
                     and blob('HEAD', p) != blob(base, p)]
            if moved:
                raise SystemExit(f'{main_ref} changed {", ".join(moved[:5])} since this checkout: another publication or update '
                                 'reached main; update your checkout and rerun (nothing was overwritten)')
            # Reconcile the archive chains with main's: main's records first, then ours it lacks. The working copy
            # becomes that superset (nothing of ours is lost), with the objects main's records cite, and the
            # derived index is rebuilt from it.
            for chain in CHAINS[:2]:
                local = ar.ROOT / chain
                ours = local.read_bytes() if local.exists() else None
                merged = reconcile_chain(blob(base, chain), ours, Path(chain).name)
                if merged and merged != ours:
                    local.parent.mkdir(parents=True, exist_ok=True)
                    local.write_bytes(merged)
            for r in ar.load() + __import__('index').load_evaluations():
                for key in ('outputs', 'inputs', 'observation'):
                    digest = (r.get(key) or {}).get('object')
                    path = f'data/forecast-archive/objects/{digest}.json.gz'
                    if digest and not (ar.ROOT / path).exists() and (data := blob(base, path)) is not None:
                        (ar.ROOT / path).parent.mkdir(parents=True, exist_ok=True)
                        (ar.ROOT / path).write_bytes(data)
            write_index(ar.load())
            problems = ar.check()
            if problems:
                raise SystemExit('the publication unit is inconsistent; nothing was committed:\n' + '\n'.join(problems))
            files, deleted = changed_paths(UNIT + with_paths)
            files = [p for p in files if blob(base, p) != (ar.ROOT / p).read_bytes()]
            if not files and not deleted:
                print('nothing to publish: the unit equals main')
                return base
            commit = build_commit(base, files, deleted, message)
            tree_problems = validate_tree(commit)
            if tree_problems:
                raise SystemExit('the publication commit failed validation; nothing was pushed:\n' + '\n'.join(tree_problems))
            if not push:
                follow(commit, files)
                print(f'published locally as {commit[:12]} (not pushed)')
                return commit
            r = git('push', '--porcelain', remote, f'{commit}:refs/heads/main', check=False)
            if r.returncode == 0:
                follow(commit, files)
                print(f'published {commit[:12]} to {remote}/main: {len(files)} files, {len(deleted)} removed')
                return commit
            print(f'push rejected (attempt {attempt}); rebuilding on the new main')
        raise SystemExit('push rejected five times; the local archive is intact, rerun to retry')
    finally:
        lock.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--message', required=True)
    ap.add_argument('--with', dest='with_paths', action='append', default=[])
    ap.add_argument('--no-push', action='store_true')
    ap.add_argument('--no-ensure', action='store_true', help='validate only what is already archived (for tests)')
    ap.add_argument('--remote', default='origin')
    a = ap.parse_args()
    publish(a.message, a.with_paths, push=not a.no_push, remote=a.remote, ensure=not a.no_ensure)


if __name__ == '__main__':
    main()
