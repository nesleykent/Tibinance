import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw
from market_item import read_selected_item, item_list_bounds, selected_band


def word(text, x, y, width=30, height=10, confidence=95):
    return dict(t=text, x=x, r=x+width, y=y, b=y+height, h=height,
                cx=x+width/2, cy=y+height/2, conf=confidence)


def anchors():
    return [word('Sell', 200, 30), word('Offers:', 235, 30),
            word('Buy', 200, 80), word('Offers:', 235, 80),
            word('Items:', 20, 85), word('Search:', 55, 320),
            # A visible/search mention must never establish the selection.
            word('Tibia', 55, 340), word('Coins', 90, 340),
            word('Tibia', 60, 210), word('Coins', 95, 210)]


def label(text, confidence=95):
    return [word(part, index*45, 15, confidence=confidence)
            for index, part in enumerate(text.split())]


class MarketItemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.path = self.directory/'screenshot.png'
        self.image = Image.new('RGB', (400, 400), (45, 45, 45))
        draw = ImageDraw.Draw(self.image)
        draw.rectangle((20, 100, 179, 305), fill=(64, 64, 64))
        draw.rectangle((20, 110, 179, 145), fill=(88, 88, 88))
        self.image.save(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def read(self, name='Tibia Coins', confidence=95):
        with patch('native_market_ocr.tesseract_words', return_value=label(name, confidence)):
            return read_selected_item(self.path, self.directory, None, anchors())

    def test_highlighted_exact_tibia_coins_is_accepted(self):
        result = self.read()
        self.assertEqual(result['status'], 'tibia_coins')
        self.assertEqual(result['source'], 'tesseract')
        with Image.open(self.directory/'selected-item.png') as crop:
            self.assertEqual(crop.getpixel((0, 0)), (88, 88, 88))

    def test_other_selected_item_rejected_despite_visible_and_search_coin_mentions(self):
        self.assertEqual(self.read('Dragon Shield')['status'], 'other_item')
        self.assertEqual(self.read('Tibia Coins Voucher')['status'], 'other_item')

    def test_unhighlighted_coin_name_does_not_establish_selection(self):
        ImageDraw.Draw(self.image).rectangle((20, 100, 179, 305), fill=(64, 64, 64))
        self.image.save(self.path)
        self.assertEqual(self.read()['status'], 'unconfirmed')
        self.assertFalse((self.directory/'selected-item.png').exists())

    def test_multiple_highlights_require_review(self):
        ImageDraw.Draw(self.image).rectangle((20, 170, 179, 205), fill=(88, 88, 88))
        self.image.save(self.path)
        self.assertEqual(self.read()['status'], 'unconfirmed')

    def test_uncertain_name_uses_vision_on_only_the_selected_row(self):
        with patch('native_market_ocr.tesseract_words', return_value=label('Tibia Coins', 20)), \
             patch('native_market_ocr.vision_words', return_value=label('Tibia Coins')) as vision:
            result = read_selected_item(self.path, self.directory, 'vision-helper', anchors())
        self.assertEqual(result['status'], 'tibia_coins')
        self.assertEqual(result['source'], 'apple-vision')
        self.assertEqual(vision.call_args.args[0].name, 'selected-item.png')

    def test_clipped_coin_label_requires_fallback_or_review(self):
        with patch('native_market_ocr.tesseract_words',return_value=label('ia Coins')), \
             patch('native_market_ocr.vision_words',return_value=label('ia Coins')):
            result=read_selected_item(self.path,self.directory,'vision-helper',anchors())
        self.assertEqual(result['status'],'unconfirmed')

    def test_missing_item_label_does_not_fall_back_to_a_global_coin_mention(self):
        bad = [w for w in anchors() if w['t'] != 'Items:']
        with patch('native_market_ocr.vision_words', side_effect=RuntimeError('Vision unavailable')):
            self.assertEqual(read_selected_item(self.path, self.directory, None, bad)['status'], 'unconfirmed')

    def test_complementary_anchor_readings_can_establish_item_geometry(self):
        primary=[w for w in anchors() if w['t']!='Search:']
        vision=[dict(w,**{k:w[k]*2 for k in ('x','r','y','b','h','cx','cy')}) for w in anchors() if w['t']=='Search:']
        with patch('native_market_ocr.vision_words',return_value=vision), \
             patch('native_market_ocr.tesseract_words',return_value=label('Tibia Coins')):
            result=read_selected_item(self.path,self.directory,'vision-helper',primary)
        self.assertEqual(result['status'],'tibia_coins')

    def test_local_sidebar_retry_requires_observed_search_anchor(self):
        primary=[w for w in anchors() if w['t']!='Search:']
        broad,glyph=item_list_bounds(primary,400,400,sidebar=True)
        scale=42/glyph
        recovered=word('Search:',(55-broad[0])*scale,(320-broad[1])*scale,
                       width=30*scale,height=10*scale)
        with patch('native_market_ocr.tesseract_words',side_effect=[[recovered],label('Tibia Coins')]):
            result=read_selected_item(self.path,self.directory,None,primary)
        self.assertEqual(result['status'],'tibia_coins')
        with patch('native_market_ocr.tesseract_words',return_value=label('Tibia Coins')), \
             patch('native_market_ocr.vision_words',side_effect=RuntimeError('Unavailable')):
            result=read_selected_item(self.path,self.directory,None,primary)
        self.assertEqual(result['status'],'unconfirmed')

    def test_geometry_and_highlight_are_scale_relative(self):
        scaled = [dict(w, **{k:w[k]*2 for k in ('x','r','y','b','h','cx','cy')}) for w in anchors()]
        bounds, glyph = item_list_bounds(scaled, 800, 800)
        image = self.image.resize((800, 800), Image.Resampling.NEAREST)
        self.assertEqual(selected_band(image, bounds, glyph), (220, 292))

    def test_text_pixels_do_not_split_the_highlighted_row(self):
        ImageDraw.Draw(self.image).rectangle((54, 123, 173, 128), fill=(0, 0, 0))
        bounds, glyph = item_list_bounds(anchors(), 400, 400)
        self.assertEqual(selected_band(self.image, bounds, glyph), (110, 146))

    def test_taller_ocr_header_glyphs_do_not_truncate_the_item_name(self):
        taller = [dict(w, h=14, b=w['y']+14, cy=w['y']+7) for w in anchors()]
        with patch('native_market_ocr.tesseract_words', return_value=label('Tibia Coins')):
            result = read_selected_item(self.path, self.directory, None, taller)
        self.assertEqual(result['status'], 'tibia_coins')
        # The fixed-height icon/row determines the left edge, independently of
        # the OCR header's glyph measurement: (200-2.5*14-2 - (20+36*1.05))*3.
        with Image.open(self.directory/'selected-item.png') as crop:
            self.assertEqual(crop.width, 315)


if __name__ == '__main__':
    unittest.main()
