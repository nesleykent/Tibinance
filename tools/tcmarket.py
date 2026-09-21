#!/usr/bin/env python3
"""
tcmarket - Tibia Coins market price database builder.

Pipeline (per screenshot):
    filename -> character name + capture timestamp
             -> TibiaData v4 /character/{name}   -> world
             -> TibiaData v4 /worlds (cached)    -> PvP type + BattlEye
             -> market rows (read from screenshot) -> best prices + volumes
             -> validated row stored in SQLite

Market rows are supplied as "amount@price" pairs, optionally with the
screenshot's Total Price column as "amount@price=total" which is then used
as an arithmetic cross-check against a misread digit.
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

API = "https://api.tibiadata.com/v4"
HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "tc_prices.db")
CACHE_PATH = os.path.join(HERE, ".api_cache.json")
WORLDS_TTL = 6 * 3600  # seconds


# --------------------------------------------------------------------------
# errors
# --------------------------------------------------------------------------
class PipelineError(Exception):
    pass


# --------------------------------------------------------------------------
# 1. filename -> character + timestamp
# --------------------------------------------------------------------------
FNAME_RE = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})_(?P<time>\d{6})(?P<frac>\d*)_(?P<rest>.+)$"
)


def parse_filename(path):
    """'2026-09-21_124317718_Royal Flyn_Hotkey.jpeg' -> (char, datetime)."""
    base = os.path.basename(path)
    stem = os.path.splitext(base)[0]
    m = FNAME_RE.match(stem)
    if not m:
        raise PipelineError(
            f"filename {base!r} does not match YYYY-MM-DD_HHMMSSmmm_Character_Suffix"
        )
    rest = m.group("rest")
    # character names may contain spaces but never underscores
    character = rest.split("_")[0].strip()
    if not character:
        raise PipelineError(f"could not extract a character name from {base!r}")
    t = m.group("time")
    captured = datetime.strptime(
        f"{m.group('date')} {t[0:2]}:{t[2:4]}:{t[4:6]}", "%Y-%m-%d %H:%M:%S"
    )
    return character, captured


# --------------------------------------------------------------------------
# 2-3. TibiaData lookups
# --------------------------------------------------------------------------
def _load_cache():
    try:
        with open(CACHE_PATH) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _save_cache(cache):
    tmp = CACHE_PATH + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(cache, fh)
    os.replace(tmp, CACHE_PATH)


def _get(url, retries=3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "tcmarket/1.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except Exception as exc:  # noqa: BLE001 - network flake, retry
            last = exc
            time.sleep(1.5 * (attempt + 1))
    if "502" in str(last):
        raise PipelineError(
            f"TibiaData returned 502 for {url} - the character name is most likely "
            "misspelled or does not exist (the API also 502s during an outage)"
        )
    raise PipelineError(f"TibiaData request failed: {url} ({last})")


def fetch_character(name):
    """Returns the character block. Always live - characters can transfer world."""
    url = f"{API}/character/{urllib.parse.quote(name)}"
    data = _get(url)
    char = (data.get("character") or {}).get("character") or {}
    if not char.get("name"):
        raise PipelineError(f"character {name!r} not found on TibiaData")
    return char


def fetch_worlds(force=False):
    """Returns {world_name: entry} from /v4/worlds, cached for WORLDS_TTL."""
    cache = _load_cache()
    entry = cache.get("worlds")
    if not force and entry and time.time() - entry["fetched_at"] < WORLDS_TTL:
        return entry["data"]
    data = _get(f"{API}/worlds")
    worlds = (data.get("worlds") or {}).get("regular_worlds") or []
    tourn = (data.get("worlds") or {}).get("tournament_worlds") or []
    mapping = {w["name"]: w for w in list(worlds) + list(tourn)}
    if not mapping:
        raise PipelineError("TibiaData returned an empty worlds list")
    cache["worlds"] = {"fetched_at": time.time(), "data": mapping}
    _save_cache(cache)
    return mapping


# --------------------------------------------------------------------------
# 5-6. server type + BattlEye
# --------------------------------------------------------------------------
def battleye_color(world_entry):
    """
    Derived from authoritative TibiaData fields, never guessed:
      battleye_protected == False -> Off
      battleye_date == "release"  -> Green (protected since the world's release)
      explicit date               -> Yellow (protected from that date onward)
    """
    if not world_entry.get("battleye_protected"):
        return "Off", None
    date = (world_entry.get("battleye_date") or "").strip()
    if date.lower() == "release":
        return "Green", "release"
    if date:
        return "Yellow", date
    raise PipelineError(
        f"world {world_entry.get('name')!r}: protected but no battleye_date - cannot derive colour"
    )


def resolve_world(world_name):
    worlds = fetch_worlds()
    entry = worlds.get(world_name)
    if entry is None:
        entry = fetch_worlds(force=True).get(world_name)
    if entry is None:
        raise PipelineError(f"world {world_name!r} not present in TibiaData worlds list")
    colour, be_date = battleye_color(entry)
    return {
        "world": entry["name"],
        "pvp_type": entry["pvp_type"],   # source terminology, verbatim
        "battleye": colour,
        "battleye_date": be_date,
    }


# --------------------------------------------------------------------------
# 7-11. market rows -> best prices + volumes
# --------------------------------------------------------------------------
ROW_RE = re.compile(r"^\s*([\d.,]+)\s*@\s*([\d.,]+)\s*(?:=\s*([\d.,]+)\s*)?$")


def _num(s):
    return int(re.sub(r"[.,\s]", "", s))


def parse_rows(spec, side):
    """'30075@48784=1467178800,8925@48785' -> [{amount, price, total}]"""
    rows = []
    if not spec:
        return rows
    for chunk in spec.split(","):
        if not chunk.strip():
            continue
        m = ROW_RE.match(chunk)
        if not m:
            raise PipelineError(f"{side} row {chunk.strip()!r} is not 'amount@price[=total]'")
        amount, price, total = _num(m.group(1)), _num(m.group(2)), m.group(3)
        if amount <= 0 or price <= 0:
            raise PipelineError(f"{side} row {chunk.strip()!r}: amount and price must be > 0")
        rows.append(
            {"amount": amount, "price": price, "total": _num(total) if total else None}
        )
    return rows


def analyse(sell_rows, buy_rows):
    """Computes best prices and volumes, and returns any validation warnings."""
    warnings = []
    if not sell_rows:
        raise PipelineError("no Sell offers given (step 8/10 need at least one row)")
    if not buy_rows:
        raise PipelineError("no Buy offers given (step 9/11 need at least one row)")

    # cross-check against the screenshot's Total Price column where provided
    for side, rows in (("sell", sell_rows), ("buy", buy_rows)):
        for i, r in enumerate(rows, 1):
            if r["total"] is not None and r["amount"] * r["price"] != r["total"]:
                warnings.append(
                    f"{side} row {i}: {r['amount']:,} x {r['price']:,} = "
                    f"{r['amount'] * r['price']:,} but screenshot total reads "
                    f"{r['total']:,} - re-read this row"
                )

    best_sell = min(r["price"] for r in sell_rows)   # cheapest coins you can buy
    best_buy = max(r["price"] for r in buy_rows)     # highest someone pays
    sell_volume = sum(r["amount"] for r in sell_rows)
    buy_volume = sum(r["amount"] for r in buy_rows)

    if sell_rows[0]["price"] != best_sell:
        warnings.append(
            f"first Sell row ({sell_rows[0]['price']:,}) is not the best Sell price "
            f"({best_sell:,}) - the market is normally sorted, verify the read"
        )
    if buy_rows[0]["price"] != best_buy:
        warnings.append(
            f"first Buy row ({buy_rows[0]['price']:,}) is not the best Buy price "
            f"({best_buy:,}) - the market is normally sorted, verify the read"
        )
    if best_buy >= best_sell:
        warnings.append(
            f"crossed market: best Buy {best_buy:,} >= best Sell {best_sell:,} - "
            "these offers would have matched, so at least one price is misread"
        )
    for side, rows in (("sell", sell_rows), ("buy", buy_rows)):
        prices = [r["price"] for r in rows]
        if max(prices) > 3 * min(prices):
            warnings.append(f"{side} prices span more than 3x - check for a digit misread")

    stats = {
        "sell": best_sell,
        "buy": best_buy,
        "sell_volume": sell_volume,
        "buy_volume": buy_volume,
        "sell_rows": len(sell_rows),
        "buy_rows": len(buy_rows),
        "spread": best_sell - best_buy,
    }
    return stats, warnings


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS observations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    world         TEXT NOT NULL,
    pvp_type      TEXT NOT NULL,
    battleye      TEXT NOT NULL,
    battleye_date TEXT,
    sell          INTEGER NOT NULL,
    sell_volume   INTEGER NOT NULL,
    sell_rows     INTEGER NOT NULL,
    buy           INTEGER NOT NULL,
    buy_volume    INTEGER NOT NULL,
    buy_rows      INTEGER NOT NULL,
    captured_at   TEXT NOT NULL,
    character     TEXT NOT NULL,
    source_file   TEXT NOT NULL,
    raw_sell      TEXT NOT NULL,
    raw_buy       TEXT NOT NULL,
    added_at      TEXT NOT NULL,
    UNIQUE (world, captured_at, source_file)
);
CREATE INDEX IF NOT EXISTS idx_world_time ON observations (world, captured_at);
"""


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def store(conn, rec, replace=False):
    verb = "INSERT OR REPLACE" if replace else "INSERT"
    cols = ("world", "pvp_type", "battleye", "battleye_date", "sell", "sell_volume",
            "sell_rows", "buy", "buy_volume", "buy_rows", "captured_at", "character",
            "source_file", "raw_sell", "raw_buy", "added_at")
    try:
        conn.execute(
            f"{verb} INTO observations ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
            [rec[c] for c in cols],
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


# --------------------------------------------------------------------------
# output
# --------------------------------------------------------------------------
HEADER = ("| World | Type | BattlEye | Sell (gp/TC) | Sell Volume (TC) | "
          "Buy (gp/TC) | Buy Volume (TC) | Capture |\n"
          "|---|---|---|---:|---:|---:|---:|---|")

SI_GROUP = "\u202f"  # ISO 80000-1: groups of three, thin space, never a comma


def si(n):
    return f"{n:,}".replace(",", SI_GROUP)


def fmt_capture(iso):
    """ISO 8601 extended format, unchanged from how it is stored."""
    return datetime.fromisoformat(iso).isoformat()


def row_md(r):
    return (f"| {r['world']} | {r['pvp_type']} | {r['battleye']} | {si(r['sell'])} | "
            f"{si(r['sell_volume'])} | {si(r['buy'])} | {si(r['buy_volume'])} | "
            f"{fmt_capture(r['captured_at'])} |")


def table_md(rows):
    if not rows:
        return "_no observations stored yet_"
    return "\n".join([HEADER] + [row_md(r) for r in rows])


# --------------------------------------------------------------------------
# the pipeline
# --------------------------------------------------------------------------
def process(source, sell_spec, buy_spec, character_override=None):
    character, captured = parse_filename(source)
    if character_override:
        character = character_override

    sell_rows = parse_rows(sell_spec, "sell")
    buy_rows = parse_rows(buy_spec, "buy")
    stats, warnings = analyse(sell_rows, buy_rows)

    char = fetch_character(character)          # step 2 - executed, never inferred
    world_info = resolve_world(char["world"])  # steps 3-6

    rec = {
        **world_info,
        **{k: stats[k] for k in ("sell", "sell_volume", "sell_rows",
                                 "buy", "buy_volume", "buy_rows")},
        "captured_at": captured.isoformat(),
        "character": char["name"],
        "source_file": os.path.basename(source),
        "raw_sell": json.dumps(sell_rows),
        "raw_buy": json.dumps(buy_rows),
        "added_at": datetime.now().isoformat(timespec="seconds", sep=" "),
    }
    return rec, stats, warnings, sell_rows, buy_rows


def report(rec, stats, sell_rows, buy_rows, warnings_only=False):
    out = []
    ssum = " + ".join(f"{r['amount']:,}" for r in sell_rows)
    bsum = " + ".join(f"{r['amount']:,}" for r in buy_rows)
    out.append(f"  character {rec['character']} -> world {rec['world']} "
               f"({rec['pvp_type']}, BattlEye {rec['battleye']}"
               f"{'' if rec['battleye_date'] in (None, 'release') else ' since ' + rec['battleye_date']})")
    out.append(f"  sell  {stats['sell_rows']} rows: {ssum} = {stats['sell_volume']:,} TC "
               f"| best {stats['sell']:,}")
    out.append(f"  buy   {stats['buy_rows']} rows: {bsum} = {stats['buy_volume']:,} TC "
               f"| best {stats['buy']:,}")
    out.append(f"  spread {stats['spread']:,} gp/TC")
    return "\n".join(out)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def cmd_add(args):
    conn = db()
    entries = []
    if args.json:
        with open(args.json) as fh:
            payload = json.load(fh)
        entries = payload if isinstance(payload, list) else [payload]
    else:
        entries = [{"file": args.file, "sell": args.sell, "buy": args.buy,
                    "character": args.character}]

    stored, skipped, problems = [], [], []
    for e in entries:
        src = e.get("file") or e.get("source") or ""
        try:
            rec, stats, warn, srows, brows = process(
                src, e.get("sell"), e.get("buy"), e.get("character")
            )
        except PipelineError as exc:
            problems.append(f"{os.path.basename(src) or '<no file>'}: {exc}")
            continue

        print(f"\n{os.path.basename(src)}")
        print(report(rec, stats, srows, brows))
        for w in warn:
            print(f"  ! {w}")
        if warn and not args.force:
            problems.append(f"{os.path.basename(src)}: not stored, "
                            f"{len(warn)} validation warning(s) - re-read or pass --force")
            continue
        if args.dry_run:
            skipped.append(rec)
            continue
        if store(conn, rec, replace=args.replace):
            stored.append(rec)
        else:
            skipped.append(rec)
            problems.append(f"{os.path.basename(src)}: already in the database "
                            f"(same world+capture+file) - pass --replace to overwrite")

    rows = stored or skipped
    if rows:
        print("\n" + table_md(rows))
    if problems:
        print("\nATTENTION:")
        for p in problems:
            print(f"  - {p}")
    return 1 if problems else 0


def cmd_table(args):
    conn = db()
    q = "SELECT * FROM observations"
    where, params = [], []
    if args.world:
        where.append("world = ?")
        params.append(args.world)
    if args.since:
        where.append("captured_at >= ?")
        params.append(args.since)
    if args.battleye:
        where.append("battleye = ?")
        params.append(args.battleye)
    if args.type:
        where.append("pvp_type = ?")
        params.append(args.type)
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY captured_at DESC, world ASC"
    rows = conn.execute(q, params).fetchall()

    if args.latest:
        seen, keep = set(), []
        for r in rows:
            if r["world"] not in seen:
                seen.add(r["world"])
                keep.append(r)
        rows = keep
    if args.sort == "sell":
        rows = sorted(rows, key=lambda r: r["sell"])
    elif args.sort == "buy":
        rows = sorted(rows, key=lambda r: -r["buy"])
    elif args.sort == "world":
        rows = sorted(rows, key=lambda r: r["world"])

    if args.csv:
        import csv
        w = csv.writer(sys.stdout)
        w.writerow(["World", "Type", "BattlEye", "Sell", "Sell Volume", "Buy",
                    "Buy Volume", "Capture"])
        for r in rows:
            w.writerow([r["world"], r["pvp_type"], r["battleye"], r["sell"],
                        r["sell_volume"], r["buy"], r["buy_volume"],
                        fmt_capture(r["captured_at"])])
    else:
        print(table_md(rows))
        print(f"\n{len(rows)} observation(s)")
    return 0


def cmd_worlds(args):
    worlds = fetch_worlds(force=args.refresh)
    names = sorted(worlds) if not args.world else [args.world]
    for n in names:
        e = worlds.get(n)
        if not e:
            print(f"{n}: not found")
            continue
        colour, date = battleye_color(e)
        print(f"{e['name']:<14} {e['pvp_type']:<20} BattlEye {colour}"
              f"{'' if date in (None, 'release') else ' (' + date + ')'}")
    return 0


def main():
    p = argparse.ArgumentParser(prog="tcmarket", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="run the full pipeline for one screenshot or a JSON batch")
    a.add_argument("file", nargs="?", help="screenshot filename or path")
    a.add_argument("--sell", help="'amount@price[=total],...' for every visible Sell row")
    a.add_argument("--buy", help="'amount@price[=total],...' for every visible Buy row")
    a.add_argument("--json", help="batch file: [{file, sell, buy}, ...]")
    a.add_argument("--character", help="override the character parsed from the filename")
    a.add_argument("--dry-run", action="store_true", help="compute and print, store nothing")
    a.add_argument("--force", action="store_true", help="store even with validation warnings")
    a.add_argument("--replace", action="store_true", help="overwrite an existing identical row")
    a.set_defaults(func=cmd_add)

    t = sub.add_parser("table", help="print the consolidated table")
    t.add_argument("--world")
    t.add_argument("--since", help="ISO datetime lower bound, e.g. 2026-09-01")
    t.add_argument("--battleye", choices=["Green", "Yellow", "Off"])
    t.add_argument("--type", help="exact PvP type, e.g. 'Optional PvP'")
    t.add_argument("--latest", action="store_true", help="keep only the newest row per world")
    t.add_argument("--sort", choices=["time", "sell", "buy", "world"], default="time")
    t.add_argument("--csv", action="store_true")
    t.set_defaults(func=cmd_table)

    w = sub.add_parser("worlds", help="show resolved PvP type + BattlEye for worlds")
    w.add_argument("world", nargs="?")
    w.add_argument("--refresh", action="store_true", help="bypass the 6h cache")
    w.set_defaults(func=cmd_worlds)

    args = p.parse_args()
    try:
        return args.func(args)
    except PipelineError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
