import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from reprocess_market import main, scan_file, safe_result, write_outputs, capture_order
from website_pipeline import WebsitePipeline


class WebsitePipelineTests(unittest.TestCase):
    def test_runtime_retry_preserves_other_review_checkpoints_in_chronological_stream(self):
        import contextlib
        import hashlib
        import io
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d)/'raw';folder.mkdir();output=Path(d)/'output';output.mkdir()
            files=[folder/'2026-10-02_003637100_Synthetic Character_Hotkey.png',
                   folder/'2026-10-02_003636099_Synthetic Character_Hotkey.png']
            for i,file in enumerate(files):file.write_bytes(str(i).encode())
            hashes=[hashlib.sha256(file.read_bytes()).hexdigest() for file in files]
            with WebsitePipeline() as bridge:version=bridge.version
            prior=[{'hash':h,'status':'needs_review','processingVersion':version,'issues':[],'offers':[],
                    'stages':{'filename':True},'attemptedStages':['filename']} for h in hashes]
            prior[1]['runtimeFault']='browser_closed'
            (output/'backfill-results.json').write_text(json.dumps(prior))
            seen=[]
            class LocalPipeline:
                def __init__(self):
                    self.bridge=WebsitePipeline();self.version=self.bridge.version;self.stages=self.bridge.stages
                    self.capture_time_zone=self.bridge.capture_time_zone
                def __enter__(self):return self
                def __exit__(self,*_):self.bridge.close()
                def eligible(self,files):return self.bridge.eligible(files)
                def capture_times(self,files):return self.bridge.capture_times(files)
                def ingest(self,file,context=None,correction=None,reprocess=True):
                    if not reprocess:return self.bridge.ingest(file,context,reprocess=False)
                    seen.append(file)
                    return {'status':'excluded_market','stages':{'filename':True,'deduplication':True,'market':False},
                            'attemptedStages':['filename','deduplication','market'],'offers':[],'issues':[]}
            with patch('reprocess_market.WebsitePipeline',LocalPipeline),patch('sys.argv',['reprocess_market.py',str(folder),'--output',str(output),'--resume','--retry-runtime']),contextlib.redirect_stdout(io.StringIO()):main()
            self.assertEqual(seen,[files[1]])
            audit=json.loads((output/'backfill-results.json').read_text())
            self.assertEqual([(r['hash'],r['status']) for r in audit],[(hashes[1],'excluded_market'),(hashes[0],'needs_review')])
            self.assertEqual(json.loads((output/'summary.json').read_text())['reusedCheckpoints'],1)

    def test_shared_filename_clocks_order_all_fractional_digits(self):
        names=[Path(f'2026-10-02_{t}_Synthetic Character_Hotkey.png') for t in
               ('0036371','0036370999999999','0036371000000001','003637')]
        with WebsitePipeline() as pipeline:
            times=pipeline.capture_times(names)
            self.assertEqual(times[2],'2026-10-02T00:36:37.1000000001')
            self.assertEqual(pipeline.capture_times([Path('2026-02-30_000000000_Synthetic Character_Hotkey.png')]),[None])
        self.assertEqual(sorted(range(4),key=lambda i:capture_order(times[i])),[3,1,0,2])

    def test_batch_stream_interleaves_views_by_full_filename_clock_and_deduplicates(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d)/'raw';folder.mkdir();output=Path(d)/'output'
            specs=[('0036371000000001','offers',b'late'),('0036371','statistics',b'middle'),
                   ('0036370999999999','offers',b'early'),('003638','offers',b'early')]
            expected=['2026-10-02T00:36:37.0999999999','2026-10-02T00:36:37.1','2026-10-02T00:36:37.1000000001']
            for clock,view,payload in specs:
                (folder/f'2026-10-02_{clock}_Synthetic Character_Hotkey.png').write_bytes(payload)
            seen=[]
            class LocalPipeline:
                def __init__(self):
                    self.bridge=WebsitePipeline();self.version=self.bridge.version;self.stages=self.bridge.stages
                    self.capture_time_zone=self.bridge.capture_time_zone
                def __enter__(self):return self
                def __exit__(self,*_):self.bridge.close()
                def eligible(self,files):return self.bridge.eligible(files)
                def capture_times(self,files):return self.bridge.capture_times(files)
                def ingest(self,file,context=None,correction=None,reprocess=True):
                    if not reprocess:return self.bridge.ingest(file,context,reprocess=False)
                    captured=self.capture_times([file])[0];seen.append(captured)
                    return {'status':'needs_review','capturedAt':captured,'viewType':'statistics' if file.read_bytes()==b'middle' else 'offers',
                            'stages':{'filename':True,'deduplication':True},'attemptedStages':['filename','deduplication'],
                            'offers':[],'issues':[]}
            with patch('reprocess_market.WebsitePipeline',LocalPipeline),patch('sys.argv',['reprocess_market.py',str(folder),'--output',str(output)]),contextlib.redirect_stdout(io.StringIO()):main()
            self.assertEqual(seen,expected)
            summary=json.loads((output/'summary.json').read_text())
            self.assertEqual(summary['duplicateScreenshots'],1)
            self.assertEqual(summary['filenameEligible'],4)
            audit=json.loads((output/'backfill-results.json').read_text())
            self.assertEqual([r['viewType'] for r in audit],['offers','statistics','offers'])
            self.assertEqual(len(json.loads((output/'processing-order.json').read_text())),4)

    def test_python_runs_the_actual_website_filename_gate(self):
        with WebsitePipeline() as pipeline:
            source = lambda kind: Path('_'.join(['2026-10-01', '120000123', 'Synthetic Character', kind]) + '.webp')
            self.assertEqual(pipeline.eligible([source(k) for k in ('Hotkey', 'Death', 'LevelUp', 'hotkey')]),
                             [True, False, False, False])
            self.assertEqual(pipeline.stages[:2], ['filename', 'deduplication'])
            self.assertGreater(pipeline.version, 4)

    def test_transport_returns_only_anonymous_website_decisions(self):
        class FakePipeline:
            version = 5
            def ingest(self, file, context, correction):
                return {'status': 'needs_review', 'stages': {'filename': True, 'world': True},
                        'world': {'world': 'Antica', 'type': 'Open PvP', 'battleye': 'Yellow'},
                        'capturedAt': '2026-10-01T12:00:00',
                        'itemVerification': {'status': 'tibia_coins', 'text': 'private marker'},
                        'sourceFiles': ['private marker'], 'rows': {'sell': [], 'buy': []},
                        'issues': [{'field': 'row', 'reason': 'private marker'}]}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'opaque-source'; p.write_bytes(b'opaque image')
            result = scan_file(p, {}, FakePipeline(), {})
            self.assertEqual(result['world'], 'Antica')
            self.assertNotIn('private marker', json.dumps(result))
            self.assertEqual(result['context']['world'], 'Antica')

    def test_duplicate_preflight_uses_website_sha_without_browser_or_image_decode(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / ('_'.join(['2026-10-01', '120000123', 'Synthetic Character', 'Hotkey']) + '.webp')
            p.write_bytes(b'not an image')
            with WebsitePipeline() as pipeline:
                result = pipeline.ingest(p, {'hash': 'existing'}, reprocess=False)
            self.assertEqual(result['status'], 'duplicate')
            self.assertEqual(result['attemptedStages'], ['filename', 'deduplication'])
            self.assertEqual(result['hash'], hashlib.sha256(b'not an image').hexdigest())

    def test_runtime_interruption_after_world_does_not_require_lost_context(self):
        class FailedPipeline:
            version = 5
            def ingest(self, *_):
                return {'status': 'needs_review', 'runtimeFault': 'browser_closed',
                        'stages': {'world': True}, 'offers': [], 'issues': []}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'opaque-source'; p.write_bytes(b'opaque image')
            result = scan_file(p, {}, FailedPipeline(), {})
            self.assertEqual(result['status'], 'needs_review')
            self.assertNotIn('context', result)

    def test_current_checkpoint_executes_duplicate_gate_and_stops_before_market(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d) / 'inputs'; folder.mkdir()
            output = Path(d) / 'output'; output.mkdir()
            p = folder / ('_'.join(['2026-10-01', '120000123', 'Synthetic Character', 'Hotkey']) + '.webp')
            p.write_bytes(b'not an image')
            h = hashlib.sha256(b'not an image').hexdigest()
            checkpoint = {'hash': h, 'status': 'excluded_market', 'processingVersion': 6,
                          'stages': {'filename': True, 'deduplication': True, 'market': False},
                          'attemptedStages': ['filename', 'deduplication', 'market'], 'offers': [], 'issues': []}
            (output / 'backfill-results.json').write_text(json.dumps([checkpoint]))
            argv = ['reprocess_market.py', str(folder), '--output', str(output), '--resume']
            with patch('sys.argv', argv), contextlib.redirect_stdout(io.StringIO()):
                main()
            summary = json.loads((output / 'summary.json').read_text())
            self.assertEqual(summary['reusedCheckpoints'], 1)
            self.assertEqual(summary['stageCounts']['deduplication'], {'entered': 1, 'passed': 0})
            self.assertEqual(summary['stageCounts']['market'], {'entered': 0, 'passed': 0})
            self.assertEqual(summary['stageCounts']['world'], {'entered': 0, 'passed': 0})
            self.assertEqual(summary['stageCounts']['extraction'], {'entered': 0, 'passed': 0})

    def test_batch_filters_before_reading_bytes_and_invalidates_old_checkpoints(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d) / 'inputs'; folder.mkdir()
            output = Path(d) / 'output'; output.mkdir()
            build = lambda kind: folder / ('_'.join(['2026-10-01', '120000123', 'Synthetic Character', kind]) + '.webp')
            accepted, rejected = build('Hotkey'), build('Death')
            accepted.write_bytes(b'eligible image'); rejected.write_bytes(b'ineligible image')
            h = hashlib.sha256(b'eligible image').hexdigest()
            (output / 'backfill-results.json').write_text(json.dumps([{'hash': h, 'status': 'ready', 'processingVersion': 4}]))
            entered = []
            class LocalPipeline:
                def __init__(self):
                    self.bridge = WebsitePipeline()
                    self.version, self.stages = self.bridge.version, self.bridge.stages
                    self.capture_time_zone = self.bridge.capture_time_zone
                def __enter__(self): return self
                def __exit__(self, *_): self.bridge.close()
                def eligible(self, files): return self.bridge.eligible(files)
                def capture_times(self, files): return self.bridge.capture_times(files)
                def ingest(self, file, context, correction):
                    entered.append(file == accepted)
                    return {'status': 'excluded_market', 'stages': {'filename': True, 'deduplication': True, 'market': False},
                            'attemptedStages': ['filename', 'deduplication', 'market'], 'issues': [], 'offers': []}
            original_read = Path.read_bytes
            def guarded_read(path):
                if path == rejected: raise AssertionError('Ineligible image bytes were read')
                return original_read(path)
            argv = ['reprocess_market.py', str(folder), '--output', str(output), '--resume']
            with patch('reprocess_market.WebsitePipeline', LocalPipeline), patch('sys.argv', argv), \
                 patch.object(Path, 'read_bytes', guarded_read), contextlib.redirect_stdout(io.StringIO()):
                main()
            self.assertEqual(entered, [True])
            summary = json.loads((output / 'summary.json').read_text())
            self.assertEqual(summary['filenameEligible'], 1)
            self.assertEqual(summary['filenameRejected'], 1)
            self.assertEqual(summary['stageCounts']['market'], {'entered': 1, 'passed': 0})
            self.assertEqual(summary['reusedCheckpoints'], 0)
            self.assertEqual(json.loads((output / 'captures-extracted.json').read_text()), [])

    def test_unvalidated_results_cannot_be_exported_as_canonical_captures(self):
        bad = {'hash': 'opaque', 'status': 'ready', 'world': 'Antica',
               'capture': {'hash': 'opaque', 'world': 'Antica', 'offers': []}, 'stages': {'validation': False}}
        with tempfile.TemporaryDirectory() as d:
            write_outputs(Path(d), [], [bad], True)
            self.assertEqual(json.loads((Path(d) / 'captures-extracted.json').read_text()), [])

    def test_runtime_failure_is_review_evidence_without_private_diagnostics(self):
        result = safe_result({'hash': 'opaque', 'status': 'needs_review', 'runtimeFault': 'browser_closed',
                              'error': 'private marker', 'issues': [{'field': 'market', 'reason': 'private marker'}]})
        self.assertEqual(result['runtimeFault'], 'browser_closed')
        self.assertNotIn('private marker', json.dumps(result))

    def test_argument_errors_do_not_echo_private_input(self):
        import contextlib
        import io
        error = io.StringIO()
        with patch('sys.argv', ['reprocess_market.py', '--unknown', 'private marker']), contextlib.redirect_stderr(error):
            with self.assertRaises(SystemExit): main()
        self.assertNotIn('private marker', error.getvalue())


if __name__ == '__main__':
    unittest.main()
