"""Validate (and optionally install) the raw Market capture export.

market-update.json preserves the capture export except unsupported legacy
Statistics-derived fields, which are omitted on publication: a list with one
object per capture, for any world. The page builds the Market monitor from it
in the browser and shows every world it contains, so updating the monitor is
validating and installing a new export:

    python3 market_update.py ~/Downloads/market-update.json   # validate + install
    python3 market_update.py                                  # validate current file

The research inputs (inputs/observations-*.json) stay frozen and are not read here.
"""

import argparse
import subprocess
import os
import shutil
import sys
from datetime import datetime
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT_FILE = ROOT / "market-update.json"

INT_FIELDS = ("sell", "buy", "sellVolume", "buyVolume", "sellTopAmount", "buyTopAmount", "goldSupply", "goldDemand")
STR_FIELDS = ("world", "type", "battleye", "capturedAt", "hash")


def validate(captures):
    assert isinstance(captures, list) and captures, "Expected a non-empty list of captures"
    hashes = set()
    for capture in captures:
        ref = capture.get("hash", "?") if isinstance(capture, dict) else "?"
        assert isinstance(capture, dict), f"Capture is not an object: {ref}"
        for key in STR_FIELDS:
            assert isinstance(capture.get(key), str) and capture[key], f"Missing {key}: {ref}"
        for key in (() if capture.get('viewType') == 'statistics' else INT_FIELDS):
            if key not in ('sell', 'buy', 'sellVolume', 'buyVolume') and capture.get(key) is None:
                continue  # optional fields on older capture records
            assert type(capture.get(key)) is int, f"Noninteger market value: {ref} {key}"
        assert capture["hash"] not in hashes, f"JSON duplicate hashes: {ref}"
        hashes.add(capture["hash"])
        if capture.get("viewType") != "statistics":
            assert capture["sell"] > capture["buy"] > 0, f"Invalid offer prices: {ref}"
        for side in (() if capture.get("viewType") == "statistics" else ("sell", "buy")):
            if capture.get(f"{side}TopAmount") is None:
                continue
            assert 0 < capture[f"{side}TopAmount"] <= capture[f"{side}Volume"], (
                f"Invalid Amount at best Piece Price: {ref}"
            )
        datetime.fromisoformat(capture["capturedAt"])
    # Validate the additive schema with the actual website contract, not a
    # separately maintained interpretation of rolling statistics or DST.
    contract = ROOT.parents[1] / 'js' / 'statistics.js'
    script = """
      const {validatedStatistics,statisticsReferenceDate,validTimeZone,captureInstant,normalizeCapturedAt} = await import(process.argv[1]);
      let raw=''; for await (const part of process.stdin) raw+=part;
      for (const c of JSON.parse(raw)) {
        if (c.viewType === 'statistics' || c.statistics30d != null) {
          validatedStatistics(c.statistics30d);
          // Legacy derived fields are ignored; the raw four-field Statistics contract is authoritative.
        }
        if (c.processingVersion >= 6) {
          for (const key of ['viewType','captureDate','captureTimeZone','capturedAtUtc']) if (!(key in c)) throw Error();
          if (c.viewType === 'statistics' && !('statisticsReferenceDate' in c)) throw Error();
          if (!normalizeCapturedAt(c.capturedAt)) throw Error();
        }
        if (c.viewType != null && !['offers','statistics'].includes(c.viewType)) throw Error();
        const instant=captureInstant(c.capturedAt,c.captureTimeZone);
        if ('capturedAtUtc' in c && c.capturedAtUtc !== (instant === null ? null : new Date(instant).toISOString())) throw Error();
        if ('captureDate' in c && c.captureDate !== c.capturedAt.slice(0,10)) throw Error();
        if (c.captureTimeZone != null && !validTimeZone(c.captureTimeZone)) throw Error();
        if ('statisticsReferenceDate' in c && c.statisticsReferenceDate !== statisticsReferenceDate(c.capturedAt,c.captureTimeZone)) throw Error();
        if (c.viewType === 'offers' && 'statisticsReferenceDate' in c) throw Error();
        for (const offer of c.offers ?? []) {
          if ((c.processingVersion ?? 0) < 6 && !('endsAtUtc' in offer)) continue;
          const end=captureInstant(offer.endsAt,c.captureTimeZone);
          if (offer.endsAtUtc !== (end === null ? null : new Date(end).toISOString())) throw Error();
        }
      }
    """
    checked = subprocess.run([os.environ.get('TIBINANCE_NODE', 'node'), '--input-type=module', '-e', script, contract.as_uri()],
                             input=json.dumps(captures), text=True, capture_output=True)
    assert checked.returncode == 0, 'Invalid 30-day Statistics or capture temporal context'
    return sorted({c["world"] for c in captures})


def publication_rows(captures):
    """Drop legacy derived Statistics fields without changing source counters."""
    fields = ('transactions', 'highestPrice', 'averagePrice', 'lowestPrice')
    return [{**c, 'statistics30d': {side: {key: c['statistics30d'][side][key] for key in fields}
             for side in ('buy', 'sell')}} if c.get('statistics30d') is not None else c
            for c in captures]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", type=Path, help="new export to validate and copy over market-update.json")
    args = parser.parse_args()
    source = args.source or OUTPUT_FILE
    try:
        captures = json.loads(source.read_text())
        worlds = validate(captures)
    except AssertionError as error:
        sys.exit(f"FAIL: {source}: {error}")
    if args.source and source.resolve() != OUTPUT_FILE:
        normalized = publication_rows(captures)
        if normalized == captures:
            shutil.copyfile(source, OUTPUT_FILE)  # current exports remain byte-identical
        else:
            OUTPUT_FILE.write_text(json.dumps(normalized, indent=2) + "\n")
        print(f"Installed {source} -> {OUTPUT_FILE}")
    print(f"PASS: {len(json.loads(OUTPUT_FILE.read_text()))} captures, {len(worlds)} worlds: {', '.join(worlds)}")


if __name__ == "__main__":
    main()
