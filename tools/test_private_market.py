import json
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch
from pathlib import Path

from PIL import Image, ImageDraw

from private_market import masked_market
from native_market_ocr import visual_row_centers
from reprocess_market import safe_result, write_outputs


class PrivateArchiveTests(unittest.TestCase):
    def panel(self):
        image = Image.new('RGB', (1710, 1074), (200, 30, 30))
        draw = ImageDraw.Draw(image)
        for top, bottom in ((301, 413), (530, 674)):
            for left, right in ((542,784),(786,914),(916,1044),(1046,1174),(1176,1326)):
                draw.rectangle((left,top,right-1,bottom-1),fill=(65,65,65))
        return image

    def test_pixel_mask_discards_owners_chat_and_game_without_ocr(self):
        safe = masked_market(self.panel())
        self.assertIsNotNone(safe)
        self.assertEqual(safe.getpixel((600,350)), (65,65,65))
        self.assertEqual(safe.getpixel((800,350)), (65,65,65))
        self.assertEqual(safe.getpixel((900,900)), (65,65,65))
        self.assertEqual(safe.getpixel((20,20)), (65,65,65))

    def test_unknown_layout_fails_closed(self):
        self.assertIsNone(masked_market(Image.new('RGB',(1710,1074),(65,65,65))))

    def test_row_completeness_counts_white_and_gray_digits(self):
        image=Image.new('RGB',(400,200),(65,65,65))
        draw=ImageDraw.Draw(image)
        for top,colour in ((105,255),(121,192),(137,192)):
            draw.rectangle((250,top,265,top+7),fill=(colour,colour,colour))
        table={'amountR':200,'pieceR':300,'top':100,'stop':180,'glyph':10}
        self.assertEqual(len(visual_row_centers(image,table)),3)

    def test_retina_mask_preserves_privacy(self):
        image = self.panel().resize((3420,2148),Image.Resampling.NEAREST)
        safe = masked_market(image)
        self.assertIsNotNone(safe)
        self.assertEqual(safe.getpixel((1200,700)),(65,65,65))
        self.assertEqual(safe.getpixel((1600,700)),(65,65,65))

    def test_output_whitelist_discards_source_names_and_arbitrary_text(self):
        entry = {'hash':'a'*64,'world':'Antica','capturedAt':'2026-10-01T12:00:00',
                 'status':'needs_review','sourceFiles':['sensitive source'],
                 'itemVerification':{'status':'unconfirmed','text':'sensitive text'},
                 'issues':[{'field':'screenshot','reason':'sensitive exception','readText':'sensitive OCR'}],
                 'offers':[],'previousAttempts':[{'sourceFiles':['sensitive source']} ]}
        clean = safe_result(entry)
        self.assertNotIn('sensitive',json.dumps(clean))
        with tempfile.TemporaryDirectory() as folder:
            write_outputs(Path(folder),[],[entry],rebuild=True)
            for output in Path(folder).iterdir():
                self.assertNotIn('sensitive',output.read_text())

    def test_rebuild_excludes_stale_unconfirmed_and_unknown_context(self):
        baseline=[{'hash':'old','world':'Antica','capturedAt':'2026-10-01T12:00:00','sell':1,'private':'discard'}]
        results=[{'hash':'old','world':'Antica','capturedAt':baseline[0]['capturedAt'],
                  'status':'unclassifiable','offers':[],'issues':[],'itemVerification':{'status':'unconfirmed'}}]
        with tempfile.TemporaryDirectory() as folder:
            write_outputs(Path(folder),baseline,results,rebuild=True)
            self.assertEqual(json.loads((Path(folder)/'captures-extracted.json').read_text()),[])





if __name__ == '__main__':
    unittest.main()
