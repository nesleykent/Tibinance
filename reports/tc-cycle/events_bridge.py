"""Read the canonical Events model through its shared JS validation/query boundary.
No Python event definitions, normalization, context selection or calendar parser.
"""
from pathlib import Path
from functools import lru_cache
import json
import os
import subprocess

REPOSITORY = Path(os.environ.get('TIBINANCE_REPOSITORY', Path(__file__).resolve().parents[2]))
CANONICAL_EVENTS = REPOSITORY / 'data/events/events.json'

@lru_cache(maxsize=1)
def canonical_events():
    return json.loads(subprocess.check_output(['node', str(REPOSITORY / 'tools/events.mjs'), '--json'], text=True))
