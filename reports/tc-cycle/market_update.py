"""Validate (and optionally install) the raw Market capture export.

market-update.json is the capture export exactly as received: a list with one
object per capture, for any world. The page builds the Market monitor from it
in the browser and shows every world it contains, so updating the monitor is
copying a new export over this file:

    python3 market_update.py ~/Downloads/market-update.json   # validate + install
    python3 market_update.py                                  # validate current file

The research inputs (inputs/observations-*.json) stay frozen and are not read here.
"""

import argparse
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
        for key in INT_FIELDS:
            assert type(capture.get(key)) is int, f"Noninteger market value: {ref} {key}"
        assert capture["hash"] not in hashes, f"JSON duplicate hashes: {ref}"
        hashes.add(capture["hash"])
        assert capture["sell"] > capture["buy"] > 0, f"Invalid offer prices: {ref}"
        for side in ("sell", "buy"):
            assert 0 < capture[f"{side}TopAmount"] <= capture[f"{side}Volume"], (
                f"Invalid Amount at best Piece Price: {ref}"
            )
        datetime.fromisoformat(capture["capturedAt"])
    return sorted({c["world"] for c in captures})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", type=Path, help="new export to validate and copy over market-update.json")
    args = parser.parse_args()
    source = args.source or OUTPUT_FILE
    try:
        worlds = validate(json.loads(source.read_text()))
    except AssertionError as error:
        sys.exit(f"FAIL: {source}: {error}")
    if args.source and source.resolve() != OUTPUT_FILE:
        shutil.copyfile(source, OUTPUT_FILE)  # byte-for-byte: the file stays identical to the export
        print(f"Installed {source} -> {OUTPUT_FILE}")
    print(f"PASS: {len(json.loads(OUTPUT_FILE.read_text()))} captures, {len(worlds)} worlds: {', '.join(worlds)}")


if __name__ == "__main__":
    main()
