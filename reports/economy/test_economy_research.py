"""Tests of the econometrics' own rules, on synthetic data: the specifications never put all three components
together, a week with a missing day is missing, point-in-time features never use later evidence, the quarterly
divergence counts, the Diebold-Mariano sign and the strict JSON output.

Run from the repository root with the pinned Python:
    /Users/nesleykent/Code/Tibinance/.venv/bin/python -m unittest discover -s reports/economy -p 'test_*.py'
"""
import json
import math
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import economy_research as er  # noqa: E402

DAY_COLUMNS = ('directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable')


def daily(world, first, values, status):
    days = pd.date_range(first, periods=len(status), freq='D')
    frame = pd.DataFrame({'world': world, 'day': days, 'status': list(status), **{c: values for c in DAY_COLUMNS}})
    frame['grossPotential'] = frame['directCoins'] + frame['npcPotential']
    return frame


class Specifications(unittest.TestCase):
    def test_never_all_three_components_together(self):
        for name, columns in er.COMPONENTS.items():
            self.assertFalse({'directCoins', 'npcPotential', 'grossPotential'} <= set(columns), name)
            if 'grossPotential' in columns:
                self.assertEqual(columns, ['grossPotential'], f'{name}: the sum never beside its parts')

    def test_d_reports_collinearity(self):
        rng = np.random.default_rng(1)
        a = rng.normal(size=200)
        x = pd.DataFrame({'a': a, 'b': a + rng.normal(scale=0.1, size=200)})
        c = er.collinearity(x)
        self.assertEqual(c['rank'], 2)
        self.assertGreater(c['vif'][0], 10)


class WeeklySums(unittest.TestCase):
    def test_a_week_with_a_missing_day_is_missing(self):
        # Monday 2025-09-01 to Sunday 2025-09-14: the first week complete, the second with a missing day.
        status = 'o' * 7 + 'ooo' + 'm' + 'roo'
        values = [1.0] * 14
        values[10] = np.nan
        w = er.gold_weekly(daily('Antica', '2025-09-01', values, status)).set_index('week')
        self.assertEqual(w.loc['2025-09-07', 'grossPotential'], 14.0)
        self.assertEqual(w.loc['2025-09-07', 'days'], 7)
        self.assertTrue(math.isnan(w.loc['2025-09-14', 'grossPotential']), 'never a partial sum')
        self.assertEqual(w.loc['2025-09-14', 'days'], 6)

    def test_recovered_days_count_as_data(self):
        w = er.gold_weekly(daily('Antica', '2025-09-01', [2.0] * 7, 'rrooooo')).set_index('week')
        self.assertEqual(w.loc['2025-09-07', 'grossPotential'], 28.0)


class PointInTime(unittest.TestCase):
    """Correction 11: a forecast made at an origin sees only the build made by then, and no week after it."""

    def build(self, last_week, value):
        weeks = pd.date_range('2025-01-05', last_week, freq='W-SUN')
        frame = pd.DataFrame({'week': weeks, 'directCoins': value, 'npcPotential': value, 'grossPotential': value,
                              'playerDeaths': value, 'coverage': 0.98, 'world': 'Antica'})
        frame.loc[frame.index[-1], ['grossPotential', 'coverage']] = np.nan   # the unfinished trailing week
        return frame

    def setUp(self):
        self.builds = {pd.Timestamp('2025-03-01'): self.build('2025-03-02', 1.0),
                       pd.Timestamp('2025-04-01'): self.build('2025-04-06', 2.0)}

    def test_a_later_build_is_never_used(self):
        f = er.features_at(self.builds, pd.Timestamp('2025-03-30'))
        self.assertEqual(f.loc['Antica', 'grossPotential'], 1.0, 'the April build was not published by March 30')
        f = er.features_at(self.builds, pd.Timestamp('2025-04-06'))
        self.assertEqual(f.loc['Antica', 'grossPotential'], 2.0)

    def test_the_latest_complete_week_on_or_before_the_origin(self):
        f = er.features_at(self.builds, pd.Timestamp('2025-03-30'))
        self.assertEqual(f.loc['Antica', 'week'], pd.Timestamp('2025-02-23'), 'the trailing week has no growth')
        f = er.features_at(self.builds, pd.Timestamp('2025-04-13'))
        self.assertEqual(f.loc['Antica', 'week'], pd.Timestamp('2025-03-30'))

    def test_no_build_yet(self):
        self.assertTrue(er.features_at(self.builds, pd.Timestamp('2025-02-01')).empty)

    def test_infinite_growth_is_not_a_feature(self):
        b = self.build('2025-03-23', 1.0)
        b.loc[b.index[-2], 'grossPotential'] = np.inf
        f = er.features_at({pd.Timestamp('2025-03-01'): b}, pd.Timestamp('2025-03-30'))
        self.assertEqual(f.loc['Antica', 'week'], pd.Timestamp('2025-03-09'))


class Divergence(unittest.TestCase):
    def panel(self, world, gold, ask):
        """Two quarters of 13 weeks: gold and price levels per quarter."""
        weeks = pd.date_range('2025-07-06', periods=26, freq='W-SUN')
        q1 = weeks.to_period('Q') == pd.Period('2025Q3')
        return pd.DataFrame({'world': world, 'week': weeks, 'grossPotential': np.where(q1, gold[0], gold[1]),
                             'grossStable': np.where(q1, gold[0], gold[1]), 'playerDeaths': 10.0,
                             'ask': np.where(q1, ask[0], ask[1])})

    def test_counts_gold_up_price_down(self):
        p = pd.concat([self.panel('Antica', (100, 120), (50, 45)), self.panel('Gentebra', (100, 90), (50, 45)),
                       self.panel('Secura', (100, 120), (50, 55))], ignore_index=True)
        q = {x['quarter']: x for x in er.divergence_by_quarter(p)['quarters']}
        self.assertEqual(list(q), ['2025Q4'])
        self.assertEqual(q['2025Q4']['worlds'], 3)
        self.assertEqual(q['2025Q4']['goldUpPriceDown'], 1)
        self.assertEqual(q['2025Q4']['goldUp'], 2)
        self.assertEqual(q['2025Q4']['priceDown'], 2)

    def test_a_short_quarter_is_not_compared(self):
        p = self.panel('Antica', (100, 120), (50, 45)).iloc[:20]
        self.assertEqual(er.divergence_by_quarter(p)['quarters'], [])


class Forecast(unittest.TestCase):
    def test_diebold_mariano_sign(self):
        rng = np.random.default_rng(3)
        base = rng.normal(scale=2, size=200)
        better = base * 0.5
        self.assertLess(er.dm_test(base, better, 1)['stat'], 0, 'negative: the model is better')
        self.assertIsNone(er.dm_test(base[:5], better[:5], 1), 'too few points')


class StrictJson(unittest.TestCase):
    def test_non_finite_numbers_become_null(self):
        out = er.clean({'a': float('nan'), 'b': [np.float64('inf'), np.int64(3), np.bool_(True)], 'c': pd.Timestamp('2025-09-07')})
        text = json.dumps(out, allow_nan=False)
        self.assertEqual(json.loads(text), {'a': None, 'b': [None, 3, True], 'c': '2025-09-07'})

    def test_committed_results_are_strict_json(self):
        text = (Path(__file__).resolve().parent / 'results.json').read_text()
        json.loads(text, parse_constant=lambda c: self.fail(f'{c} in results.json'))


if __name__ == '__main__':
    unittest.main()
