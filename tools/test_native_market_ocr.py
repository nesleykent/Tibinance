import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from native_market_ocr import parse_table, merge_rows, needs_fallback, numeric_valid

TABLE={'top':100,'stop':200,'glyph':10,'nameX':0,'x0':190,'amountR':250,'pieceR':350,'totalR':450}

def word(text,right,left=None,cy=130,conf=95):
    return {'t':text,'x':right-30 if left is None else left,'r':right,'y':cy-5,'b':cy+5,'h':10,'cx':right-15,'cy':cy,'conf':conf}

def tokens():
    return [word('100',250),word('50000',350),word('5000000',450),word('2026-10-31,',560,left=460),word('01:28:54',640,left=570)]

class NativeOCRTests(unittest.TestCase):

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













if __name__=='__main__':
    unittest.main()
