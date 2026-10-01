"""Arithmetic, calendar gaps, coverage and synthetic decomposition checks."""
import hashlib
import json
import math
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
from inflation import ROOT, ASOF, monthly, annual, decompose, build

class InflationTests(unittest.TestCase):
    @patch('inflation.ASOF', pd.Timestamp('2026-09-23'))
    def test_calendar_gaps_and_partial_month(self):
        dates = pd.date_range('2025-01-01', '2026-09-23')
        d = pd.DataFrame({'ask':100., 'bid':90.}, index=dates)
        d = d[~((d.index.year==2025)&(d.index.month==2))]
        lookup = {r['date']:r for r in monthly(d, 'Synthetic') if r['side']=='ask'}
        self.assertIsNone(lookup['2025-03-01']['momPct'])
        self.assertEqual(lookup['2026-01-01']['yoyPct'],0)
        self.assertIsNone(lookup['2026-02-01']['yoyPct'])
        self.assertFalse(lookup['2026-09-01']['eligible'])
        self.assertIsNone(lookup['2026-09-01']['momPct'])
        self.assertIsNone(lookup['2026-09-01']['observed']['momPct'])

    def test_sparse_coverage(self):
        dates = pd.date_range('2025-01-01', periods=15)
        d = pd.DataFrame({'ask':np.arange(15)+100.,'bid':np.arange(15)+90.},index=dates)
        row = next(r for r in monthly(d,'Synthetic') if r['date']=='2025-01-01' and r['side']=='ask')
        self.assertEqual(row['price'],107)
        self.assertFalse(row['eligible'])

    def test_sparse_observed_rates_preserve_gaps_and_qualified_series(self):
        dates = pd.to_datetime(['2024-12-05','2024-12-20','2025-01-05','2025-01-20',
                                '2025-03-05','2025-12-05','2025-12-20'])
        d = pd.DataFrame({'ask':[100,100,110,110,120,125,125],
                          'bid':[90,90,99,99,108,112.5,112.5]}, index=dates)
        rows = monthly(d, 'Sparse')
        lookup = {(r['date'], r['side']):r for r in rows}
        for side in ['ask','bid']:
            jan = lookup['2025-01-01',side]
            self.assertIsNone(jan['momPct'])
            self.assertAlmostEqual(jan['observed']['momPct'],10)
            self.assertIsNone(lookup['2025-03-01',side]['observed']['momPct'])
            self.assertAlmostEqual(lookup['2025-12-01',side]['observed']['yoyPct'],25)
            year = next(r for r in annual(rows) if r['year']==2025 and r['side']==side)
            self.assertIsNone(year['endVsDecemberPct'])
            self.assertAlmostEqual(year['observed']['endVsDecemberPct'],25)
            self.assertIsNone(year['observed']['meanPrice'])

    def test_known_trend_seasonality(self):
        rows=[]
        for i,date in enumerate(pd.date_range('2023-01-01','2026-08-01',freq='MS')):
            seasonal=.1*math.sin(2*math.pi*(date.month-1)/12)
            rows.append(dict(side='ask',date=str(date.date()),price=100*math.exp(.12*i/12+seasonal),eligible=True))
        m=decompose(rows,'ask','2023-01-01')
        self.assertAlmostEqual(m['annualTrendPct'],100*math.expm1(.12),10)
        self.assertLess(max(abs(p['residualLog']) for p in m['points']),1e-12)

    def test_saved_arithmetic_provenance_reproduction(self):
        out=json.loads((ROOT/'inflation.json').read_text())
        self.assertEqual(out,build())
        for s in out['sources']:
            self.assertEqual(s['sha256'],hashlib.sha256((ROOT/s['file']).read_bytes()).hexdigest())
        lookup={(r['world'],r['side'],r['date']):r for r in out['monthly']}
        for r in out['monthly']:
            for key,n in [('momPct',1),('yoyPct',12)]:
                prev=lookup.get((r['world'],r['side'],str((pd.Timestamp(r['date'])-pd.DateOffset(months=n)).date())))
                if r['eligible'] and prev and prev['eligible']:
                    self.assertAlmostEqual(r[key],100*(r['price']/prev['price']-1),10)
                else:self.assertIsNone(r[key])
        for r in out['annual']:
            if r['endVsDecemberPct'] is not None:self.assertAlmostEqual(r['endVsDecemberPct'],100*(r['endPrice']/r['decemberPrice']-1),10)
            if r['year']==2023:self.assertIsNone(r['endVsDecemberPct'])
            if r['year']==ASOF.year:self.assertEqual(r['endMonth'],(ASOF.replace(day=1)-pd.Timedelta(days=1)).month)
        for m in out['models']:
            for a in m['attribution']:
                self.assertAlmostEqual(a['totalLogPoints'],sum(a[k+'LogPoints'] for k in ['trend','seasonal','residual']),10)
        self.assertEqual(lookup['Antica','ask','2023-01-01']['price'],29392.5)
        self.assertEqual(lookup['Antica','bid','2023-01-01']['price'],29135.5)
        for c in out['comparison']:self.assertEqual(c['date'],out['comparisonMonth'])

if __name__=='__main__':unittest.main()
