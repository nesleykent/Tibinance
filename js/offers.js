// Timestamps are the client's displayed clock. Never invent an offset.
export const PROCESSING_VERSION = 1;
export function normalizeEndsAt(value) {
  const m = /^(\d{4}-\d{2}-\d{2})[T, ]\s*(\d{2}:\d{2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}`;
  const date = new Date(`${iso}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === iso ? iso : null;
}

export function extractEndsAt(text) {
  // A date crop may also catch scrollbar glyphs. Require one complete timestamp
  // (including seconds), validate its calendar, and ignore surrounding noise.
  const matches = String(text ?? '').match(/(?<!\d)\d{4}-\d{2}-\d{2}[T, ]\s*\d{2}:\d{2}:\d{2}(?!\d)/g) ?? [];
  return matches.length === 1 ? normalizeEndsAt(matches[0]) : null;
}

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const offerKey = (world, r) => JSON.stringify([world.trim().toLowerCase(), r.side, r.price, r.endsAt]);

/** A capture contains observations; offerId is the canonical entity reference.
 * Colliding identities use one-to-one assignments, never amount as identity.
 * Their assignment is explicitly ambiguous, even when quantities agree.
 */
export function matchOffers(world, input, captures = [], previous = []) {
  const catalog = new Map(), identities = new Map(), slots = new Set();
  for (const capture of captures) for (const r of capture.offers ?? []) {
    if (!r.offerId || !r.endsAt) continue;
    const key = offerKey(capture.world, r);
    if (identities.has(r.offerId) && identities.get(r.offerId) !== key) throw new Error('Offer UUID has conflicting identities');
    identities.set(r.offerId, key);
    if (!catalog.has(key)) catalog.set(key, new Map());
    catalog.get(key).set(r.offerId, r);
  }
  const rows = input.map(r => {
    if (!['sell', 'buy'].includes(r.side) || !Number.isSafeInteger(r.rowIndex) || r.rowIndex < 0) throw new Error('Invalid offer row');
    const slot = `${r.side}:${r.rowIndex}`;
    if (slots.has(slot)) throw new Error('Duplicate offer row');
    slots.add(slot);
    if (![r.amount, r.price].every(v => Number.isSafeInteger(v) && v > 0)) throw new Error('Invalid offer amount or price');
    if (r.total != null && (!Number.isSafeInteger(r.total) || r.total < 0)) throw new Error('Invalid offer total');
    return { side: r.side, rowIndex: r.rowIndex, amount: r.amount, price: r.price,
      total: r.total ?? null, endsAt: normalizeEndsAt(r.endsAt), offerId: null,
      matchAmbiguous: false };
  });
  const used = new Set();
  // Reserve explicit import IDs and previous same-capture assignments first.
  rows.forEach((r, i) => {
    if (!r.endsAt) return;
    const key = offerKey(world, r);
    const old = previous.find(p => p.side === r.side && p.rowIndex === r.rowIndex && offerKey(world, p) === key);
    const incomingId = input[i].offerId;
    if (incomingId && identities.has(incomingId) && identities.get(incomingId) !== key) throw new Error('Conflicting offer UUID');
    const id = old?.offerId ?? (catalog.has(key) && !identities.has(incomingId) ? null : incomingId);
    if (!id) return;
    if (!uuid(id) || used.has(id) || (identities.has(id) && identities.get(id) !== key)) throw new Error('Invalid or conflicting offer UUID');
    r.offerId = id;
    used.add(id);
  });
  const groups = new Map();
  for (const r of rows) {
    if (!r.endsAt) continue;
    const key = offerKey(world, r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, group] of groups) {
    const candidates = [...(catalog.get(key)?.values() ?? [])].sort((a, b) => a.offerId.localeCompare(b.offerId));
    // Exact quantities help choose between candidates, but do not establish identity.
    for (const r of group.filter(r => !r.offerId)) {
      const c = candidates.find(c => !used.has(c.offerId) && c.amount === r.amount);
      if (c) { r.offerId = c.offerId; used.add(c.offerId); }
    }
    for (const r of group) {
      if (!r.offerId) {
        const supplied = input.find(p => p.side === r.side && p.rowIndex === r.rowIndex)?.offerId;
        r.offerId = candidates.find(c => !used.has(c.offerId))?.offerId ??
          (supplied && uuid(supplied) && !used.has(supplied) ? supplied : crypto.randomUUID());
        used.add(r.offerId);
      }
      r.matchAmbiguous = group.length > 1 || candidates.length > 1 || candidates.some(c => c.matchAmbiguous);
    }
  }
  return rows;
}

export function offerObservations(captures) {
  const identities = new Map();
  for (const c of captures) for (const r of c.offers ?? []) {
    const key = offerKey(c.world, r);
    if (!identities.has(key)) identities.set(key, new Set());
    if (r.offerId) identities.get(key).add(r.offerId);
  }
  return captures.flatMap(c => (c.offers ?? []).map(r => ({ world: c.world,
    capturedAt: c.capturedAt, hash: c.hash, processingVersion: c.processingVersion ?? 0,
    ...r, matchAmbiguous: r.matchAmbiguous || identities.get(offerKey(c.world, r)).size > 1 })));
}
