"""Transactional publication on throwaway repositories: a bare origin, clones, and the real forecast tools copied in.

Covers: the first publication of an archive, idempotent reruns, a rejected push followed by a safe retry, two
publishers appending to the archive at once (reconciled, nothing lost or duplicated), a conflicting change of a
representation (refused), the publish lock, an edited Research ledger line (refused) and an unarchived representation
(refused before any commit).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TOOLS = ['tools/forecasts/archive.py', 'tools/forecasts/index.py', 'tools/forecasts/publish.py']
DATA = ['reports/tc-cycle/results.json', 'reports/tc-cycle/forecast-ledger.jsonl']


def sh(cwd, *args, check=True):
    # No bytecode caches in the fixture repositories: they have no .gitignore, and a cache would read as a change.
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    if check and r.returncode:
        raise AssertionError(f"{' '.join(args)}: {r.stdout}{r.stderr}")
    return r


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.origin = self.dir / 'origin.git'
        sh(self.dir, 'git', 'init', '--quiet', '--bare', '-b', 'main', str(self.origin))
        self.a = self.clone('a')
        for f in TOOLS + DATA:
            (self.a / f).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(REPO / f, self.a / f)
        # This fixture copies the real append-only ledger; its forecast count grows over time.
        self.ledger_hashes = [r['hash'] for line in (self.a / DATA[1]).read_text().splitlines()
                              if (r := json.loads(line)).get('type') == 'forecast']
        sh(self.a, 'git', 'add', '-A')
        sh(self.a, 'git', 'commit', '--quiet', '-m', 'base')
        sh(self.a, 'git', 'push', '--quiet', 'origin', 'HEAD:main')

    def tearDown(self):
        shutil.rmtree(self.dir)

    def clone(self, name):
        path = self.dir / name
        if not path.exists():
            sh(self.dir, 'git', 'clone', '--quiet', str(self.origin), str(path))
        for k, v in (('user.name', 'T'), ('user.email', 't@example.invalid'), ('commit.gpgsign', 'false')):
            sh(path, 'git', 'config', k, v)
        return path

    def publish(self, repo, *extra, check=True):
        return sh(repo, sys.executable, 'tools/forecasts/publish.py', '--message', 'publish', *extra, check=check)

    def origin_chain(self):
        text = sh(self.dir, 'git', '--git-dir', str(self.origin), 'show', 'main:data/forecast-archive/publications.jsonl').stdout
        return [json.loads(l) for l in text.splitlines()]

    def new_edition(self, repo, delta):
        results = json.loads((repo / DATA[0]).read_text())
        results['worldForecast'][0]['base'] += delta
        (repo / DATA[0]).write_text(json.dumps(results))

    def test_first_publication_then_idempotent_rerun(self):
        r = self.publish(self.a)
        self.assertIn('published', r.stdout)
        chain = self.origin_chain()
        self.assertEqual([x['type'] for x in chain].count('forecast'), 1 + len(self.ledger_hashes))
        self.assertCountEqual([x['source']['ledger']['hash'] for x in chain if x.get('product') == 'research-ledger'],
                              self.ledger_hashes)
        self.assertEqual(sh(self.a, 'git', 'status', '--porcelain').stdout, '')
        self.assertIn('nothing to publish', self.publish(self.a).stdout)
        self.assertEqual(len(self.origin_chain()), len(chain))

    def test_a_rejected_push_keeps_the_local_archive_and_a_retry_publishes_once(self):
        self.publish(self.a)
        flag = self.dir / 'reject'
        hook = self.origin / 'hooks' / 'pre-receive'
        hook.write_text(f'#!/bin/sh\n[ -f "{flag}" ] && exit 1\nexit 0\n')
        hook.chmod(0o755)
        flag.write_text('x')
        self.new_edition(self.a, 1)
        r = self.publish(self.a, check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('local archive is intact', r.stdout + r.stderr)
        local = [json.loads(l) for l in (self.a / 'data/forecast-archive/publications.jsonl').read_text().splitlines()]
        self.assertEqual(len(local), len(self.origin_chain()) + 2)  # the new edition and its supersession, archived but not published
        flag.unlink()
        self.publish(self.a)
        chain = self.origin_chain()
        hashes = [x['contentHash'] for x in chain]
        self.assertEqual(len(hashes), len(set(hashes)))
        self.assertEqual(hashes, [x['contentHash'] for x in local])

    def test_two_publishers_appending_at_once_are_reconciled_without_loss(self):
        self.publish(self.a)
        b = self.clone('b')
        sh(b, 'git', 'pull', '--quiet', 'origin', 'main')
        # B appends a record of its own to the archive and publishes first.
        sh(b, sys.executable, '-c', "import sys; sys.path.insert(0,'tools/forecasts'); import archive as ar; r=ar.load(); "
                                    "ar.append(r, {'type':'publication-evidence','level':'repository','subject':r[0]['contentHash'],'at':'2026-10-13T00:00:00Z','basis':'test'}, 'test')")
        self.publish(b)
        # A, still on the older main, publishes a new edition: the chains are reconciled, nothing is overwritten.
        self.new_edition(self.a, 2)
        self.publish(self.a)
        chain = self.origin_chain()
        types = [x['type'] for x in chain]
        self.assertIn('publication-evidence', types)
        self.assertEqual(types.count('forecast'), 1 + len(self.ledger_hashes) + 1)
        hashes = [x['contentHash'] for x in chain]
        self.assertEqual(len(hashes), len(set(hashes)))
        sh(self.a, sys.executable, 'tools/forecasts/archive.py', '--check')

    def test_a_representation_changed_on_main_meanwhile_is_never_overwritten(self):
        self.publish(self.a)
        b = self.clone('b')
        sh(b, 'git', 'pull', '--quiet', 'origin', 'main')
        self.new_edition(b, 3)
        self.publish(b)
        self.new_edition(self.a, 4)
        r = self.publish(self.a, check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('nothing was overwritten', r.stdout + r.stderr)
        results = json.loads(sh(self.dir, 'git', '--git-dir', str(self.origin), 'show', f'main:{DATA[0]}').stdout)
        self.assertEqual(results['worldForecast'][0]['base'], json.loads((REPO / DATA[0]).read_text())['worldForecast'][0]['base'] + 3)

    def test_the_lock_admits_one_publisher_at_a_time(self):
        gitdir = Path(sh(self.a, 'git', 'rev-parse', '--absolute-git-dir').stdout.strip())
        (gitdir / 'tibinance-publish.lock').write_text('1')
        r = self.publish(self.a, check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('another publication is running', r.stdout + r.stderr)

    def test_an_edited_ledger_line_is_refused(self):
        self.publish(self.a)
        lines = (self.a / DATA[1]).read_text().splitlines()
        lines[0] = lines[0].replace('"benchmark":"Antica"', '"benchmark":"Secura"')
        (self.a / DATA[1]).write_text('\n'.join(lines) + '\n')
        r = self.publish(self.a, '--no-ensure', check=False)
        self.assertNotEqual(r.returncode, 0)

    def test_an_unarchived_representation_is_refused_before_any_commit(self):
        self.publish(self.a)
        head = sh(self.a, 'git', 'rev-parse', 'HEAD').stdout
        self.new_edition(self.a, 5)
        r = self.publish(self.a, '--no-ensure', check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('not archived', r.stdout + r.stderr)
        self.assertEqual(sh(self.a, 'git', 'rev-parse', 'HEAD').stdout, head)
        self.assertEqual(sh(self.dir, 'git', '--git-dir', str(self.origin), 'rev-parse', 'main').stdout, head)

    def test_publish_never_force_pushes(self):
        text = (REPO / 'tools/forecasts/publish.py').read_text()
        self.assertNotIn('--force', text.replace("'worktree', 'remove', '--force'", ''))


if __name__ == '__main__':
    unittest.main()
