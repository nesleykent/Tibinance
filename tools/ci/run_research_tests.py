"""Runs the Research report's unit tests (reports/tc-cycle/test_*.py) for CI.

One test packages the report with prepare_site.py, which reads the ignored local hosting metadata
(.openai/hosting.json, a private project identifier that is never committed). Where that file is absent, as on a
CI runner, that single test is reported as skipped with the reason, never as passed; every other test runs.
"""
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'reports' / 'tc-cycle'
NEEDS_HOSTING = {'test_packaged_report_contains_the_shared_statistics_runtime_and_export'}


def flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from flatten(item)
        else:
            yield item


def main():
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    tests = list(flatten(unittest.defaultTestLoader.discover(str(ROOT), pattern='test_*.py')))
    if not (ROOT / '.openai' / 'hosting.json').exists():
        for t in tests:
            if getattr(t, '_testMethodName', None) in NEEDS_HOSTING:
                reason = 'needs the ignored reports/tc-cycle/.openai/hosting.json'
                setattr(t, t._testMethodName, unittest.skip(reason)(lambda: None))
    result = unittest.TextTestRunner(verbosity=1).run(unittest.TestSuite(tests))
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == '__main__':
    main()
