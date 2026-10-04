from pathlib import Path
import json
import unittest
import market_update as market
import prepare_site
import tempfile
from unittest.mock import patch


class StatisticsDatasetTests(unittest.TestCase):
    def fixture(self):
        return {'world':'Antica','type':'Open PvP','battleye':'Yellow','hash':'statistics-fixture',
                'viewType':'statistics','processingVersion':6,'capturedAt':'2026-10-02T00:36:37.332',
                'captureDate':'2026-10-02','captureTimeZone':'America/Sao_Paulo',
                'capturedAtUtc':'2026-10-02T03:36:37.332Z','statisticsReferenceDate':'2026-10-01',
                'statistics30d':{'buy':{'transactions':3396,'highestPrice':49985,'averagePrice':44155,'lowestPrice':1,'tcVolume':84900},
                                'sell':{'transactions':6082,'highestPrice':49998,'averagePrice':45942,'lowestPrice':44000,'tcVolume':152050}}}

    def test_publication_omits_legacy_derived_fields_without_mutating_input(self):
        row = self.fixture()
        result = market.publication_rows([row])[0]
        self.assertEqual(result['statistics30d']['buy']['transactions'], 3396)
        self.assertNotIn('tcVolume', result['statistics30d']['buy'])
        self.assertIn('tcVolume', row['statistics30d']['buy'])
        self.assertEqual({k:v for k,v in result.items() if k != 'statistics30d'},
                         {k:v for k,v in row.items() if k != 'statistics30d'})

    def test_old_and_new_market_update_records_share_one_dataset(self):
        old = json.loads(market.OUTPUT_FILE.read_text())
        self.assertEqual(market.validate(old + [self.fixture()]), market.validate(old))
        self.assertEqual(market.validate([self.fixture()]), ['Antica'])
        legacy={k:old[0][k] for k in ('world','type','battleye','hash','capturedAt','sell','buy','sellVolume','buyVolume')}
        self.assertEqual(market.validate([legacy]),[legacy['world']])
        legacy['offers']=[{'side':'sell','rowIndex':0,'amount':25,'price':50000,'total':1250000,'endsAt':'2026-10-25T12:00:00'}]
        self.assertEqual(market.validate([legacy]),[legacy['world']])

    def test_offers_use_local_expiries_without_a_statistics_reference_date(self):
        row=self.fixture(); del row['statistics30d']; del row['statisticsReferenceDate']
        row.update(viewType='offers',sell=50000,buy=49000,sellVolume=25,buyVolume=25,
                   offers=[{'side':'sell','rowIndex':0,'amount':25,'price':50000,'total':1250000,
                            'endsAt':'2026-10-25T12:00:00','endsAtUtc':'2026-10-25T15:00:00.000Z'}])
        market.validate([row])
        row['offers'][0]['endsAtUtc']='2026-10-25T11:00:00.000Z' # Incorrect CET interpretation.
        with self.assertRaises(AssertionError): market.validate([row])
        row['offers'][0]['endsAtUtc']='2026-10-25T15:00:00.000Z'
        row['statisticsReferenceDate']='2026-10-01'
        with self.assertRaises(AssertionError): market.validate([row])

    def test_raw_counter_temporal_and_each_side_failures_are_rejected(self):
        for key in ['buy','sell']:
            row = self.fixture()
            row['statistics30d'][key]['transactions'] = -1
            with self.assertRaises(AssertionError): market.validate([row])
        for key,value in [('capturedAtUtc','2026-10-02T00:36:37.332Z'),
                          ('statisticsReferenceDate','2026-10-02'),('captureDate','2026-10-01')]:
            row = self.fixture(); row[key]=value
            with self.assertRaises(AssertionError): market.validate([row])
        row=self.fixture(); del row['statistics30d']['buy']['tcVolume']
        market.validate([row]) # Legacy derived fields are optional and ignored.
        row=self.fixture();row['capturedAtUtc']=None
        with self.assertRaises(AssertionError):market.validate([row])
        row=self.fixture(); del row['statistics30d']['buy']['averagePrice']
        with self.assertRaises(AssertionError):market.validate([row])

    def test_packaged_report_contains_the_shared_statistics_runtime_and_export(self):
        with tempfile.TemporaryDirectory() as d:
            output=Path(d)
            with patch.object(prepare_site,'OUTPUT',output), patch.object(prepare_site,'REPORT',output/'reports'/'tc-cycle'):
                prepare_site.main()
            for shared in ('js/statistics.js','js/site-header.js','css/site-header.css'):
                self.assertEqual((output/shared).read_text(),(market.ROOT.parents[1]/shared).read_text())
            self.assertTrue((output/'reports'/'tc-cycle'/'export.js').exists())

    def test_no_live_order_book_required_or_applied_to_statistics(self):
        row=self.fixture();row['statistics30d']['buy']['averagePrice']=48000
        self.assertGreater(row['statistics30d']['buy']['averagePrice'],row['statistics30d']['sell']['averagePrice'])
        market.validate([row])


if __name__ == '__main__':unittest.main()
