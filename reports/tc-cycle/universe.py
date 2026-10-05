"""The analysed universe: every world present in market-update.json, never a fixed list.

Adding a world to the report is installing an export that contains it (market_update.py), fetching its
history (fetch_api.py) and rerunning the pipeline. Only facts about particular worlds live here, keyed by
name; none of them decides which worlds are analysed.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
BENCHMARK = 'Antica'  # every relative measure (premium, transfer, co-movement) is against this world
# Predecessor histories are shown separately and never concatenated with the successor's series.
from events_bridge import canonical_events
PREDECESSORS = {w: tuple(names) for w, names in canonical_events()['lifecycle']['predecessors'].items()}
# An announcement has its full membership even when a participant is outside the capture universe.
MERGER_EVENTS = canonical_events()['mergers']
MERGERS = {world: event['confirmedDate'] or event['notBefore']
           for event in MERGER_EVENTS for world in event['participants']}


def worlds(path=ROOT / 'market-update.json'):
    names = sorted({c['world'] for c in json.loads(Path(path).read_text())})
    assert BENCHMARK in names, f'{BENCHMARK} is the benchmark and must be in {path.name}'
    return names


def api_worlds():
    """Every world whose history the pipeline reads: the universe plus the predecessors of its members."""
    ws = worlds()
    return ws + predecessor_worlds()


def predecessor_worlds():
    # A canonical predecessor may have no captured price history in this report.
    return sorted({p for w in worlds() for p in PREDECESSORS.get(w, ()) if (ROOT / f'inputs/api/{p.lower()}.json').exists()})
