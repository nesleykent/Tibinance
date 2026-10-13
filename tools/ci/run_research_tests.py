"""Runs the Research report's unit tests (reports/tc-cycle/test_*.py) for CI.

One test packages the report with prepare_site.py, which reads the ignored local hosting metadata
(.openai/hosting.json, a private project identifier that is never committed). Where that file is absent, as on a
CI runner, that single test is reported as skipped with the reason, never as passed; every other test runs.

With TIBINANCE_FLOAT_TOLERANCE=1 (set by CI), test_inflation's reproduction test compares the rebuilt
inflation.json with the committed one at a relative tolerance of 1e-9 for floats instead of bit for bit: the
committed file was computed on the owner's machine, and other machines' BLAS builds change the last digits of the
decomposition (seen on Linux x64 and on GitHub's macOS arm64). Every other assertion of that test stays exact,
and the exact variant still runs everywhere the variable is not set. Both variants report under their own names.
"""
import math
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


def close(a, b, path='$'):
    """Exact equality except floats, which must agree to 1e-9 relative (or absolute near zero)."""
    if isinstance(a, float) or isinstance(b, float):
        if not (isinstance(a, (int, float)) and isinstance(b, (int, float)) and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)):
            raise AssertionError(f'{path}: {a!r} != {b!r}')
    elif isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys():
            raise AssertionError(f'{path}: keys differ: {sorted(set(a) ^ set(b))}')
        for k in a:
            close(a[k], b[k], f'{path}.{k}')
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            raise AssertionError(f'{path}: lengths {len(a)} != {len(b)}')
        for i, (x, y) in enumerate(zip(a, b)):
            close(x, y, f'{path}[{i}]')
    elif a != b:
        raise AssertionError(f'{path}: {a!r} != {b!r}')


def main():
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    tests = list(flatten(unittest.defaultTestLoader.discover(str(ROOT), pattern='test_*.py')))
    if not (ROOT / '.openai' / 'hosting.json').exists():
        for t in tests:
            if getattr(t, '_testMethodName', None) in NEEDS_HOSTING:
                reason = 'needs the ignored reports/tc-cycle/.openai/hosting.json'
                setattr(t, t._testMethodName, unittest.skip(reason)(lambda: None))
    if os.environ.get('TIBINANCE_FLOAT_TOLERANCE') == '1':
        import test_inflation

        class InflationReproductionWithinFloatTolerance(test_inflation.InflationTests):
            def assertEqual(self, first, second, msg=None):
                if isinstance(first, dict) and isinstance(second, dict):
                    return close(first, second)
                return super().assertEqual(first, second, msg)

        exact = 'test_saved_arithmetic_provenance_reproduction'
        for t in tests:
            if getattr(t, '_testMethodName', None) == exact and type(t).__name__ == 'InflationTests':
                setattr(t, exact, unittest.skip('bit-exact float reproduction runs on the producing machine; '
                                                 'the 1e-9 tolerance variant runs here')(lambda: None))
        tests.append(InflationReproductionWithinFloatTolerance(exact))
    result = unittest.TextTestRunner(verbosity=1).run(unittest.TestSuite(tests))
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == '__main__':
    main()
