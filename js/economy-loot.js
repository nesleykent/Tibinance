// TibiaWiki loot statistics as evidence: parsing {{Loot2}} samples and NPC buy prices, valuing a sample.
//
// Sources (CC-BY-SA, TibiaWiki contributors): "Loot Statistics:<Creature>" pages, each holding {{Loot2}} samples made
// after a game version, and Module:ItemPrices/data, the NPC trade tables. TibiaWiki's own "Average loot value"
// (Module:AverageLootValue) is, per sample, the sum over its lines of total x the highest price any NPC buys the item
// for, divided by kills. This module reads both exactly as that Lua module does, so the sum below reproduces the
// published value, and splits it into the two quantities Tibinance reports separately:
//   directCoins   Gold, Platinum and Crystal Coin at their face value (1, 100 and 10,000 gold): money dropped
//   npcPotential  every other item at its highest NPC buy price: potential conversion, not issued money
// Their sum is the published Average loot value of the sample (parity-tested), valued at one ItemPrices vintage.

export const COINS = { 'Gold Coin': 1, 'Platinum Coin': 100, 'Crystal Coin': 10000 };

// {{Loot2 ...}} blocks of a page's wikitext, in page order: {version, kills, name, lines, raw, quirks}.
export function parseLootPage(wikitext) {
  const samples = [];
  const re = /\{\{\s*Loot2\b([\s\S]*?)\n\}\}/g;
  let m;
  while ((m = re.exec(wikitext))) {
    const params = m[1].split('\n|').map(s => s.trim()).filter(Boolean);
    const named = {}, lines = [];
    for (const p of params.map(p => p.replace(/^\|/, '').trim())) {
      const eq = p.match(/^(version|kills|name|note|alv)\s*=\s*([\s\S]*)$/i);
      if (eq) named[eq[1].toLowerCase()] = eq[2].trim();
      else if (p) lines.push(p);
    }
    const parsed = lines.map(parseLine);
    samples.push({ version: named.version ?? null, kills: named.kills != null ? Number(String(named.kills).replace(/[^\d]/g, '')) : null,
      name: named.name ?? null, manualAlv: named.alv ?? null, lines: parsed,
      quirks: [...new Set(parsed.flatMap(l => l.quirks))], raw: m[0] });
  }
  return samples;
}

// One item line, read as Module:AverageLootValue reads it: comma-separated; the first part is the item name; the
// count is the first number of the 2nd part (times); with a 3rd and a 4th part the total is the first number of the
// 4th; with only a 3rd, the total is the first number of the 3rd (which is the amount's minimum when the line has
// an amount but no total: a quirk kept for parity and flagged); with only times, the total is times.
export function parseLine(line) {
  const parts = line.split(',').map(s => s.trim());
  const num = s => { const m = (s ?? '').match(/\d+/); return m ? Number(m[0]) : null; };
  const name = parts[0];
  const times = num(parts[1]);
  let total = times, amountMin = null, amountMax = null;
  const quirks = [];
  const amount = parts.find(p => /^amount\s*:/i.test(p));
  if (amount) { const a = amount.match(/(\d+)(?:\s*-\s*(\d+))?/); if (a) { amountMin = Number(a[1]); amountMax = Number(a[2] ?? a[1]); } }
  if (parts[2] !== undefined) {
    if (parts[3] !== undefined) total = num(parts[3]);
    else {
      total = num(parts[2]);
      if (/^amount\s*:/i.test(parts[2])) quirks.push('amount-without-total');
    }
  }
  if (times === null) quirks.push('no-times');
  return { name, times, total, amountMin, amountMax, quirks };
}

// Highest NPC buy price per item name from Module:ItemPrices/data (Lua source), as the module computes it: only
// "buys" tables, prices that are plain numbers (a quoted number counts, as tonumber does), the maximum over NPCs.
export function parseItemPrices(lua) {
  const prices = new Map();
  const parts = lua.split(/\["(buys|sells)"\]\s*=\s*\{/);
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] !== 'buys') continue;
    const block = parts[i + 1].split(/\["sells"\]/)[0];
    for (const m of block.matchAll(/\{\s*\["item"\]\s*=\s*"((?:[^"\\]|\\.)*)"\s*,\s*\["price"\]\s*=\s*"?(\d+(?:\.\d+)?)"?\s*[,}]/g)) {
      const price = Number(m[2]);
      if (!(prices.get(m[1]) >= price)) prices.set(m[1], price);
    }
  }
  return prices;
}

// Value of one sample per kill under one price map: directCoins, npcPotential, their sum (the wiki's ALV before its
// rounding to cents), and which lines had no NPC price (valued at zero, as the wiki does, and reported).
export function valueSample(sample, prices) {
  let coins = 0, npc = 0;
  const unpriced = [];
  if (!sample.kills) return { directCoins: null, npcPotential: null, total: null, unpriced, reason: 'no kills' };
  for (const line of sample.lines) {
    if (line.name === 'Empty' || line.total === null) continue;
    if (line.name in COINS) coins += COINS[line.name] * line.total;
    else if (prices.has(line.name)) npc += prices.get(line.name) * line.total;
    else unpriced.push(line.name);
  }
  return { directCoins: coins / sample.kills, npcPotential: npc / sample.kills, total: (coins + npc) / sample.kills, unpriced };
}

// The wiki's display rounding: math.floor(value * 100 + 0.5) / 100.
export const wikiRound = v => Math.floor(v * 100 + 0.5) / 100;

// Observed sampling uncertainty of each line's drop frequency: times out of kills, a binomial count, with its
// Wilson 95% interval. Nothing is assumed about amounts or independence between items.
export function dropRates(sample, z = 1.959963984540054) {
  return sample.lines.filter(l => l.times !== null && sample.kills).map(l => {
    const n = sample.kills, p = Math.min(1, l.times / n);
    const centre = (p + z * z / (2 * n)) / (1 + z * z / n);
    const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n);
    return { name: l.name, rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), times: l.times, kills: n };
  });
}
