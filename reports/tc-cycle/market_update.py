"""Prepare the dated Market snapshot without changing the 23 Sep research baseline.

The CSV and JSON are independent exports of the same captures. Cross-check every
shared field, retain the richer JSON's Amount at the best Piece Price, and use
only different capture dates for a short-term price comparison.
"""

import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
JSON_FILE = ROOT / "inputs/observations-3.json"
CSV_FILE = ROOT / "inputs/observations-2.csv"
OLD_FILE = ROOT / "inputs/observations-2.json"
RESULTS_FILE = ROOT / "results.json"
OUTPUT_FILE = ROOT / "market-update.json"

CSV_FIELDS = {
    "world": "World",
    "type": "Type",
    "battleye": "BattlEye",
    "sell": "Sell (gp/TC)",
    "sellVolume": "Sell Volume (TC)",
    "goldDemand": "Gold Demand (gp)",
    "buy": "Buy (gp/TC)",
    "buyVolume": "Buy Volume (TC)",
    "goldSupply": "Gold Supply (gp)",
    "capturedAt": "Capture",
    "hash": "Hash",
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare_csv_json(captures, csv_rows):
    assert len(captures) == len(csv_rows), "CSV/JSON row counts differ"
    by_hash = {row["Hash"]: row for row in csv_rows}
    assert len(by_hash) == len(csv_rows), "CSV duplicate hashes"
    assert set(by_hash) == {row["hash"] for row in captures}, "CSV/JSON capture hashes differ"
    for capture in captures:
        row = by_hash[capture["hash"]]
        for json_key, csv_key in CSV_FIELDS.items():
            value = int(row[csv_key]) if isinstance(capture[json_key], int) else row[csv_key]
            assert capture[json_key] == value, f"CSV/JSON mismatch: {capture['hash']} {json_key}"
        assert capture["sell"] > capture["buy"] > 0, f"Invalid offer prices: {capture['hash']}"
        for side in ("sell", "buy"):
            assert 0 < capture[f"{side}TopAmount"] <= capture[f"{side}Volume"], (
                f"Invalid Amount at best Piece Price: {capture['hash']}"
            )
        datetime.fromisoformat(capture["capturedAt"])


def compact(capture):
    return {
        "capturedAt": capture["capturedAt"],
        "sell": capture["sell"],
        "buy": capture["buy"],
        "sellTopAmount": capture["sellTopAmount"],
        "buyTopAmount": capture["buyTopAmount"],
        "sellVolume": capture["sellVolume"],
        "buyVolume": capture["buyVolume"],
        "goldDemand": capture["goldDemand"],
        "goldSupply": capture["goldSupply"],
        "hash": capture["hash"],
    }


def prepare():
    captures = json.loads(JSON_FILE.read_text())
    with CSV_FILE.open(newline="") as stream:
        csv_rows = list(csv.DictReader(stream))
    old = json.loads(OLD_FILE.read_text())
    results = json.loads(RESULTS_FILE.read_text())

    compare_csv_json(captures, csv_rows)
    old_by_hash = {row["hash"]: row for row in old}
    new_by_hash = {row["hash"]: row for row in captures}
    assert len(new_by_hash) == len(captures), "JSON duplicate hashes"
    assert all(new_by_hash.get(key) == value for key, value in old_by_hash.items()), (
        "The new observations changed or omitted a research-baseline capture"
    )

    by_world = defaultdict(list)
    for row in captures:
        by_world[row["world"]].append(row)
    as_of = max(row["capturedAt"][:10] for row in captures)
    worlds = []
    for baseline in results["worlds"]:
        world = baseline["world"]
        rows = sorted(by_world.pop(world, []), key=lambda row: row["capturedAt"])
        if rows:
            # Keep the last capture of each observed calendar day. Capture
            # timestamps have no timezone, so neither do these comparisons.
            daily = {row["capturedAt"][:10]: row for row in rows}
            series = [compact(daily[day]) for day in sorted(daily)]
            latest = series[-1]
            prior = series[-2] if len(series) > 1 else None
            source = "Market capture"
        else:
            latest = {
                "capturedAt": baseline["date"],
                "sell": baseline["ask"],
                "buy": baseline["bid"],
                "sellTopAmount": None,
                "buyTopAmount": None,
                "sellVolume": None,
                "buyVolume": None,
                "goldDemand": None,
                "goldSupply": None,
                "hash": None,
            }
            series, prior, source = [], None, "TibiaMarket API"
        latest_day = date.fromisoformat(latest["capturedAt"][:10])
        delta = {
            side: (latest[side] / prior[side] - 1) * 100 if prior else None
            for side in ("sell", "buy")
        }
        worlds.append({
            "world": world,
            "type": baseline.get("type"),
            "battleye": baseline.get("battleye"),
            "source": source,
            "latest": latest,
            "prior": prior,
            "deltaPct": delta,
            "elapsedDays": (latest_day - date.fromisoformat(prior["capturedAt"][:10])).days if prior else None,
            "ageDays": (date.fromisoformat(as_of) - latest_day).days,
            "captureCount": len(rows),
            "dailyCaptures": series,
        })
    assert not by_world, f"Unrecognized worlds: {sorted(by_world)}"

    return {
        "asOf": as_of,
        "researchAsOf": results["asOf"],
        "captureCount": len(captures),
        "newCaptureCount": len(captures) - len(old),
        "worlds": worlds,
        "sources": [
            {"file": str(path.relative_to(ROOT)), "sha256": sha(path)}
            for path in (JSON_FILE, CSV_FILE, OLD_FILE, RESULTS_FILE)
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify market-update.json is reproducible")
    args = parser.parse_args()
    content = json.dumps(prepare(), ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.check:
        assert OUTPUT_FILE.read_text() == content, "market-update.json differs from the inputs"
        print("PASS: current Market update matches both exports and the frozen research inputs")
    else:
        OUTPUT_FILE.write_text(content)
        print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
