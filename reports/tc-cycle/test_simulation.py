"""Real simulation regressions without executing the full report pipeline."""
import ast
from importlib.metadata import version
from pathlib import Path
import unittest
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX


def simulator():
    source = ast.parse((Path(__file__).parent / 'complement.py').read_text())
    selected = [node for node in source.body if isinstance(node, ast.FunctionDef)
                and node.name in ('feats', 'simulate')]
    scope = {'np': np, 'pd': pd, 'T0': pd.Timestamp('2023-01-01')}
    exec(compile(ast.Module(body=selected, type_ignores=[]), 'complement.py', 'exec'), scope)
    return scope


class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.api = simulator()
        index = pd.date_range('2025-01-05', periods=30, freq='W-SUN')
        observed = pd.Series(np.log(np.linspace(40000, 42500, len(index))), index=index)
        self.model = SARIMAX(observed, exog=self.api['feats'](index), order=(0, 1, 0))
        self.fit = self.model.filter([0, 0, 0, 0, 0, .01])
        self.future = pd.date_range(index[-1]+pd.Timedelta(weeks=1), periods=6, freq='W-SUN')

    def paths(self, seed):
        return self.api['simulate'](self.model, self.fit, self.future, 1, 3, seed)

    def test_same_seed_reproduces_innovation_paths_exactly(self):
        np.testing.assert_array_equal(self.paths(11), self.paths(11))

    def test_different_seeds_change_innovation_paths(self):
        self.assertFalse(np.array_equal(self.paths(11), self.paths(99)))

    def test_research_runtime_matches_the_pinned_dependencies(self):
        requirements = (Path(__file__).parent / 'requirements.txt').read_text().splitlines()
        for requirement in requirements:
            package, expected = requirement.split('==')
            self.assertEqual(version(package), expected, f'Install requirements.txt before generating forecasts: {package}')


if __name__ == '__main__':
    unittest.main()
