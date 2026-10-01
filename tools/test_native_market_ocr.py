import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from native_market_ocr import parse_table, merge_rows, needs_fallback, numeric_valid
from reprocess_market import validate_capture, apply_corrections, scan_file, write_outputs, main, verify_existing_item, restore_capture_context

TABLE={'top':100,'stop':200,'glyph':10,'nameX':0,'x0':190,'amountR':250,'pieceR':350,'totalR':450}

def word(text,right,left=None,cy=130,conf=95):
    return {'t':text,'x':right-30 if left is None else left,'r':right,'y':cy-5,'b':cy+5,'h':10,'cx':right-15,'cy':cy,'conf':conf}

def tokens():
    return [word('100',250),word('50000',350),word('5000000',450),word('2026-10-31,',560,left=460),word('01:28:54',640,left=570)]

class NativeOCRTests(unittest.TestCase):
    def test_added_context_reuses_cells_but_checks_the_new_baseline(self):
        offers=[dict(amount=100,price=50000,total=5000000,endsAt='2026-10-31T01:28:54',side='sell',rowIndex=0),
                dict(amount=100,price=40000,total=4000000,endsAt='2026-10-31T01:28:54',side='buy',rowIndex=0)]
        previous={'world':None,'capturedAt':None,'offers':offers,'issues':[{'field':'world','reason':'Unknown'}]}
        capture={'world':'Antica','capturedAt':'2026-10-01T12:00:00','sellVolume':100}
        self.assertEqual(restore_capture_context(previous,capture)['status'],'ready')
        self.assertEqual(previous['world'],None)
        result=restore_capture_context(previous,capture|{'sellVolume':200})
        self.assertEqual(result['status'],'needs_review')
        self.assertEqual(result['issues'][0]['field'],'sellVolume')
        invalid=copy.deepcopy(previous);invalid['offers'][0]['total']=1
        self.assertEqual(restore_capture_context(invalid,capture)['status'],'needs_review')

    def test_complete_numeric_and_date_row(self):
        rows=parse_table(tokens(),TABLE,'tesseract')
        self.assertEqual(len(rows),1)
        self.assertTrue(numeric_valid(rows[0]))
        self.assertFalse(needs_fallback(rows[0]))
        self.assertEqual(rows[0]['endsAt'],'2026-10-31T01:28:54')

    def test_partial_row_is_retained_for_manual_review(self):
        rows=parse_table([word('100',250)],TABLE,'tesseract')
        self.assertEqual(len(rows),1)
        self.assertIsNone(rows[0]['price'])
        self.assertIsNone(rows[0]['endsAt'])
        self.assertTrue(needs_fallback(rows[0]))

    def test_vision_fills_only_validated_missing_values_and_accepts_combined_timestamp(self):
        partial=parse_table([word('100',250)],TABLE,'tesseract')
        vision=parse_table(tokens()[:3]+[word('2026-10-31,01:28:54',650,left=460)],TABLE,'apple-vision')
        merged=merge_rows(partial,vision,10,True)
        self.assertTrue(numeric_valid(merged[0]))
        self.assertEqual(merged[0]['_source']['endsAt'],'apple-vision')
        self.assertEqual(merged[0]['endsAt'],'2026-10-31T01:28:54')

    def test_simultaneous_identical_rows_are_not_deduplicated_by_values(self):
        first=tokens()
        second=[dict(w,y=w['y']+16,b=w['b']+16,cy=w['cy']+16) for w in first]
        self.assertEqual(len(parse_table(first+second,TABLE,'tesseract')),2)

    def test_conflicting_valid_dates_are_reported(self):
        one=parse_table(tokens(),TABLE,'tesseract')
        two=parse_table(tokens()[:3]+[word('2026-10-31,01:28:55',650,left=460)],TABLE,'apple-vision')
        self.assertTrue(merge_rows(one,two,10,True)[0]['_conflict'])
        one[0]['_confidence']['endsAt']=10
        self.assertTrue(merge_rows(one,two,10,True)[0]['_conflict'])

    def test_complementary_partial_numeric_fields_survive_fallback(self):
        prior=parse_table([word('100',250)],TABLE,'tesseract')
        incoming=parse_table([word('50000',350),word('5000000',450)],TABLE,'apple-vision')
        merged=merge_rows(prior,incoming,10,True)
        self.assertEqual(merged[0]['price'],50000)
        self.assertTrue(numeric_valid(merged[0]))

    def test_invalid_manual_correction_retains_original_ocr_rows(self):
        partial={'offers':[{'side':'sell','rowIndex':0,'amount':100,'price':None,'total':None,'endsAt':None}],
                 'issues':[{'side':'sell','row':1,'field':'price','reason':'Unread'}],'engines':['tesseract']}
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'2026-10-01_120000000_Private_Hotkey.png'
            file.write_bytes(b'image')
            hash_value=hashlib.sha256(b'image').hexdigest()
            with patch('reprocess_market.read_market',return_value=partial):
                result=scan_file(file,{},None,{hash_value:{'offers':[]}})
            self.assertEqual(len(result['offers']),1)
            self.assertEqual(result['issues'][-1]['field'],'corrections')

    def test_previous_manual_snapshot_corrections_are_not_overwritten(self):
        offers=[{k:v for k,v in parse_table(tokens(),TABLE,'tesseract')[0].items() if not k.startswith('_')}|{'side':'sell','rowIndex':0}]
        issues=validate_capture(offers,{'sell':50000,'sellVolume':200})
        self.assertTrue(any(r['field']=='sellVolume' for r in issues))

    def test_manual_snapshot_difference_requires_explicit_confirmation(self):
        import hashlib
        rows=[dict(amount=100,price=50000,total=5000000,endsAt='2026-10-31T01:28:54',side='sell'),
              dict(amount=100,price=40000,total=4000000,endsAt='2026-10-31T01:28:54',side='buy')]
        reading={'offers':rows,'issues':[],'engines':['tesseract'],
                 'itemVerification':{'status':'tibia_coins','text':'Tibia Coins','source':'tesseract'}}
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'capture_Hotkey.png'
            file.write_bytes(b'image')
            h=hashlib.sha256(b'image').hexdigest()
            capture={'world':'Antica','capturedAt':'2026-10-01T12:00:00','sellVolume':200}
            correction={'offers':rows}
            with patch('reprocess_market.read_market',return_value=reading):
                self.assertEqual(scan_file(file,{h:capture},None,{h:correction})['status'],'needs_review')
                correction['confirmSnapshotDifferences']=True
                self.assertEqual(scan_file(file,{h:capture},None,{h:correction})['status'],'ready')

    def test_resume_retries_previously_absent_original_and_records_local_offset(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            directory=Path(d)
            file=directory/'capture_Hotkey.png'
            file.write_bytes(b'image')
            h=hashlib.sha256(b'image').hexdigest()
            baseline=directory/'baseline.json'
            baseline.write_text(json.dumps([{'hash':h,'world':'Antica','capturedAt':'2026-10-01T12:00:00'}]))
            output=directory/'output'
            output.mkdir()
            (output/'backfill-results.json').write_text(json.dumps([{'hash':h,'issues':[{'reason':'Original screenshot is absent from the supplied folder'}]}]))
            result={'hash':h,'world':'Antica','capturedAt':'2026-10-01T12:00:00','status':'needs_review','offers':[],
                    'issues':[{'field':'row','reason':'Unread'}]}
            argv=['reprocess_market.py',str(directory),'--baseline',str(baseline),'--output',str(output),
                  '--vision-binary','unused','--resume','--utc-offset=-03:00']
            with patch('sys.argv',argv), patch('reprocess_market.scan_file',return_value=result) as scan:
                main()
                scan.assert_called_once()
            self.assertEqual(json.loads((output/'backfill-metadata.json').read_text())['utcOffset'],'-03:00')
            self.assertEqual(len(json.loads((output/'backfill-results.json').read_text())),1)

    def test_manual_corrections_are_complete_validated_observations(self):
        correction={'offers':[dict(amount=100,price=50000,total=5000000,endsAt='2026-10-31T01:28:54',side='sell')]}
        corrected=apply_corrections({'engines':['tesseract'],'issues':['unread']},correction)
        self.assertEqual(corrected['issues'],[])
        self.assertEqual(corrected['offers'][0]['ocrSource']['amount'],'manual')
        invalid=copy.deepcopy(correction)
        invalid['offers'][0]['total']=1
        with self.assertRaises(ValueError):
            apply_corrections({'engines':[]},invalid)

    def test_retry_review_processes_hash_once_and_keeps_manual_exclusion_audit(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            directory=Path(d);output=directory/'output';output.mkdir()
            for name in ('one_Hotkey.png','copy_Hotkey.png'):
                (directory/name).write_bytes(b'image')
            manual=directory/'Screenshot.png';manual.write_bytes(b'manual')
            h=hashlib.sha256(b'image').hexdigest()
            capture={'hash':h,'world':'Antica','capturedAt':'2026-10-01T12:00:00'}
            baseline=directory/'baseline.json';baseline.write_text(json.dumps([capture]))
            prior=capture|{'status':'needs_review','offers':[],'issues':[{'field':'amount','reason':'Unread'}],
                           'itemVerification':{'status':'tibia_coins'}}
            (output/'backfill-results.json').write_text(json.dumps([prior]))
            result=prior|{'status':'ready','issues':[]}
            argv=['reprocess_market.py',str(directory),'--baseline',str(baseline),'--output',str(output),
                  '--vision-binary','unused','--resume','--retry-review','--exclude-name',manual.name]
            with patch('sys.argv',argv),patch('reprocess_market.scan_file',return_value=result) as scan:
                main();scan.assert_called_once()
            saved=json.loads((output/'backfill-results.json').read_text())
            ready=next(r for r in saved if r['hash']==h)
            self.assertEqual(len(ready['sourceFiles']),2)
            self.assertEqual(ready['previousAttempts'][0]['issues'],prior['issues'])
            self.assertEqual(sum(r['status']=='excluded_manual' for r in saved),1)

    def test_failure_keeps_a_screenshot_specific_review_record(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'2026-10-01_120000000_Private_Hotkey.png'
            file.write_bytes(b'image')
            with patch('reprocess_market.read_market',side_effect=RuntimeError('Both OCR engines failed')):
                result=scan_file(file,{},None,{})
            self.assertEqual(result['status'],'needs_review')
            self.assertEqual(result['issues'][0]['field'],'screenshot')
            self.assertEqual(len(result['hash']),64)
            self.assertNotIn('Private',str(result))

    def test_unresolved_capture_survives_export_with_review_template(self):
        baseline=[{'hash':'abc','world':'Ustebra','capturedAt':'2026-10-01T12:00:00','sell':1}]
        results=[{'hash':'abc','world':'Ustebra','capturedAt':baseline[0]['capturedAt'],'status':'needs_review','offers':[],
                  'issues':[{'side':'sell','row':1,'field':'endsAt','reason':'Unread'}]}]
        with tempfile.TemporaryDirectory() as d:
            summary=write_outputs(Path(d),baseline,results)
            self.assertEqual(summary['needs_review'],1)
            self.assertTrue((Path(d)/'review-corrections.json').exists())
            self.assertIn('endsAt',(Path(d)/'review-report.csv').read_text())
            self.assertIn('"sell": 1',(Path(d)/'captures-extracted.json').read_text())

    def test_other_items_are_reported_and_kept_out_of_coin_export(self):
        baseline=[{'hash':'wrong','world':'Antica','capturedAt':'2026-10-01T12:00:00','sell':1}]
        result={'hash':'wrong','world':'Antica','capturedAt':baseline[0]['capturedAt'],'status':'excluded_other_item','offers':[],
                'itemVerification':{'status':'other_item','text':'Mana Potion'},
                'issues':[{'side':None,'row':None,'field':'selectedItem','reason':'Different item selected','readText':'Mana Potion'}]}
        with tempfile.TemporaryDirectory() as d:
            summary=write_outputs(Path(d),baseline,[result])
            self.assertEqual(summary['excluded_other_item'],1)
            self.assertEqual(json.loads((Path(d)/'captures-extracted.json').read_text()),[])
            self.assertEqual(json.loads((Path(d)/'excluded-captures.json').read_text()),baseline)
            self.assertIn('Mana Potion',(Path(d)/'review-report.csv').read_text())

    def test_manual_numeric_corrections_cannot_bypass_item_confirmation(self):
        import hashlib
        rows=[dict(amount=100,price=50000,total=5000000,endsAt='2026-10-31T01:28:54',side='sell'),
              dict(amount=100,price=40000,total=4000000,endsAt='2026-10-31T01:28:54',side='buy')]
        reading={'offers':rows,'issues':[],'engines':['tesseract'],
                 'itemVerification':{'status':'unconfirmed','reason':'Selected item unread'}}
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'capture_Hotkey.png';file.write_bytes(b'image')
            h=hashlib.sha256(b'image').hexdigest()
            correction={'offers':rows}
            with patch('reprocess_market.read_market',return_value=reading):
                result=scan_file(file,{h:{'world':'Antica'}},None,{h:correction})
                self.assertEqual(result['status'],'needs_review')
                self.assertEqual(result['issues'][-1]['field'],'selectedItem')
                correction['confirmedSelectedItem']='Tibia Coins'
                result=scan_file(file,{h:{'world':'Antica'}},None,{h:correction})
                self.assertEqual(result['status'],'ready')

    def test_verified_item_recovery_recomputes_review_status(self):
        previous={'hash':'one','offers':[{'amount':100}],'status':'needs_review',
                  'issues':[{'field':'selectedItem','reason':'Unread'}]}
        with patch('reprocess_market.read_selected_item',return_value={'status':'tibia_coins','text':'Tibia Coins'}):
            result=verify_existing_item(Path('unused'),previous,None)
        self.assertEqual(result['status'],'ready')
        self.assertEqual(result['issues'],[])
        self.assertEqual(result['offers'],previous['offers'])

    def test_item_recovery_without_offer_ocr_cannot_be_ready(self):
        previous={'hash':'one','offers':[],'status':'excluded_other_item',
                  'issues':[{'field':'selectedItem','reason':'Different item'}]}
        with patch('reprocess_market.read_selected_item',return_value={'status':'tibia_coins','text':'Tibia Coins'}):
            result=verify_existing_item(Path('unused'),previous,None)
        self.assertEqual(result['status'],'needs_review')
        self.assertEqual(result['issues'][0]['field'],'marketTables')

if __name__=='__main__':
    unittest.main()
