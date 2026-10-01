"""Source priority, cutoff chronology and daily weighting contracts."""
import unittest
import pandas as pd
from research_data import build_daily, latest_quote, weekly_series, cutoff_from


def api(day, ask=100, bid=90):
    return {'time': int(pd.Timestamp(day+'T12:00:00Z').timestamp()), 'sell_offer': ask, 'buy_offer': bid}

def cap(day, ask=120, bid=110):
    return {'world': 'Test', 'capturedAt': day+'T23:00:00', 'sell': ask, 'buy': bid, 'hash': day}


class ResearchDataTests(unittest.TestCase):
    def test_capture_fills_gap_without_replacing_api_or_weighting_same_day(self):
        d, q = build_daily([api('2026-09-23')], [cap('2026-09-23'),cap('2026-09-24'),cap('2026-09-24',130,120)], pd.Timestamp('2026-09-24'))
        self.assertEqual(d.loc['2026-09-23','ask'],100)
        self.assertEqual(d.loc['2026-09-24','ask'],125)
        self.assertEqual(q['captureDaysAdded'],1)

    def test_future_rows_never_enter_daily_or_anchor(self):
        cutoff=pd.Timestamp('2026-09-24'); caps=[cap('2026-09-23'),cap('2026-09-25')]
        d,q=build_daily([api('2026-09-24'),api('2026-09-26')],caps,cutoff)
        anchor=latest_quote('Test',d,caps,cutoff)
        self.assertEqual(anchor['date'],'2026-09-24')
        self.assertEqual(anchor['source'],'Histórico de ofertas')
        self.assertEqual(q['afterCutoff'],1)

    def test_latest_capture_wins_same_day_but_not_newer_api(self):
        d,_=build_daily([api('2026-09-23')],[cap('2026-09-23')],pd.Timestamp('2026-09-23'))
        self.assertEqual(latest_quote('Test',d,[cap('2026-09-23')],pd.Timestamp('2026-09-23'))['ask'],120)

    def test_invalid_and_future_dates_do_not_advance_cutoff(self):
        self.assertEqual(cutoff_from([api('2026-09-25'),api('2026-10-01')],[cap('2026-09-27'),cap('2026-09-28',10,20)],today='2026-09-27'),pd.Timestamp('2026-09-27'))

    def test_server_day_boundary_and_capture_calendar_are_distinct(self):
        r=api('2026-09-24')
        r['time']=int(pd.Timestamp('2026-09-24T07:00:00Z').timestamp())  # 09:00 Berlin
        d,_=build_daily([r],[cap('2026-09-24')],pd.Timestamp('2026-09-24'))
        self.assertEqual(d.loc['2026-09-23','ask'],100)
        self.assertEqual(d.loc['2026-09-24','ask'],120)

    def test_partial_week_is_not_published_as_future_observation(self):
        d,_=build_daily([api('2026-09-20'),api('2026-09-23')],[],pd.Timestamp('2026-09-23'))
        weekly=weekly_series(d,pd.Timestamp('2026-09-23'))
        self.assertEqual(list(weekly.index),[pd.Timestamp('2026-09-20')])

if __name__=='__main__': unittest.main()
