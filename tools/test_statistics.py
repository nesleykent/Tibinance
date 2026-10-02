import json
import os
import tempfile
import unittest
from pathlib import Path
from website_pipeline import WebsitePipeline
from reprocess_market import safe_capture, safe_result, write_outputs

TEXT = '''Statistics:
Buy Offers:
Number of Transactions: 3396
Highest Price: 49,985 gold
Average Price: 44,155 gold
Lowest Price: 1 gold
Sell Offers:
Number of Transactions: 6082
Highest Price: 49,998 gold
Average Price: 45,942 gold
Lowest Price: 44,000 gold'''


class StatisticsParityTests(unittest.TestCase):
    def test_batch_preserves_extraction_specific_reason_without_private_ocr_errors(self):
        entry = {'status':'needs_review', 'viewType':'statistics', 'stages':{'statistics':False},
                 'issues':[{'field':'statistics30d.buy','reason':'private OCR exception'}]}
        safe = safe_result(entry)
        self.assertIn('Statistics extraction incomplete', safe['issues'][0]['reason'])
        self.assertNotIn('private OCR exception', json.dumps(safe))
        entry['stages']['statistics'] = True
        self.assertEqual(safe_result(entry)['issues'][0]['reason'], 'Validation requires review')

    def test_python_transport_executes_shared_statistics_and_dst_rules(self):
        with WebsitePipeline() as pipeline:
            self.assertIn('view', pipeline.stages)
            self.assertIn('statistics', pipeline.stages)
            self.assertEqual(pipeline.capture_time_zone,
                             pipeline.call({'op': 'contract'})['localTimeZone'])
            result = pipeline.call({'op': 'statistics-contract', 'text': TEXT,
                                    'capturedAt': '2026-10-02T00:36:37.332',
                                    'captureTimeZone': 'America/Sao_Paulo'})
            self.assertEqual(result['statistics30d']['buy']['transactions'], 3396)
            self.assertEqual(result['statistics30d']['sell']['averagePrice'], 45942)
            self.assertEqual(result['statisticsReferenceDate'], '2026-10-01')
            self.assertEqual(result['issues'], [])
            bad = pipeline.call({'op': 'statistics-contract', 'text': TEXT.replace('3396', '3O96'),
                                 'capturedAt': '2026-10-25T02:30:00', 'captureTimeZone': 'Europe/Berlin'})
            self.assertEqual(bad['issues'][0]['field'], 'statistics30d.buy')
            self.assertIsNone(bad['statisticsReferenceDate'])

    def test_nested_statistics_privacy_and_batch_exports(self):
        values = {'transactions': 4, 'tcVolume': 100, 'highestPrice': 50000,
                  'averagePrice': 45000, 'lowestPrice': 40000, 'private': 'private marker'}
        capture = {'hash': 'opaque', 'world': 'Antica', 'viewType': 'statistics',
                   'capturedAt': '2026-10-02T00:36:37.332', 'processingVersion': 6,
                   'statistics30d': {'buy': values, 'sell': values, 'private': 'private marker'}}
        entry = {'hash': 'opaque', 'world': 'Antica', 'status': 'ready', 'processingVersion': 6,
                 'capture': capture, 'statistics30d': capture['statistics30d'],
                 'stages': {'statistics': True, 'validation': True}, 'offers': []}
        self.assertNotIn('private marker', json.dumps(safe_capture(capture)))
        with tempfile.TemporaryDirectory() as d:
            output = Path(d)
            write_outputs(output, [], [entry])
            saved = json.loads((output / 'captures-extracted.json').read_text())[0]
            self.assertEqual(saved['statistics30d']['buy']['tcVolume'], 100)
            self.assertNotIn('offers', saved)
            self.assertNotIn('private marker', json.dumps(saved))
            entry['status'] = 'needs_review'
            entry['stages']['validation'] = False
            write_outputs(output, [], [entry])
            self.assertEqual(json.loads((output / 'captures-extracted.json').read_text()), [])
            corrections = json.loads((output / 'review-corrections.json').read_text())[0]
            self.assertEqual(corrections['statistics30d']['sell']['transactions'], 4)

    def test_batch_preserves_local_and_resolved_offer_expiries(self):
        import subprocess
        capture = {'world':'Antica','type':'Open PvP','battleye':'Yellow','hash':'offers-fixture',
                   'viewType':'offers','processingVersion':6,'capturedAt':'2026-10-02T00:36:34.078',
                   'captureDate':'2026-10-02','captureTimeZone':'America/Sao_Paulo',
                   'capturedAtUtc':'2026-10-02T03:36:34.078Z',
                   'sell':50000,'buy':49000,'sellVolume':25,'buyVolume':25,
                   'sellTopAmount':25,'buyTopAmount':25,'goldDemand':1250000,'goldSupply':1225000}
        offers=[{'side':side,'rowIndex':0,'amount':25,'price':price,'total':25*price,
                 'endsAt':'2026-10-25T12:00:00','endsAtUtc':'2026-10-25T15:00:00.000Z'}
                for side,price in [('sell',50000),('buy',49000)]]
        entry={'hash':capture['hash'],'world':'Antica','status':'ready','processingVersion':6,
               'stages':{'validation':True},'itemVerification':{'status':'tibia_coins'},
               'capture':capture,'offers':offers}
        with tempfile.TemporaryDirectory() as d:
            output=Path(d);write_outputs(output,[],[entry])
            subprocess.run([os.environ.get('TIBINANCE_NODE','node'),str(Path(__file__).with_name('finalize_backfill.mjs')),d],
                           check=True,capture_output=True)
            saved=json.loads((output/'observations-enriched.json').read_text())[0]
            self.assertEqual(saved['offers'][0]['endsAt'],offers[0]['endsAt'])
            self.assertEqual(saved['offers'][0]['endsAtUtc'],offers[0]['endsAtUtc'])
            self.assertEqual(saved['capturedAtUtc'],capture['capturedAtUtc'])
            self.assertNotIn('statisticsReferenceDate',saved)
            self.assertIn('endsAtUtc',(output/'offer-observations.csv').read_text())

    @unittest.skipUnless(os.environ.get('TIBINANCE_STATISTICS_SAMPLE'), 'optional real screenshot')
    def test_real_python_details_flow(self):
        import hashlib
        file = Path(os.environ['TIBINANCE_STATISTICS_SAMPLE'])
        context = {'world': 'Antica', 'type': 'Open PvP', 'battleye': 'Yellow',
                   'hash': hashlib.sha256(file.read_bytes()).hexdigest(),
                   'capturedAt': '2026-10-02T00:36:37.332', 'captureTimeZone': 'America/Sao_Paulo'}
        with WebsitePipeline() as pipeline:
            result = pipeline.ingest(file, context)
        self.assertEqual(result['status'], 'ready', result.get('issues'))
        capture = result['capture']
        self.assertEqual(capture['viewType'], 'statistics')
        self.assertEqual(capture['capturedAtUtc'], '2026-10-02T03:36:37.332Z')
        self.assertEqual(capture['statistics30d']['buy']['tcVolume'], 84900)
        self.assertEqual(capture['statistics30d']['sell']['tcVolume'], 152050)
        self.assertNotIn('extraction', result['attemptedStages'])
        self.assertNotIn(file.name, json.dumps(safe_result(result)))
        # Export/finalization uses the same persistent website record contract.
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            output = Path(d)
            clean = dict(result, hash=context['hash'], world='Antica')
            write_outputs(output, [], [clean])
            subprocess.run([os.environ.get('TIBINANCE_NODE', 'node'), str(Path(__file__).with_name('finalize_backfill.mjs')), d],
                           check=True, capture_output=True)
            saved = json.loads((output / 'observations-enriched.json').read_text())[0]
            self.assertEqual(saved, capture)
            self.assertIn('30d buy tcVolume (TC)', (output / 'observations.csv').read_text())


if __name__ == '__main__':
    unittest.main()
