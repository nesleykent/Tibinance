"""Evaluation scores the right target week with the Research's own daily and weekly rules, waits for closed weeks,
never invents an observation, and keeps every earlier score when observations change."""
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archive as ar  # noqa: E402

try:
    import evaluate as ev
except ImportError:  # pragma: no cover
    ev = None

WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']  # Mon to Sun (past: the cutoff never passes today)
AFTER = '2026-09-28'  # the Monday after, which closes the week


def row(day, sell, buy, hour=12):
    """A TibiaMarket row observed at hour:00 Europe/Berlin (CEST, UTC+2) on day: after 10:00 it is that server day."""
    t = datetime.fromisoformat(f'{day}T{hour - 2:02d}:00:00').replace(tzinfo=timezone.utc).timestamp()
    return {'time': t, 'sell_offer': sell, 'buy_offer': buy}


@unittest.skipIf(ev is None, 'evaluation needs pandas')
class EvaluateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = {k: getattr(ar, k) for k in ('ARCHIVE', 'CHAIN', 'OBJECTS')}
        ar.ARCHIVE = self.tmp / 'archive'
        ar.CHAIN = ar.ARCHIVE / 'publications.jsonl'
        ar.OBJECTS = ar.ARCHIVE / 'objects'
        self.records = ar.load()
        outputs = {'kind': 'tc-world-scenarios', 'asOf': '2026-09-14', 'benchmark': 'Antica', 'benchmarkPaths': [],
                   'worldPaths': [{'world': 'Antica', 'date': d, 'side': s, 'base': 100.0, 'low': 90.0, 'high': 110.0, 'status': 'x'}
                                  for d in ('2026-09-21', '2026-09-28') for s in ('ask', 'bid')]}
        body = {'type': 'forecast', 'product': 'tc-world-scenarios', 'edition': 'tc-world-scenarios/2026-09-14', 'model': {'id': 'C+S+H transfer'},
                'dataCutoff': '2026-09-14', 'target': {'definition': 'weekly median'}, 'outputs': {'object': ar.put_object(outputs)}, 'provenance': 'authentic'}
        self.forecast = ar.append(self.records, body, 'test')
        self.evals = []
        self.path = ar.ARCHIVE / 'evaluations.jsonl'

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(ar, k, v)
        shutil.rmtree(self.tmp)

    def run_eval(self, rows, captures=()):
        return ev.evaluate(self.records, self.evals, {'antica': rows}, list(captures), [{'path': 'x', 'sha256': '0'}], path=self.path)

    def test_the_target_week_is_the_monday_to_sunday_week_holding_the_target_date(self):
        self.assertEqual(ev.week_of('2026-10-12'), '2026-10-18')
        self.assertEqual(ev.week_of('2026-10-18'), '2026-10-18')
        self.assertEqual(ev.week_of('2026-10-19'), '2026-10-25')

    def test_scores_the_weekly_median_of_daily_medians_once_the_week_is_closed(self):
        # Three days in the week; one day has two rows (daily median 105), so the weekly median is of 100, 105, 120.
        rows = [row(WEEK[0], 100, 95), row(WEEK[2], 100, 95, 12), row(WEEK[2], 110, 96, 14), row(WEEK[4], 120, 97),
                row(AFTER, 130, 120)]  # a Monday after: the cutoff passes the week's Sunday
        cutoff, added = self.run_eval(rows)
        self.assertEqual(str(cutoff.date()), AFTER)
        self.assertEqual([a['weekEnding'] for a in added], ['2026-09-27'])
        items = {(i['side']): i for i in added[0]['items']}
        self.assertEqual(items['ask']['actual'], 105.0)
        self.assertEqual(items['ask']['absError'], 5.0)
        self.assertAlmostEqual(items['ask']['pctError'], 100 * 5 / 105)
        self.assertTrue(items['ask']['inside'])
        self.assertEqual(items["bid"]["actual"], 95.5)  # medians of 95, 95.5 and 97
        self.assertTrue(items['bid']['inside'])
        # The next week (ending 2026-10-04) is not closed: awaiting observation.
        self.assertNotIn('2026-10-04', [a['weekEnding'] for a in added])

    def test_an_unclosed_week_and_a_week_without_offers_are_not_scored(self):
        _, added = self.run_eval([row(WEEK[1], 100, 95)])  # cutoff inside the week
        self.assertEqual(added, [])
        _, added = self.run_eval([row('2026-09-14', 100, 95), row('2026-10-05', 100, 95)])  # both weeks closed, no offer in them
        self.assertEqual([a['weekEnding'] for a in added], [])

    def test_captures_only_fill_days_without_a_market_offer(self):
        rows = [row(WEEK[0], 100, 95), row(AFTER, 100, 95)]
        cap = [{'world': 'Antica', 'capturedAt': f'{WEEK[0]}T15:00:00', 'sell': 500, 'buy': 450, 'hash': 'a'},
               {'world': 'Antica', 'capturedAt': f'{WEEK[3]}T15:00:00', 'sell': 120, 'buy': 100, 'hash': 'b'}]
        _, added = self.run_eval(rows, cap)
        ask = next(i for i in added[0]['items'] if i['side'] == 'ask')
        self.assertEqual(ask['actual'], 110.0)  # median of 100 (market, not 500) and 120 (capture fills its day)

    def test_rerunning_adds_nothing_and_a_changed_observation_supersedes_the_old_score(self):
        rows = [row(WEEK[0], 100, 95), row(AFTER, 130, 120)]
        self.run_eval(rows)
        n = len(self.evals)
        self.run_eval(rows)
        self.assertEqual(len(self.evals), n)
        first = [e for e in self.evals if e['type'] == 'evaluation'][0]
        _, added = self.run_eval(rows + [row(WEEK[1], 120, 96)])
        types = [e['type'] for e in self.evals[n:]]
        self.assertEqual(types, ['evaluation-superseded', 'evaluation'])
        self.assertEqual(self.evals[n]['previous'], first['contentHash'])
        self.assertIn(first, self.evals)  # the earlier score stays on record
        self.assertEqual(ar.read_chain(self.path.read_text(), 'evaluations.jsonl')[-1]['items'][0]['actual'], 110.0)

    def test_a_zero_actual_has_no_percentage_error(self):
        s = ev.score(10.0, 0.0, None, None)
        self.assertIsNone(s['pctError'])
        self.assertIsNone(s['logError'])
        self.assertEqual(s['absError'], 10.0)

    def test_the_forecast_record_is_never_changed_by_evaluation(self):
        before = ar.CHAIN.read_bytes()
        self.run_eval([row(WEEK[0], 100, 95), row(AFTER, 130, 120)])
        self.assertEqual(ar.CHAIN.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
