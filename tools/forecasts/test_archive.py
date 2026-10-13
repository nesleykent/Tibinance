"""The forecast archive never loses or rewrites a forecast.

Every test runs on a temporary copy of the archive layout, using the repository's real Research output as the
edition, so the records are the ones production writes.
"""
import copy
import gzip
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RESULTS = (REPO / ar.RESULTS).read_bytes()
LEDGER = (REPO / ar.LEDGER).read_text()
PROJECTIONS = (REPO / ar.PROJECTIONS).read_bytes()


def _fingerprint():
    root = REPO / 'data' / 'forecast-archive'
    return sorted((str(p.relative_to(root)), p.read_bytes()) for p in root.rglob('*') if p.is_file()) if root.exists() else []


class ArchiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.real = _fingerprint()

    @classmethod
    def tearDownClass(cls):
        # The repository's own archive must be byte-identical after the tests: they only touch temporary copies.
        assert _fingerprint() == cls.real, 'a test wrote into the repository archive'

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = {k: getattr(ar, k) for k in ('ROOT', 'ARCHIVE', 'CHAIN', 'OBJECTS')}
        ar.ROOT = self.tmp
        ar.ARCHIVE = self.tmp / 'data' / 'forecast-archive'
        ar.CHAIN = ar.ARCHIVE / 'publications.jsonl'
        ar.OBJECTS = ar.ARCHIVE / 'objects'
        for path, data in ((ar.RESULTS, RESULTS), (ar.LEDGER, LEDGER.encode()), (ar.PROJECTIONS, PROJECTIONS)):
            (self.tmp / path).parent.mkdir(parents=True, exist_ok=True)
            (self.tmp / path).write_bytes(data)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(ar, k, v)
        shutil.rmtree(self.tmp)

    def scenario(self, records, results_bytes=RESULTS, source=None):
        return ar.ensure_scenario(records, results_bytes, basis='test', programs={'reports/tc-cycle/analyze.py': 'x'}, code_commit='c0',
                                  created={'value': None, 'basis': 'test'}, source=source or {'kind': 'test'})

    def test_archiving_twice_adds_nothing(self):
        records = ar.load()
        first, added = self.scenario(records)
        self.assertTrue(added)
        n = len(records)
        again, added = self.scenario(records)
        self.assertFalse(added)
        self.assertEqual(again['contentHash'], first['contentHash'])
        self.assertEqual(len(records), n)
        self.assertEqual(len(ar.load()), n)

    def test_the_same_content_has_the_same_identity_on_any_machine_at_any_time(self):
        a = self.scenario(ar.load())[0]
        shutil.rmtree(ar.ARCHIVE)
        b = self.scenario(ar.load())[0]
        self.assertEqual(a['contentHash'], b['contentHash'])
        self.assertNotIn('archivedAt', {k for k in a if k not in ar.EVENT_KEYS})

    def test_a_revised_edition_for_the_same_cutoff_supersedes_without_replacing(self):
        records = ar.load()
        old = self.scenario(records)[0]
        revised = json.loads(RESULTS)
        revised['worldForecast'][0]['base'] += 1
        new, added = self.scenario(records, json.dumps(revised).encode())
        self.assertTrue(added)
        sup = [r for r in records if r['type'] == 'supersession']
        self.assertEqual([(s['supersedes'], s['by']) for s in sup], [(old['contentHash'], new['contentHash'])])
        # Both editions stay, each with its own outputs.
        self.assertEqual(ar.get_object(old['outputs']['object'])['worldPaths'][0]['base'], json.loads(RESULTS)['worldForecast'][0]['base'])
        self.assertEqual(ar.get_object(new['outputs']['object'])['worldPaths'][0]['base'], revised['worldForecast'][0]['base'])

    def test_any_edited_line_breaks_the_chain(self):
        records = ar.load()
        self.scenario(records)
        ar.ensure_ledger(records, LEDGER, basis='test', source_for=lambda r: {'kind': 'test'})
        lines = ar.CHAIN.read_text().splitlines()
        r = json.loads(lines[0])
        r['dataCutoff'] = '2020-01-01'
        ar.CHAIN.write_text('\n'.join([ar.canonical(r), *lines[1:]]) + '\n')
        with self.assertRaises(ValueError):
            ar.load()
        ar.CHAIN.write_text('\n'.join(lines[1:]) + '\n')
        with self.assertRaises(ValueError):
            ar.load()

    def test_objects_are_immutable_and_verified(self):
        digest = ar.put_object({'a': 1})
        path = ar.OBJECTS / f'{digest}.json.gz'
        before = path.read_bytes()
        self.assertEqual(ar.put_object({'a': 1}), digest)
        self.assertEqual(path.read_bytes(), before)
        path.write_bytes(gzip.compress(b'{"a":2}', mtime=0))
        with self.assertRaises(ValueError):
            ar.get_object(digest)

    def test_check_fails_when_a_published_representation_is_not_archived(self):
        self.assertTrue(any('not archived' in p for p in ar.check()))
        records = ar.load()
        self.scenario(records)
        ar.ensure_ledger(records, LEDGER, basis='test', source_for=lambda r: {'kind': 'test'})
        ar.ensure_presentation(records, PROJECTIONS, RESULTS, basis='test', source={'kind': 'test'})
        self.assertTrue(any('index.json' in p for p in ar.check()), 'a missing or stale index is caught')
        from index import write_index
        write_index(records)
        self.assertEqual(ar.check(), [])
        # A new Research output on disk that was not archived is caught.
        changed = json.loads(RESULTS)
        changed['worldForecast'][1]['low'] *= 1.001
        (self.tmp / ar.RESULTS).write_text(json.dumps(changed))
        self.assertTrue(any(ar.RESULTS in p for p in ar.check()))

    def test_projections_must_present_an_archived_edition_built_from_the_results_beside_them(self):
        records = ar.load()
        with self.assertRaises(SystemExit):
            ar.ensure_presentation(records, PROJECTIONS, RESULTS, basis='test', source={})
        self.scenario(records)
        other = json.loads(RESULTS)
        other['captureCount'] += 1
        with self.assertRaises(SystemExit):
            ar.ensure_presentation(records, PROJECTIONS, json.dumps(other).encode(), basis='test', source={})

    def test_reconcile_keeps_both_sides_and_loses_nothing(self):
        records = ar.load()
        self.scenario(records)
        base = ar.CHAIN.read_text()
        # Theirs: another agent archived the ledger. Ours: a revised edition. Both appended to the same prefix.
        ar.ensure_ledger(records, LEDGER, basis='theirs', source_for=lambda r: {'kind': 'test'})
        theirs = ar.CHAIN.read_text()
        ar.CHAIN.write_text(base)
        records = ar.load()
        revised = json.loads(RESULTS)
        revised['worldForecast'][2]['high'] += 5
        ours_new = self.scenario(records, json.dumps(revised).encode())[0]
        theirs_hashes = [r['contentHash'] for r in ar.read_chain(theirs)]
        original = ar.git_bytes
        ar.git_bytes = lambda rev, path: theirs.encode()
        try:
            ar.cmd_reconcile('theirs')
        finally:
            ar.git_bytes = original
        merged = ar.load()
        hashes = [r['contentHash'] for r in merged]
        self.assertEqual(hashes[:len(theirs_hashes)], theirs_hashes)
        self.assertIn(ours_new['contentHash'], hashes)
        self.assertEqual(len(hashes), len(set(hashes)))

    def test_ledger_import_is_read_only_and_complete(self):
        records = ar.load()
        ar.ensure_ledger(records, LEDGER, basis='test', source_for=lambda r: {'kind': 'test'})
        frozen = [json.loads(l) for l in LEDGER.splitlines() if json.loads(l)['type'] == 'forecast']
        imported = [r for r in records if r['product'] == 'research-ledger']
        self.assertEqual([r['source']['ledger']['hash'] for r in imported], [f['hash'] for f in frozen])
        self.assertEqual((REPO / ar.LEDGER).read_text(), LEDGER)
        for r, f in zip(imported, frozen):
            self.assertEqual(r['createdAt'], {'value': f['recordedAt'], 'basis': 'ledger recordedAt'})
            self.assertEqual(ar.get_object(r['outputs']['object'])['antica'], f['antica'])

    def test_inputs_are_preserved_with_the_forecast_and_corrections_never_change_them(self):
        records = ar.load()
        rec = self.scenario(records)[0]
        snapshot = ar.get_object(rec['inputs']['object'])
        self.assertEqual(snapshot['asOf'], json.loads(RESULTS)['asOf'])
        self.assertEqual(rec['inputs']['missing'], [])
        # A later correction of an input (an anchor) is a new edition; the archived snapshot is untouched.
        corrected = json.loads(RESULTS)
        corrected['worlds'][0]['ask'] += 10
        corrected['worldForecast'][0]['base'] += 10
        self.scenario(records, json.dumps(corrected).encode())
        self.assertEqual(ar.get_object(rec['inputs']['object']), snapshot)


try:
    import numpy  # noqa: F401
    import reproduce
except ImportError:  # pragma: no cover
    reproduce = None


@unittest.skipIf(reproduce is None, 'reproduction needs numpy')
class ReproduceTest(unittest.TestCase):
    def test_the_current_edition_rebuilds_from_its_snapshot(self):
        results = json.loads(RESULTS)
        snapshot, missing = ar.scenario_snapshot(results)
        self.assertEqual(missing, [])
        res = reproduce.compare(reproduce.scenarios(snapshot), {'benchmarkPaths': results['forecast'], 'worldPaths': results['worldForecast']})
        self.assertTrue(res['ok'], res)

    def test_a_changed_input_is_detected(self):
        results = json.loads(RESULTS)
        snapshot, _ = ar.scenario_snapshot(results)
        snapshot = copy.deepcopy(snapshot)
        snapshot['worlds'][0]['askLocalStress'] += 0.01
        res = reproduce.compare(reproduce.scenarios(snapshot), {'benchmarkPaths': results['forecast'], 'worldPaths': results['worldForecast']})
        self.assertFalse(res['ok'])


if __name__ == '__main__':
    unittest.main()
