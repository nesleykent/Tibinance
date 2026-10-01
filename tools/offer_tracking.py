"""Anonymous offer identities and capture observations for the CLI."""
import re
import uuid
from datetime import datetime

PROCESSING_VERSION = 1
SCHEMA = """
CREATE TABLE IF NOT EXISTS offers (
    uuid TEXT PRIMARY KEY, world TEXT NOT NULL, side TEXT NOT NULL,
    price INTEGER NOT NULL, ends_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offer_identity ON offers(world, side, price, ends_at);
CREATE TABLE IF NOT EXISTS offer_observations (
    capture_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    side TEXT NOT NULL, row_index INTEGER NOT NULL,
    offer_uuid TEXT REFERENCES offers(uuid), amount INTEGER NOT NULL,
    price INTEGER NOT NULL, total INTEGER, ends_at TEXT,
    match_ambiguous INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(capture_id, side, row_index), UNIQUE(capture_id, offer_uuid)
);
"""


def normalize_ends_at(value):
    if value is None or value == "":
        return None
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})[T, ]\s*(\d{2}:\d{2}:\d{2})", str(value).strip())
    if not match:
        raise ValueError("Ends At must be YYYY-MM-DDTHH:MM:SS without a timezone")
    text = f"{match[1]}T{match[2]}"
    return datetime.fromisoformat(text).isoformat(timespec="seconds")


def persist_offers(conn, capture_id, world, rows):
    """One-to-one observable matching; collisions remain explicitly ambiguous."""
    old = {(r["side"], r["row_index"]): r for r in conn.execute(
        "SELECT * FROM offer_observations WHERE capture_id=?", (capture_id,))}
    prepared, used, groups = [], set(), {}
    for side in ("sell", "buy"):
        for index, row in enumerate(rows[side]):
            ends = normalize_ends_at(row.get("endsAt"))
            entry = {"side": side, "index": index, "amount": row["amount"],
                     "price": row["price"], "total": row.get("total"),
                     "ends": ends, "uuid": None, "ambiguous": False}
            prior = old.get((side, index))
            if ends and prior and prior["price"] == row["price"] and prior["ends_at"] == ends:
                entry["uuid"] = prior["offer_uuid"]
                used.add(entry["uuid"])
            if ends:
                groups.setdefault((side, row["price"], ends), []).append(entry)
            prepared.append(entry)
    if any(r["offer_uuid"] for r in old.values()) and any(not r["ends"] for r in prepared):
        raise ValueError("Correct all Ends At fields before replacing tracked observations")
    for side in ("sell", "buy"):
        tracked = sum(r["side"] == side and bool(r["offer_uuid"]) for r in old.values())
        if sum(r["side"] == side and bool(r["ends"]) for r in prepared) < tracked:
            raise ValueError("Reprocessing omitted tracked offers; restore missing rows")
    for (side, price, ends), group in groups.items():
        candidates = list(conn.execute(
            "SELECT uuid FROM offers WHERE world=? COLLATE NOCASE AND side=? AND price=? AND ends_at=? ORDER BY uuid",
            (world, side, price, ends)))
        for entry in group:
            if not entry["uuid"]:
                entry["uuid"] = next((r["uuid"] for r in candidates if r["uuid"] not in used), str(uuid.uuid4()))
                used.add(entry["uuid"])
            entry["ambiguous"] = len(group) > 1 or len(candidates) > 1
            conn.execute("INSERT OR IGNORE INTO offers VALUES(?,?,?,?,?)",
                         (entry["uuid"], world, side, price, ends))
        if len(group) > 1 or len(candidates) > 1:
            conn.execute("""UPDATE offer_observations SET match_ambiguous=1 WHERE offer_uuid IN
                (SELECT uuid FROM offers WHERE world=? COLLATE NOCASE AND side=? AND price=? AND ends_at=?)""",
                         (world, side, price, ends))
    conn.execute("DELETE FROM offer_observations WHERE capture_id=?", (capture_id,))
    for r in prepared:
        conn.execute("INSERT INTO offer_observations VALUES(?,?,?,?,?,?,?,?,?)",
                     (capture_id, r["side"], r["index"], r["uuid"], r["amount"], r["price"],
                      r["total"], r["ends"], int(r["ambiguous"])))
    conn.execute("DELETE FROM offers WHERE uuid NOT IN (SELECT offer_uuid FROM offer_observations WHERE offer_uuid IS NOT NULL)")


def export_offers(conn, world=None):
    where = "WHERE c.world=? COLLATE NOCASE" if world else ""
    return [dict(r) for r in conn.execute(f"""
        SELECT c.world, r.side, r.offer_uuid AS offerId, c.captured_at AS capturedAt,
            c.screenshot_hash AS hash, r.row_index AS rowIndex, r.amount, r.price,
            r.total, r.ends_at AS endsAt, r.match_ambiguous AS matchAmbiguous,
            c.processing_version AS processingVersion
        FROM offer_observations r JOIN observations c ON c.id=r.capture_id
        {where} ORDER BY c.world, c.captured_at, r.side, r.row_index
    """, (world,) if world else ())]
