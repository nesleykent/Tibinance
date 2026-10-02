import copy
import unittest
from review_market_vision import correction


class VisionReviewTests(unittest.TestCase):
    def reading(self):
        rows = [{'side': side, 'rowIndex': i, 'amount': 25, 'price': 45000,
                 'total': 1125000, 'endsAt': '2026-10-31T12:00:00',
                 'ocrSource': {'endsAt': 'apple-vision'}, 'private': 'discard'}
                for side in ('sell', 'buy') for i in range(11)]
        return {'offers': rows, 'issues': [], 'engines': ['tesseract', 'apple-vision'],
                'itemVerification': {'status': 'tibia_coins'}}

    def test_complete_vision_reading_is_a_private_metadata_free_explicit_correction(self):
        value = correction('a' * 64, self.reading())
        self.assertEqual(len(value['offers']), 22)
        self.assertEqual(set(value['offers'][0]), {'side', 'rowIndex', 'amount', 'price', 'total', 'endsAt'})

    def test_partial_uncertain_or_other_item_readings_cannot_supply_corrections(self):
        for change in [lambda r: r.update(issues=[{'field': 'endsAt'}]),
                       lambda r: r.update(engines=['tesseract']),
                       lambda r: r.update(itemVerification={'status': 'other_item'}),
                       lambda r: r.update(offers=r['offers'][:11])]:
            reading = copy.deepcopy(self.reading())
            change(reading)
            self.assertIsNone(correction('a' * 64, reading))
