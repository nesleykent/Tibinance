"""Anti-leakage and matched-sample checks for exploratory lifecycle models."""
import unittest
import pandas as pd
import numpy as np
from lifecycle import point, horizon_returns, donor_change, summarize, precursor_prior, mark_crossed, age_predictions

class LifecycleTests(unittest.TestCase):
    def test_point_never_uses_future_and_bounds_staleness(self):
        s=pd.Series([10.,999.],index=pd.to_datetime(['2026-01-01','2026-01-03']))
        self.assertEqual(point(s,pd.Timestamp('2026-01-02'))[1],10.)
        self.assertIsNone(point(s,pd.Timestamp('2026-01-10')))
    def test_horizon_returns_cutoff_excludes_future(self):
        s=pd.Series(np.arange(40.)/100,index=pd.date_range('2026-01-01',periods=40))
        a=horizon_returns(s,pd.Timestamp('2026-01-20'),1)
        s.loc[pd.Timestamp('2026-01-21'):]=999.
        self.assertEqual(a,horizon_returns(s,pd.Timestamp('2026-01-20'),1))
    def test_age_donor_known_and_before_transfer(self):
        birth=pd.Timestamp('2025-01-01');s=pd.Series(np.arange(100.)/100,index=pd.date_range(birth,periods=100))
        self.assertIsNotNone(donor_change(s,birth,10,1,pd.Timestamp('2025-02-01'),pd.Timestamp('2025-02-01')))
        self.assertIsNone(donor_change(s,birth,10,4,pd.Timestamp('2025-01-30'),pd.Timestamp('2026-01-01')))
        self.assertIsNone(donor_change(s,birth,10,4,pd.Timestamp('2026-01-01'),pd.Timestamp('2025-02-01')))
    def test_age_endpoints_must_be_distinct_observations(self):
        birth=pd.Timestamp('2025-01-01')
        s=pd.Series([1.],index=[birth+pd.Timedelta(days=10)])
        self.assertIsNone(donor_change(s,birth,10,1,pd.Timestamp('2025-02-01'),pd.Timestamp('2025-02-01')))
    def test_predecessor_prior_uses_changes_not_level_splice(self):
        ix=pd.date_range('2025-01-01',periods=70)
        a=pd.Series(np.arange(70.)/100,index=ix)
        b=pd.Series(np.arange(70.)/200+10,index=ix)
        p,n=precursor_prior({'a':a,'b':b},pd.Timestamp('2025-04-01'),2,pd.Timestamp('2025-03-01'))
        q,m=precursor_prior({'a':a+50,'b':b-100},pd.Timestamp('2025-04-01'),2,pd.Timestamp('2025-03-01'))
        self.assertAlmostEqual(p,q);self.assertEqual(n,m)
    def test_predecessor_prior_excludes_merge_and_later(self):
        ix=pd.date_range('2025-01-01',periods=100)
        a=pd.Series(np.arange(100.)/100,index=ix)
        merge=pd.Timestamp('2025-03-01')
        expected=precursor_prior({'a':a},pd.Timestamp('2025-04-01'),2,merge)
        a.loc[merge:]=999.
        self.assertEqual(expected,precursor_prior({'a':a},pd.Timestamp('2025-04-01'),2,merge))
    def test_summary_reports_incremental_local_gain_on_same_origins(self):
        rows=[dict(side='ask',horizon=1,origin='2026-01-01',model=m,ape=e,ae=e) for m,e in [('Constant',20),('Benchmark',10),('Local',8),('Precursor',6)]]
        prior=next(r for r in summarize(rows) if r['model']=='Precursor')
        self.assertEqual(prior['gainVsLocalPct'],25.)
    def test_independent_sides_flag_crossing_without_adjusting_prices(self):
        rows=[dict(side='ask',horizon=1,model='AgeRaw',value=10.),dict(side='bid',horizon=1,model='AgeRaw',value=11.)]
        mark_crossed(rows)
        self.assertTrue(all(r['crossedBook'] for r in rows))
        self.assertEqual([r['value'] for r in rows],[10.,11.])
    def test_missing_donor_never_disables_constant_or_benchmark(self):
        predictions=age_predictions(100.,np.log(1.1),None,None)
        self.assertEqual(predictions['Constant'],100.)
        self.assertAlmostEqual(predictions['Benchmark'],110.)
        self.assertIsNone(predictions['AgeRelative'])
        self.assertIsNone(predictions['AgeRaw'])
    def test_raw_donor_does_not_require_same_day_premium(self):
        predictions=age_predictions(100.,None,None,{'change':np.log(1.2)})
        self.assertAlmostEqual(predictions['AgeRaw'],120.)
        self.assertIsNone(predictions['AgeRelative'])
    def test_summary_rejects_unmatched_candidates(self):
        rows=[dict(side='ask',horizon=1,origin='2026-01-01',model='Constant',ape=1,ae=1),dict(side='ask',horizon=1,origin='2026-01-08',model='Other',ape=1,ae=1)]
        with self.assertRaises(ValueError):summarize(rows)

if __name__=='__main__':unittest.main()
