"""The gold challenger (challenger.py) in a temporary archive: its outputs follow from its snapshot alone, an edition
is archived once, it reproduces, it is scored like any forecast, and it is never a presented projection."""
import hashlib
import math
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402
import challenger as ch  # noqa: E402
import evaluate as ev  # noqa: E402
import reproduce as rp  # noqa: E402

SNAPSHOT = {
    'kind': 'tc-gold-challenger-inputs', 'asOf': '2026-10-06', 'origin': '2026-10-04', 'config': ch.CONFIG,
    'coefficients': {'1': {'const': 0.001, 'grossPotential': 0.01, 'playerDeaths': -0.002},
                     '4': {'const': 0.005, 'grossPotential': 0.05, 'playerDeaths': -0.01},
                     '13': {'const': 0.02, 'grossPotential': 0.04, 'playerDeaths': -0.05}},
    'training': {}, 'gold': {},
    'worlds': [{'world': 'Antica', 'p0': 42400.0, 'featureWeek': '2026-09-27', 'features': {'grossPotential': 0.2, 'playerDeaths': 0.1}, 'killCoverage': 0.98},
               {'world': 'Secura', 'p0': 38000.0, 'featureWeek': '2026-09-27', 'features': {'grossPotential': -0.1, 'playerDeaths': 0.0}, 'killCoverage': 0.97}],
    'datasets': [],
}


def digest_tree(root: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob('*')):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode() + p.read_bytes())
    return h.hexdigest()


class ChallengerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.real = digest_tree(ar.ARCHIVE)

    @classmethod
    def tearDownClass(cls):
        assert digest_tree(ar.ARCHIVE) == cls.real, 'the repository archive changed during the tests'

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = {k: getattr(ar, k) for k in ('ARCHIVE', 'CHAIN', 'OBJECTS')}
        ar.ARCHIVE = self.tmp / 'data' / 'forecast-archive'
        ar.CHAIN = ar.ARCHIVE / 'publications.jsonl'
        ar.OBJECTS = ar.ARCHIVE / 'objects'

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(ar, k, v)
        shutil.rmtree(self.tmp)

    def test_outputs_follow_from_the_snapshot(self):
        out = ch.predict(SNAPSHOT)
        self.assertEqual(len(out['worldPaths']), 2 * len(ch.HORIZONS))
        p = next(x for x in out['worldPaths'] if x['world'] == 'Antica' and x['horizon'] == 4)
        self.assertEqual(p['date'], '2026-11-01', 'four weeks after the origin week')
        self.assertAlmostEqual(p['base'], 42400 * math.exp(0.005 + 0.05 * 0.2 - 0.01 * 0.1))
        self.assertEqual((p['side'], p['low'], p['high']), ('ask', None, None), 'point forecasts of the Sell Offer only')
        self.assertEqual(ch.predict(SNAPSHOT), out, 'deterministic')

    def test_archived_once_reproduced_and_scored_like_any_forecast(self):
        records = []
        record = ch.ensure(records, SNAPSHOT, basis='test')
        self.assertEqual((record['product'], record['role'], record['provenance']), ('tc-gold-challenger', 'challenger', 'authentic'))
        self.assertEqual(record['interval']['kind'], 'none')
        self.assertEqual(record['reproducibility']['missing'], [])
        self.assertIsNone(ch.ensure(records, SNAPSHOT, basis='test'), 'the same outputs are archived once')
        self.assertEqual(len(ar.load()), 1)
        self.assertTrue(rp.reproduce_record(record)['ok'])
        items = list(ev.items_of(record))
        self.assertEqual(len(items), 6)
        week, horizon, world, side, model, predicted, low, high, target = next(i for i in items if i[2] == 'Secura' and i[1] == 13)
        self.assertEqual((week, side, model, low, high, target), ('2027-01-03', 'ask', 'E gold challenger', None, None, '2027-01-03'))
        self.assertAlmostEqual(predicted, 38000 * math.exp(0.02 - 0.004))

    def test_a_new_snapshot_is_a_new_edition_and_nothing_is_overwritten(self):
        records = []
        first = ch.ensure(records, SNAPSHOT, basis='test')
        later = {**SNAPSHOT, 'worlds': [{**w, 'p0': w['p0'] + 100} for w in SNAPSHOT['worlds']]}
        second = ch.ensure(records, later, basis='test')
        self.assertNotEqual(first['outputs']['digest'], second['outputs']['digest'])
        self.assertEqual([r['seq'] for r in ar.load()], [1, 2])
        self.assertEqual(ar.get_object(first['outputs']['object']), ch.predict(SNAPSHOT), 'the first edition is unchanged')

    def test_never_a_presented_projection(self):
        # archive.check() validates presentations of the Research scenarios only; a challenger has none.
        ch.ensure([], SNAPSHOT, basis='test')
        self.assertFalse(any(r['type'] == 'presentation' for r in ar.load()))


if __name__ == '__main__':
    unittest.main()
