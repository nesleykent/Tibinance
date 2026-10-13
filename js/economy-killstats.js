// Kill-statistics partitions: one world and one month of daily creature kills, compact and exact.
//
// A partition is gzip(JSON header line + "\n" + body). The header names the world, the month, its days (each with the
// upstream file's date, SHA-256 and git blob), the days recovered from the weekly counter, and the size of the race
// dictionary it uses. The body holds, for each day in header order, the number of rows and then each row as varints:
// the race id as a delta from the previous row's (rows sorted by race id), last_day_killed, last_day_players_killed.
// Race ids index an append-only dictionary (data/economy/sources/races.json), so ids never change meaning.
//
// Partitions live only in caches (.cache/economy/killstats/, local or GitHub Actions) and are rebuilt from the pinned
// upstream repositories; the repository commits their SHA-256 digests, never the partitions themselves.

export function encodeBody(days) {
  const out = [];
  const varint = n => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`not a non-negative integer: ${n}`);
    while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
    out.push(n);
  };
  for (const day of days) {
    const rows = [...day.rows].sort((a, b) => a[0] - b[0]);
    varint(rows.length);
    let prev = 0;
    for (const [race, killed, players] of rows) {
      if (race < prev) throw new Error('duplicate race in a day');
      varint(race - prev); prev = race;
      varint(killed); varint(players);
    }
  }
  return Uint8Array.from(out);
}

export function decodeBody(bytes, dayCount) {
  let at = 0;
  const varint = () => {
    let n = 0, scale = 1, b;
    do { b = bytes[at++]; if (b === undefined) throw new Error('truncated partition body'); n += (b & 127) * scale; scale *= 128; } while (b & 128);
    return n;
  };
  const days = [];
  for (let d = 0; d < dayCount; d++) {
    const n = varint(), rows = [];
    let race = 0;
    for (let i = 0; i < n; i++) { race += varint(); rows.push([race, varint(), varint()]); }
    days.push(rows);
  }
  if (at !== bytes.length) throw new Error('trailing bytes in a partition body');
  return days;
}

// Header line and body as one byte array (to be gzipped by the caller's zlib).
export function packPartition(header, days) {
  const head = new TextEncoder().encode(JSON.stringify(header) + '\n');
  const body = encodeBody(days);
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0); out.set(body, head.length);
  return out;
}

export function unpackPartition(bytes) {
  const nl = bytes.indexOf(10);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, nl)));
  const rows = decodeBody(bytes.subarray(nl + 1), header.days.length);
  return { header, days: header.days.map((d, i) => ({ ...d, rows: rows[i] })) };
}

// The day before a date (the kill-statistics day a file reports: collected about 04:00 Europe/Berlin on its date,
// it covers the previous day; the exact window boundaries are CipSoft's and unpublished).
export function previousDay(iso) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

export function addDays(iso, k) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
}

// Days between two dates (inclusive) that have no file: the gaps, never filled by interpolation.
export function missingDates(dates) {
  const have = new Set(dates), sorted = [...have].sort(), out = [];
  if (!sorted.length) return out;
  for (let d = sorted[0]; d <= sorted.at(-1); d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
}

// Exact recovery of one missing file from the weekly counter: last_week_killed of file F equals the sum of
// last_day_killed over files F-6..F (verified upstream: 1,396 of 1,396 races). If D is the only missing file in F's
// window, D's kills are F's weekly counter minus the other six days. Returns rows, or null when not recoverable.
export function recoverDay(missing, laterFile, dayRows) {
  const window = Array.from({ length: 7 }, (_, k) => addDays(laterFile.date, -k));
  if (!window.includes(missing)) return null;
  const others = window.filter(d => d !== missing);
  if (others.some(d => d !== laterFile.date && !dayRows.has(d))) return null;
  const sum = new Map();
  for (const d of others) {
    const rows = d === laterFile.date ? laterFile.dayRows : dayRows.get(d);
    for (const [race, killed, players] of rows) {
      const s = sum.get(race) ?? [0, 0];
      sum.set(race, [s[0] + killed, s[1] + players]);
    }
  }
  const out = [];
  for (const [race, weekKilled, weekPlayers] of laterFile.weekRows) {
    const s = sum.get(race) ?? [0, 0];
    const killed = weekKilled - s[0], players = weekPlayers - s[1];
    if (killed < 0 || players < 0) return null; // inconsistent counters: not recoverable, never forced
    if (killed || players) out.push([race, killed, players]);
  }
  // A race counted on other days but absent from the weekly list makes the counters inconsistent.
  for (const [race] of sum) if (!laterFile.weekRows.some(r => r[0] === race)) return null;
  return out.sort((a, b) => a[0] - b[0]);
}
