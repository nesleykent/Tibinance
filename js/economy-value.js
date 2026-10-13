// Expected value per kill of a creature on a date, from the loot evidence, in either reconstruction mode.
//
// Two modes (correction 8):
//   latest-evidence  every sample's newest validated content and the newest NPC prices, applied by effective dates
//   point-in-time    only sample contents and price vintages whose wiki revision was available at the cutoff T, and
//                    not yet replaced by T; corrections published after T are invisible (correction 11)
// A sample "made after" version V is effective from V's release date (effectiveAt), whenever it was uploaded
// (availableAt). Selection rules for a kill day d (deterministic, documented in docs/economy.md):
//   strict    the samples effective on or before d; the latest by effective date (ties: more kills); the latest
//             with at least MIN_KILLS kills is preferred, else the latest is used and flagged low-sample; none means
//             the creature is unvalued on d (pre-sample), never backfilled
//   extended  as strict, but before the first effective sample the earliest sample applies (flagged backward)
//   pooled    the kill-weighted mean of every sample effective on or before d (assumes the loot did not change)
import { parseLootPage, valueSample } from './economy-loot.js';

export const MIN_KILLS = 100;

// Dotted client versions compared numerically on their numeric parts ("15.12.c7d92c" > "15.4" > "8.6").
export function compareVersions(a, b) {
  const pa = String(a).split('.'), pb = String(b).split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null, ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) { if (nx !== ny) return nx - ny; continue; }
    if (nx !== null) return 1;   // a numeric build after a hash build of the same minor version: order by digits first
    if (ny !== null) return -1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// The release date of a version: exact when its Updates page gives one; otherwise bounded below by the latest dated
// version not after it (the sample cannot predate it); unknown when no dated version precedes it.
export function versionDater(versions) {
  const exact = new Map(versions.filter(v => v.date).map(v => [v.version, v.date]));
  const dated = versions.filter(v => v.date).sort((a, b) => compareVersions(a.version, b.version));
  return version => {
    if (!version) return { date: null, basis: 'no version' };
    if (exact.has(version)) return { date: exact.get(version), basis: 'exact' };
    let bound = null;
    for (const v of dated) { if (compareVersions(v.version, version) <= 0) bound = v; else break; }
    return bound ? { date: bound.date, basis: 'version-date-bounded', boundVersion: bound.version } : { date: null, basis: 'unknown' };
  };
}

// The evidence visible at instant T (ISO) or, with T null, the latest: live sample contents and the price map.
export function evidenceAt(records, priceRecords, T = null) {
  const visible = r => T === null || r.availableAt <= T || r.revTimestamp <= T;
  const ended = new Set(records.filter(r => r.type === 'sample-ended' && (T === null || r.revTimestamp <= T)).map(r => `${r.sampleKey} ${r.contentSha256}`));
  const samples = new Map(); // sampleKey -> record, the latest live content
  for (const r of records) {
    if (r.type !== 'sample' || !visible(r) || ended.has(`${r.sampleKey} ${r.contentSha256}`)) continue;
    const have = samples.get(r.sampleKey);
    if (!have || have.revTimestamp < r.revTimestamp) samples.set(r.sampleKey, r);
  }
  const prices = new Map();
  let priceVintage = null;
  for (const p of [...priceRecords].sort((a, b) => (a.revTimestamp < b.revTimestamp ? -1 : 1))) {
    if (T !== null && p.revTimestamp > T) break;
    for (const [item, price] of Object.entries(p.changes)) price === null ? prices.delete(item) : prices.set(item, price);
    priceVintage = { revId: p.revId, revTimestamp: p.revTimestamp };
  }
  return { samples, prices, priceVintage, asOf: T };
}

// Per creature (loot page id), its candidate samples with effective dates and values per kill under these prices.
export function candidatesByCreature(evidence, dateOf) {
  const out = new Map();
  for (const r of evidence.samples.values()) {
    const v = valueSample(r, evidence.prices);
    if (v.total === null) continue;
    const eff = dateOf(r.version);
    const c = { sampleKey: r.sampleKey, contentSha256: r.contentSha256, revId: r.revId, version: r.version, kills: r.kills,
      effectiveAt: eff.date, effectiveBasis: eff.basis, availableAt: r.availableAt, directCoins: v.directCoins, npcPotential: v.npcPotential, unpriced: v.unpriced };
    if (!out.has(r.pageId)) out.set(r.pageId, []);
    out.get(r.pageId).push(c);
  }
  for (const list of out.values()) list.sort((a, b) => ((a.effectiveAt ?? '') < (b.effectiveAt ?? '') ? -1 : (a.effectiveAt ?? '') > (b.effectiveAt ?? '') ? 1 : b.kills - a.kills));
  return out;
}

// The value per kill of a creature on kill day d under a rule; null when unvalued.
export function valueOn(candidates, d, rule = 'strict', minKills = MIN_KILLS) {
  if (!candidates?.length) return null;
  const eligible = candidates.filter(c => c.effectiveAt && c.effectiveAt <= d);
  if (rule === 'pooled') {
    if (!eligible.length) return null;
    const k = eligible.reduce((s, c) => s + c.kills, 0);
    return { directCoins: eligible.reduce((s, c) => s + c.directCoins * c.kills, 0) / k, npcPotential: eligible.reduce((s, c) => s + c.npcPotential * c.kills, 0) / k,
      flags: ['pooled'], samples: eligible.map(c => c.sampleKey) };
  }
  if (!eligible.length) {
    if (rule !== 'extended') return null;
    const first = candidates.find(c => c.effectiveAt) ?? candidates[0];
    return { directCoins: first.directCoins, npcPotential: first.npcPotential, flags: ['backward'], samples: [first.sampleKey] };
  }
  // Latest effective date first; ties: more kills (the list is sorted that way, reversed here).
  const latestFirst = [...eligible].reverse().sort((a, b) => (a.effectiveAt > b.effectiveAt ? -1 : a.effectiveAt < b.effectiveAt ? 1 : b.kills - a.kills));
  const chosen = latestFirst.find(c => c.kills >= minKills) ?? latestFirst[0];
  const flags = [];
  if (chosen.kills < minKills) flags.push('low-sample');
  if (chosen.effectiveBasis !== 'exact') flags.push(chosen.effectiveBasis);
  return { directCoins: chosen.directCoins, npcPotential: chosen.npcPotential, flags, samples: [chosen.sampleKey] };
}

// The dates on which a creature's strict value changes (a sample becomes effective): where a series may move
// because of evidence rather than activity. Returned sorted, each with the sample that takes over.
export function changePoints(candidates) {
  return [...new Set((candidates ?? []).map(c => c.effectiveAt).filter(Boolean))].sort();
}

export { parseLootPage };
