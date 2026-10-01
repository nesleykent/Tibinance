import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from native_market_ocr import merge_rows, recover_stripes, stripe_observation, numeric_valid, FIELDS


def word(text, confidence=95):
    return dict(t=text, x=2, r=90, y=2, b=12, h=10, cx=46, cy=7, conf=confidence)


def row(amount=200, price=42416, total=8483200, ends='2026-10-21T12:55:31', cy=100):
    values=dict(amount=amount,price=price,total=total,endsAt=ends)
    return values|{'_cy':cy,'_confidence':{k:95 for k in FIELDS},
                   '_raw':{k:str(v) for k,v in values.items()},'_source':{k:'broad' for k in FIELDS}}


TABLE={'side':'buy','top':50,'stop':180,'glyph':14,'x0':0,'amountR':100,'pieceR':200,'totalR':300}


class NativeRecoveryTests(unittest.TestCase):
    def test_shifted_partial_row_merges_only_with_unique_observed_field_agreement(self):
        partial=row(price=None,cy=90)
        correct=row(cy=100)
        merged=merge_rows([partial],[correct],14,True)
        self.assertEqual(len(merged),1)
        self.assertTrue(numeric_valid(merged[0]))
        self.assertEqual(merged[0]['_cy'],100)
        # Geometry alone cannot merge a more distant row with different values.
        merged=merge_rows([row(price=None,cy=90)],[row(amount=300,total=12724800,cy=100)],14,True)
        self.assertEqual(len(merged),2)

    def test_simultaneous_identical_rows_are_preserved(self):
        self.assertEqual(len(merge_rows([row(cy=100)],[row(cy=116)],14,True)),2)

    def test_mixed_date_fragments_are_not_a_single_cell_observation(self):
        value,_,_=stripe_observation([word('2026-10-23,'),word('2026-10-21,16:46:00')],'endsAt')
        self.assertIsNone(value)

    def test_unparseable_numeric_cell_preserves_the_observed_text(self):
        value,_,text=stripe_observation([word('2OO')],'amount')
        self.assertIsNone(value)
        self.assertEqual(text,'2OO')
        value,confidence,text=stripe_observation([word('2OO'),word('25')],'amount')
        self.assertIsNone(value)
        self.assertEqual(confidence,0)
        self.assertEqual(text,'2OO 25')

    def recover(self, target, primary, fallback):
        def read(values):
            return lambda path,*args: [word(str(values[Path(path).stem.rsplit('-',1)[1]]))]
        with tempfile.TemporaryDirectory() as directory, \
             patch('native_market_ocr.tesseract_words',side_effect=read(primary)), \
             patch('native_market_ocr.vision_words',side_effect=read(fallback)):
            return recover_stripes(Image.new('RGB',(500,200),(64,64,64)),TABLE,[target],directory,'vision')[0]

    def test_tight_both_engine_agreement_supersedes_broad_date_conflict(self):
        target=row(ends='2026-10-21T16:46:00')
        target['_conflict']=True
        target['_alternatives']={'endsAt':['2026-10-21T16:46:00','2026-10-23T16:46:00']}
        readings={'endsAt':'2026-10-23T16:46:00'}
        recovered=self.recover(target,readings,readings)
        self.assertEqual(recovered['endsAt'],readings['endsAt'])
        self.assertFalse(recovered['_conflict'])
        self.assertIn('endsAt',recovered['_recoveryEvidence'])
        self.assertEqual(len(recovered['_alternatives']['endsAt']),2)

    def test_disagreeing_cell_observations_do_not_clear_date_conflict(self):
        target=row()
        target['_conflict']=True
        recovered=self.recover(target,{'endsAt':'2026-10-21T12:55:31'},{'endsAt':'2026-10-21T12:55:32'})
        self.assertTrue(recovered['_conflict'])
        self.assertEqual(recovered['endsAt'],target['endsAt'])

    def test_complete_agreed_numeric_cells_must_satisfy_checksum(self):
        target=row()
        target['_numericConflict']=True
        values={'amount':200,'price':42416,'total':8483200}
        recovered=self.recover(copy.deepcopy(target),values,values)
        self.assertFalse(recovered['_numericConflict'])
        self.assertTrue(numeric_valid(recovered))
        invalid=values|{'total':8483201}
        self.assertTrue(self.recover(copy.deepcopy(target),invalid,invalid)['_numericConflict'])
        disagree=values|{'amount':250}
        self.assertTrue(self.recover(copy.deepcopy(target),values,disagree)['_numericConflict'])

    def test_failed_tesseract_cell_can_retry_inverted_pixels_with_audit(self):
        target=row()
        target['_numericConflict']=True
        values={'amount':200,'price':42416,'total':8483200}
        def primary(path,*args):
            name=Path(path).stem
            if name.endswith('-amount'):
                return [word('2OO')]
            field=name.rsplit('-',1)[1] if not name.endswith('-inverted') else name.rsplit('-',2)[1]
            return [word(str(values[field]))]
        def fallback(path,*args):
            return [word(str(values[Path(path).stem.rsplit('-',1)[1]]))]
        with tempfile.TemporaryDirectory() as directory, \
             patch('native_market_ocr.tesseract_words',side_effect=primary), \
             patch('native_market_ocr.vision_words',side_effect=fallback):
            recovered=recover_stripes(Image.new('RGB',(500,200)),TABLE,[target],directory,'vision')[0]
        self.assertFalse(recovered['_numericConflict'])
        reading=recovered['_recoveryEvidence']['amount']['tesseract']
        self.assertEqual(reading['rendering'],'inverted')
        self.assertEqual(reading['initialRead']['readText'],'2OO')


if __name__=='__main__':
    unittest.main()
