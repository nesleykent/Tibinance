"""Announcement membership is independent of observed-world coverage."""
import unittest
import json
import tempfile
from pathlib import Path
from universe import MERGER_EVENTS, MERGERS, worlds

class MergerTests(unittest.TestCase):
    def test_full_membership_survives_missing_capture_world(self):
        event = next(e for e in MERGER_EVENTS if e['successor'] == 'Deslumbra')
        self.assertEqual(set(event['participants']), {'Luzibra', 'Yubra', 'Etebra'})
        with tempfile.TemporaryDirectory() as directory:
            capture_file = Path(directory) / 'captures.json'
            capture_file.write_text(json.dumps([{'world': w} for w in ['Antica', 'Luzibra', 'Etebra']]))
            observed = worlds(capture_file)
        self.assertNotIn('Yubra', observed)
        self.assertEqual(set(event['participants']) & set(observed), {'Luzibra', 'Etebra'})
        self.assertTrue(all(MERGERS[w] == event['notBefore'] for w in event['participants']))
        self.assertIsNone(event['confirmedDate'])
