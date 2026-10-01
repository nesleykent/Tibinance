import hashlib
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import tcmarket as tc
from offer_tracking import export_offers

ENDS = '2026-10-31T01:28:54'

def rec(world='Ustebra', capture='2026-10-01T13:00:00', source='capture.jpeg', amount=2850, collision=False):
    sell = [{'amount': amount, 'price': 45995, 'total': amount * 45995, 'endsAt': ENDS}]
    if collision:
        sell.append(dict(sell[0]))
    buy = [{'amount': 25, 'price': 45000, 'total': 1125000, 'endsAt': ENDS}]
    return dict(world=world, pvp_type='Open PvP', battleye='Green', battleye_date='release',
                sell=45995, sell_volume=amount * len(sell), sell_rows=len(sell), buy=45000,
                buy_volume=25, buy_rows=1, captured_at=capture, character='Private Name',
                source_file=source, raw_sell=json.dumps(sell), raw_buy=json.dumps(buy),
                added_at='2026-10-01 13:00:00', screenshot_hash=None)

class OfferTrackingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(tc, 'DB_PATH', os.path.join(self.temp.name, 'test.db'))
        self.db_patch.start()
        self.conn = tc.db()

    def tearDown(self):
        self.conn.close()
        self.db_patch.stop()
        self.temp.cleanup()

    def test_changed_amount_backfill_and_world_isolation(self):
        tc.store(self.conn, rec(amount=1900, capture='2026-10-01T14:00:00', source='b.jpeg'))
        tc.store(self.conn, rec())
        tc.store(self.conn, rec(world='Antica'))
        rows = export_offers(self.conn)
        sell = [r for r in rows if r['side'] == 'sell']
        ust = [r for r in sell if r['world'] == 'Ustebra']
        self.assertEqual(ust[0]['offerId'], ust[1]['offerId'])
        self.assertEqual([r['amount'] for r in ust], [2850, 1900])
        self.assertNotEqual(sell[0]['offerId'], ust[0]['offerId'])
        self.assertFalse(any('character' in r or 'source_file' in r for r in rows))

    def test_duplicate_and_reprocess_preserve_context_and_uuid(self):
        first = rec()
        first['screenshot_hash'] = 'abc'
        self.assertTrue(tc.store(self.conn, first))
        before = export_offers(self.conn)
        capture = dict(self.conn.execute('SELECT * FROM observations').fetchone())
        self.assertFalse(tc.store(self.conn, first))
        changed = dict(first, world='Antica', captured_at='2026-10-02T00:00:00', sell=1)
        for _ in range(3):
            self.assertTrue(tc.store(self.conn, changed, replace=True))
        self.assertEqual(before, export_offers(self.conn))
        after = dict(self.conn.execute('SELECT * FROM observations').fetchone())
        self.assertEqual(capture, after)

    def test_collisions_and_reprocess_uuid_stability(self):
        first = rec(collision=True)
        tc.store(self.conn, first)
        before = export_offers(self.conn)
        sells = [r for r in before if r['side'] == 'sell']
        self.assertNotEqual(sells[0]['offerId'], sells[1]['offerId'])
        self.assertTrue(all(r['matchAmbiguous'] for r in sells))
        tc.store(self.conn, first, replace=True)
        self.assertEqual(before, export_offers(self.conn))
        tc.store(self.conn, rec(source='later.jpeg', capture='2026-10-01T14:00:00', collision=True, amount=500))
        later = [r for r in export_offers(self.conn) if r['capturedAt'].endswith('14:00:00') and r['side']=='sell']
        self.assertEqual({r['offerId'] for r in sells}, {r['offerId'] for r in later})

    def test_invalid_reprocessing_rolls_back(self):
        tc.store(self.conn, rec())
        before = export_offers(self.conn)
        broken = rec()
        rows = json.loads(broken['raw_sell'])
        rows[0]['endsAt'] = None
        broken['raw_sell'] = json.dumps(rows)
        with self.assertRaises(ValueError):
            tc.store(self.conn, broken, replace=True)
        self.assertEqual(before, export_offers(self.conn))

    def test_incomplete_reprocessing_does_not_remove_tracked_rows(self):
        tc.store(self.conn, rec(collision=True))
        before = export_offers(self.conn)
        with self.assertRaises(ValueError):
            tc.store(self.conn, rec(), replace=True)
        self.assertEqual(before, export_offers(self.conn))

    def test_legacy_schema_migration_and_capture_enrichment(self):
        self.conn.close()
        os.remove(tc.DB_PATH)
        conn = sqlite3.connect(tc.DB_PATH)
        conn.executescript(tc.SCHEMA)
        first = rec()
        first.pop('screenshot_hash')
        conn.execute(f"INSERT INTO observations ({','.join(first)}) VALUES ({','.join('?' for _ in first)})", list(first.values()))
        conn.commit()
        conn.close()
        self.conn = tc.db()
        capture_id = self.conn.execute('SELECT id FROM observations').fetchone()[0]
        self.assertFalse(tc.store(self.conn, rec()))
        self.assertTrue(tc.store(self.conn, rec(), replace=True))
        self.assertEqual(self.conn.execute('SELECT id FROM observations').fetchone()[0], capture_id)
        self.assertEqual(len(export_offers(self.conn)), 2)

    def test_string_and_json_dates_are_normalized_and_validated(self):
        rows = tc.parse_rows('2850@45995=131085750#2026-10-31T01:28:54', 'sell')
        self.assertEqual(rows[0]['endsAt'], ENDS)
        self.assertEqual(tc.parse_rows(rows, 'sell'), rows)
        with self.assertRaises(tc.PipelineError):
            tc.parse_rows('1@2#2026-02-30T00:00:00', 'sell')

    def test_reprocess_uses_original_world_without_api(self):
        source = os.path.join(self.temp.name, '2026-10-01_130000000_Private Name_Hotkey.jpeg')
        with open(source, 'wb') as f:
            f.write(b'screenshot')
        first = rec(source=os.path.basename(source))
        first['screenshot_hash'] = hashlib.sha256(b'screenshot').hexdigest()
        tc.store(self.conn, first)
        with patch.object(tc, 'fetch_character', side_effect=AssertionError('Live lookup during backfill')):
            capture, *_ = tc.process(source, json.loads(first['raw_sell']), json.loads(first['raw_buy']), conn=self.conn, reprocess=True)
        self.assertEqual(capture['world'], 'Ustebra')

if __name__ == '__main__':
    unittest.main()
