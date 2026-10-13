"""Publication evidence: archival is not publication, the evidence says what is known, and failures are recorded.

Uses real commits of this repository as main states (the content they hold is fixed history) and a temporary
archive, so the repository's archive is never touched.
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402
import publish_evidence as pe  # noqa: E402
from index import build_index  # noqa: E402

# Fixed history: b7eb0e4 holds the 2026-10-05 edition, fafec9c the 2026-10-04 edition (fafec9c's parent 8f8ead1 too).
E5, E4, OLD = 'b7eb0e4ad1b58e7aadd36bce5d7f8e440efcfe77', 'fafec9c', 'eb6296f'


def full(rev):
    return ar.git('rev-parse', rev).strip()


class EvidenceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = {k: getattr(ar, k) for k in ('ARCHIVE', 'CHAIN', 'OBJECTS')}
        ar.ARCHIVE = self.tmp / 'archive'
        ar.CHAIN = ar.ARCHIVE / 'publications.jsonl'
        ar.OBJECTS = ar.ARCHIVE / 'objects'
        self.records = ar.load()
        self.e5 = self.edition(E5)
        self.e4 = self.edition(E4)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(ar, k, v)
        shutil.rmtree(self.tmp)

    def edition(self, rev):
        return ar.ensure_scenario(self.records, ar.git_bytes(rev, ar.RESULTS), basis='test', programs={}, code_commit=rev,
                                  created={'value': None, 'basis': 'test'}, source={'kind': 'git', 'commit': rev})[0]

    def state(self, record):
        return next(f for f in build_index(self.records, [])['forecasts'] if f['contentHash'] == record['contentHash'])

    def test_an_archived_forecast_without_evidence_is_not_published(self):
        pe.repository_evidence(self.records, 'origin/main', pushes=[], deployments=[{'at': '2026-10-04T00:00:00Z', 'sha': full(OLD), 'workflow': 'pages build and deployment'}])
        self.assertEqual(self.state(self.e5)['state'], 'archived')
        self.assertIsNone(self.state(self.e5)['evidenceLevel'])

    def test_repository_evidence_is_the_first_main_state_that_holds_it_and_website_comes_from_deployments(self):
        pushes = [{'at': '2026-10-05T04:04:42Z', 'head': full(E5), 'before': full(E4)}]
        pe.repository_evidence(self.records, 'origin/main', pushes, [])
        s = self.state(self.e5)
        self.assertEqual((s['state'], s['evidenceLevel']), ('published', 'repository'))
        self.assertEqual(s['evidence']['repository']['basis'], 'github-push-event')
        pe.website_evidence(self.records, [{'id': 1, 'sha': full(E5), 'tree': full(E5), 'workflow': 'pages build and deployment', 'release': None,
                                            'state': 'success', 'at': '2026-10-05T04:05:16Z'}])
        s = self.state(self.e5)
        self.assertEqual((s['state'], s['evidenceLevel'], s['evidence']['website']['at']), ('published', 'website', '2026-10-05T04:05:16Z'))
        # Running again adds nothing.
        n = len(self.records)
        pe.repository_evidence(self.records, 'origin/main', pushes, [])
        self.assertEqual(len(self.records), n)

    def test_a_failed_deployment_after_archival_is_recorded_without_touching_the_forecast(self):
        before = [r for r in self.records if r['contentHash'] == self.e5['contentHash']]
        pe.website_evidence(self.records, [{'id': 2, 'sha': full(E5), 'tree': full(E5), 'workflow': 'Pages release', 'release': 'release/0009',
                                            'state': 'failure', 'at': '2026-10-06T00:00:00Z'}])
        s = self.state(self.e5)
        self.assertEqual(s['state'], 'publication-failed')
        self.assertEqual(s['failures'][0]['at'], '2026-10-06T00:00:00Z')
        self.assertEqual([r for r in self.records if r['contentHash'] == self.e5['contentHash']], before)
        # Repository evidence still counts as publication: the failure is kept beside it.
        pe.repository_evidence(self.records, 'origin/main', [{'at': '2026-10-05T04:04:42Z', 'head': full(E5), 'before': full(E4)}], [])
        s = self.state(self.e5)
        self.assertEqual((s['state'], s['evidenceLevel'], len(s['failures'])), ('published', 'repository', 1))

    def test_a_push_whose_previous_head_already_held_it_is_only_an_upper_bound(self):
        pe.repository_evidence(self.records, 'origin/main', [{'at': '2026-10-06T00:00:00Z', 'head': full(E5), 'before': full(E5)}], [])
        ev = self.state(self.e5)['evidence']['repository']
        self.assertEqual(ev['basis'], 'github-push-event-upper-bound')
        self.assertIn('earlier', ev['uncertainty'])

    def test_before_the_listed_period_the_committer_date_is_a_stated_lower_bound(self):
        pe.repository_evidence(self.records, 'origin/main', [{'at': '2030-01-01T00:00:00Z', 'head': full(OLD), 'before': full(OLD)}], [])
        ev = self.state(self.e4)['evidence']['repository']
        self.assertEqual(ev['basis'], 'git-committer-date')
        self.assertLess(ev['at'], '2030-01-01')

    def test_a_release_deployment_serves_the_release_commit_not_main(self):
        # A deployment made from main at E5 that serves an older release tree holding only the 2026-10-04 edition.
        pe.website_evidence(self.records, [{'id': 3, 'sha': full(E5), 'tree': full(E4), 'workflow': 'Pages release', 'release': 'release/0007',
                                            'state': 'success', 'at': '2026-10-07T00:00:00Z'}])
        self.assertEqual(self.state(self.e4)['evidence']['website']['release'], 'release/0007')
        self.assertIsNone(self.state(self.e5)['evidence']['website'])


if __name__ == '__main__':
    unittest.main()
