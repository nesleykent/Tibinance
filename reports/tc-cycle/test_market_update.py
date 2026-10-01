"""Checks for the raw Market capture export read by the page."""
import copy
import json
import unittest

import market_update as market


class MarketUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.captures = json.loads(market.OUTPUT_FILE.read_text())

    def test_published_export_is_valid_and_keeps_every_world(self):
        worlds = market.validate(self.captures)
        self.assertEqual(worlds, sorted({c["world"] for c in self.captures}))

    def test_research_universe_is_the_export(self):
        # The research universe is derived from this file: a new export needs fetch_api.py and a rerun.
        research = json.loads((market.ROOT / "results.json").read_text())
        self.assertEqual(research["universe"], sorted({c["world"] for c in self.captures}))
        listed = {w["world"] for w in research["worlds"]} | {w["world"] for w in research["unmodelled"]}
        self.assertEqual(listed, set(research["universe"]))

    def test_duplicate_hash_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, "duplicate hashes"):
            market.validate(self.captures + [self.captures[-1]])

    def test_invalid_depth_and_price_are_rejected(self):
        for field, value in [("sellTopAmount", 0), ("buyTopAmount", 10**15), ("sell", 1), ("buy", 0), ("sellVolume", "1")]:
            with self.subTest(field=field):
                rows = copy.deepcopy(self.captures)
                rows[0][field] = value
                with self.assertRaises(AssertionError):
                    market.validate(rows)

    def test_missing_field_is_rejected(self):
        rows = copy.deepcopy(self.captures)
        del rows[0]["world"]
        with self.assertRaisesRegex(AssertionError, "Missing world"):
            market.validate(rows)


if __name__ == "__main__":
    unittest.main()
