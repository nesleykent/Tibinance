"""The forecast ledger appends, never rewrites: the chain detects any edited line, scoring is idempotent, and an outcome
scores the frozen prediction against the weekly median of its target week. A synthetic forecast whose target weeks have
already closed stands in for a matured one."""
import json, math, tempfile, unittest
from pathlib import Path
import pandas as pd
import ledger as ld
from research_data import research_cutoff


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.saved = ld.LEDGER
        ld.LEDGER = Path(self.tmp.name) / 'forecast-ledger.jsonl'
        self.cutoff = research_cutoff()

    def tearDown(self):
        ld.LEDGER = self.saved; self.tmp.cleanup()

    def synthetic(self):
        """The live forecast record, with its weeks moved 20 weeks back so that the first ones have been observed."""
        f = ld.forecast_record(self.cutoff)
        back = lambda iso: str((pd.Timestamp(iso) - pd.Timedelta(weeks=20)).date())
        f['weekEnding'] = [back(w) for w in f['weekEnding']]; f['targets'] = [back(w) for w in f['targets']]
        for x in f['worlds']: x['weekEnding'] = back(x['weekEnding'])
        for sides in f['fan'].values():
            for q in sides.values(): q['weeks'] = [back(w) for w in q['weeks']]
        return f

    def test_append_score_and_detect_tampering(self):
        records, prev = ld.read()
        prev = ld.append(records, prev, self.synthetic())
        prev = ld.outcomes(records, prev, self.cutoff)
        scored = [r for r in records if r['type'] == 'outcome']
        self.assertTrue(scored)
        f = records[0]; weekly = ld.observed(self.cutoff)
        for o in scored:
            self.assertLessEqual(pd.Timestamp(o['weekEnding']), self.cutoff)
            for side, s in o['antica'].items():
                j = f['weekEnding'].index(o['weekEnding'])
                self.assertEqual(s['actual'], float(weekly[f['benchmark']][side][pd.Timestamp(o['weekEnding'])]))
                for model, values in f['antica'][side].items():
                    self.assertEqual(s[model]['predicted'], values[j])
                    self.assertTrue(math.isclose(s[model]['ape'], abs(values[j] / s['actual'] - 1) * 100))
        # Scoring again adds nothing, and the file still reads as an unbroken chain.
        n = len(records); ld.outcomes(records, prev, self.cutoff)
        self.assertEqual(len(records), n); self.assertEqual(len(ld.read()[0]), n)
        # Editing any committed value breaks the chain.
        lines = ld.LEDGER.read_text().splitlines()
        first = json.loads(lines[0]); first['anchor']['ask'] += 1
        ld.LEDGER.write_text('\n'.join([ld.canonical(first), *lines[1:]]) + '\n')
        with self.assertRaises(AssertionError): ld.read()


if __name__ == '__main__':
    unittest.main()
