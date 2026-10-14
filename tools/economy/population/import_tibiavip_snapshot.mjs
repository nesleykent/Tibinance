// A TibiaVIP worlds page saved by hand (as PDF or text), imported as one dated snapshot (Stage D).
//
//   swift tools/economy/population/pdf_text.swift "Worlds - TibiaVIP.pdf" > /tmp/tibiavip.txt
//   node tools/economy/population/import_tibiavip_snapshot.mjs /tmp/tibiavip.txt --observed-at 2026-10-13T19:36:43Z \
//     --source-file "Worlds - TibiaVIP.pdf" --source-sha256 <sha256 of the saved file>
//
// TibiaVIP (tibiavip.app/worlds) lists per world: Online (characters online when the page was made), Total (all
// characters TibiaVIP knows on the world, inactive ones included: Gladibra shows 163,790 with 24 online) and Guilds.
// These keep TibiaVIP's own meanings. "Total" is not an active population, and characters are not players. A
// snapshot is one instant; it supports cross-world comparison at that instant, not a history. TibiaVIP's
// active-population estimates (activity windows) are not on this page and remain an open requirement.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const OUT = join(ROOT, 'data/economy/population/tibiavip-snapshot');
const ROW = /^([A-Z][a-z]+)\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+(North America|South America|Europe|Oceania)\s+(.+?)\s*$/;
const num = s => Number(s.replace(/,/g, ''));

export function parseWorlds(text) {
  const rows = text.split('\n').map(l => l.match(ROW)).filter(Boolean)
    .map(m => ({ world: m[1], online: num(m[2]), knownCharacters: num(m[3]), guilds: num(m[4]), location: m[5], pvpType: m[6] }));
  const stated = Number(text.match(/(\d+) worlds found/)?.[1] ?? NaN);
  return { rows, stated };
}

function main() {
  const args = process.argv.slice(2);
  const value = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const [file] = args;
  const observedAt = value('--observed-at');
  if (!file || !observedAt) throw new Error('usage: import_tibiavip_snapshot.mjs <text> --observed-at <ISO> [--source-file <name>] [--source-sha256 <hex>]');
  const { rows, stated } = parseWorlds(readFileSync(file, 'utf8'));
  if (rows.length !== stated) throw new Error(`parsed ${rows.length} worlds but the page states ${stated}`);
  const observations = rows.flatMap(r => [
    { world: r.world, metric: 'characters-online', value: r.online },
    { world: r.world, metric: 'characters-known-total', value: r.knownCharacters },
    { world: r.world, metric: 'guilds', value: r.guilds },
  ].map(o => ({ ...o, observedAt, interval: 'instant', availableAt: observedAt, availability: 'exact' })));
  const doc = { format: 1, source: 'tibiavip-snapshot', page: 'https://tibiavip.app/worlds', observedAt,
    savedFile: { name: value('--source-file'), sha256: value('--source-sha256'), savedBy: 'project owner, in a browser' },
    definitions: { 'characters-online': 'characters online when TibiaVIP made the page', 'characters-known-total': 'all characters TibiaVIP knows on the world, inactive ones included; not an active population', guilds: 'guilds on the world' },
    worldFacts: rows.map(({ world, location, pvpType }) => ({ world, location, pvpType })), observations };
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${observedAt.slice(0, 10)}.json`);
  if (existsSync(path)) throw new Error(`${path} exists: snapshots are never overwritten`);
  writeFileSync(path, JSON.stringify(doc, null, 1) + '\n');
  console.log(`${path}: ${rows.length} worlds`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
