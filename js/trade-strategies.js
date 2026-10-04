/*
 * Trade strategies: what a player gets for selling or buying Tibia Coins now, against the offers they see in the
 * Market, and for creating their own offer instead. Pure functions; no DOM, and no market data but what the player
 * enters: the market history is never consulted, and nothing is estimated beyond the entered offers (no deeper
 * prices, no chance or time of an offer filling). The Trade page (trade.html, js/trade.js) reads its fields here and
 * draws the result.
 *
 * Market rules (CipSoft, "The Market", Tibia Manual, sec. 4.3.3, the source the research cites for its fee):
 *   - Accepting an existing offer has no fee.
 *   - Placing an offer pays 2% of its total price, at least 20 and at most 1,000,000 gold. The fee is taken from
 *     the bank when the offer is placed (with the whole price, for a Buy Offer) and is lost if it is cancelled.
 *   - One offer holds at most 64,000 items, so a larger amount takes several offers, each paying its own fee.
 *   - A new offer priced to meet an existing one on the other side is matched against it at once.
 *   - 999,999,999,999 is the highest price an offer can carry.
 * The manual does not say how 2% is rounded to whole gold. Here it is rounded up, so a fee is never understated;
 * the difference is at most 1 gold. Tibia Coin offer quantities use increments of 25 TC; this is not a Statistics-counter unit.
 *
 * Every gold figure is a BigInt: amount × price for a large order passes the range Number holds exactly. Amounts and
 * prices themselves are validated as safe integers first.
 */
import { validBook } from './market-history.js';
import { fmt } from './format.js';

export const RULES = Object.freeze({
  feePercent: 2n, minFee: 20n, maxFee: 1_000_000n,
  maxOfferAmount: 64_000,
  maxOffers: 100,            // offers one character can hold at a time
  maxPrice: 999_999_999_999,
  lot: 25 // Active-offer quantity increment, never a Statistics multiplier.
});
// The most one character can have on offer at once; also the bound on an amount entered anywhere.
export const MAX_AMOUNT = RULES.maxOfferAmount * RULES.maxOffers;

export const SIDES = ['sell', 'buy'];
// Who trades with whom: selling now takes the Buy Offers, buying now the Sell Offers; an offer of one's own joins
// the offers of the side one trades on.
export const OPPOSITE = { sell: 'buy', buy: 'sell' };

/* ---------------------------------------------------------------- reading */
// A whole number as a player types it: plain digits, digits grouped by thousands with one consistent separator, the
// browser's own grouping (which the page writes back), or Tibia's shorthand, k for a thousand and kk for a million,
// with at most two decimals ("38.5k", "1,25kk"). Anything else, including a decimal without k, is not read, rather
// than guessed: "38.52" could be either. Returns {value}: null for an empty field, NaN when unreadable,
// Infinity past exact integers.
const GROUPED = /^\d{1,3}([,.'’ _  ])\d{3}(?:\1\d{3})*$/;
const SHORT = /^(\d+)(?:[.,](\d{1,2}))?\s*(k{1,3})$/i;
export function readInteger(text) {
  const s = String(text ?? '').trim();
  if (!s) return { value: null };
  let n;
  const short = SHORT.exec(s);
  if (short) {
    const digits = 3 * short[3].length;
    n = BigInt(short[1]) * 10n ** BigInt(digits) + BigInt((short[2] ?? '').padEnd(digits, '0'));
  } else {
    const digits = s.replace(/\D/g, '');
    if (!digits || !(/^\d+$/.test(s) || GROUPED.test(s) || fmt(BigInt(digits)) === s)) return { value: NaN };
    n = BigInt(digits);
  }
  return { value: n > BigInt(Number.MAX_SAFE_INTEGER) ? Infinity : Number(n) };
}

/* ------------------------------------------------------------------ rules */
const PRICE = { max: RULES.maxPrice, lot: 1 };
const AMOUNT = { max: MAX_AMOUNT, lot: RULES.lot };
const entered = v => v !== null && v !== undefined && v !== '';
// Why a value cannot be used, or null: format (unreadable), whole, positive, tooLarge, lot.
function problem(value, { max, lot }) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'format';
  if (value === Infinity) return 'tooLarge';
  if (!Number.isInteger(value)) return 'whole';
  if (value <= 0) return 'positive';
  if (value > max) return 'tooLarge';
  return value % lot ? 'lot' : null;
}

// The fee for placing one offer of this total price.
export function marketFee(total) {
  const fee = (total * RULES.feePercent + 99n) / 100n;
  return fee < RULES.minFee ? RULES.minFee : fee > RULES.maxFee ? RULES.maxFee : fee;
}

// Placing `amount` at `price`: as few offers as the 64,000-item limit allows, full ones first, which also keeps the
// fee lowest (a full offer is the likeliest to reach the cap). total is the Total Price of them all.
export function offerCost(amount, price) {
  let fee = 0n, offers = 0;
  for (let left = amount; left > 0; left -= RULES.maxOfferAmount, offers++) {
    fee += marketFee(BigInt(Math.min(left, RULES.maxOfferAmount)) * BigInt(price));
  }
  return { total: BigInt(amount) * BigInt(price), fee, offers };
}

// What placing the offer comes to, if it fills: gold received after the fee (selling), or paid with it (buying).
const offerNet = (intent, { total, fee }) => intent === 'sell' ? total - fee : total + fee;

// Taking existing offers, best first, up to `amount`: only what the entered offers hold, never more.
export function takeOffers(levels, amount) {
  const fills = [];
  let left = amount, gold = 0n;
  for (const level of levels) {
    if (!left) break;
    const take = Math.min(left, level.amount);
    fills.push({ price: level.price, amount: take });
    gold += BigInt(take) * BigInt(level.price);
    left -= take;
  }
  return { now: amount - left, remainder: left, fills, gold };
}

// a better than b: more gold received when selling, less paid when buying.
const better = (intent, a, b) => intent === 'sell' ? a > b : a < b;
// A ratio of two non-negative BigInts to six decimals, rounded half up; for presentation only.
const ratioOf = (part, whole) => whole > 0n ? Number((part * 2_000_000n + whole) / (2n * whole)) / 1_000_000 : null;

/* --------------------------------------------------------------- strategies */
// Trading the whole amount now: as far as the entered offers reach. complete when they hold all of it.
function takeStrategy(walk, amount) {
  return { id: 'take', now: walk.now, fills: walk.fills, gold: walk.gold, offered: 0, price: null, total: 0n, fee: 0n,
    offers: 0, net: walk.gold, remainder: walk.remainder, complete: walk.now === amount };
}
// Placing the whole amount as one's own offer.
function makeStrategy(intent, amount, price) {
  const cost = offerCost(amount, price);
  return { id: 'make', now: 0, fills: [], gold: 0n, offered: amount, price, ...cost, net: offerNet(intent, cost), remainder: 0, complete: true };
}
// Taking whole price levels now and offering what is left. Each prefix of the levels the full take reaches is a
// candidate as long as something is left to offer; the best one stands for the strategy (with a single entered
// offer that is taking it and offering the rest). A tie keeps the candidate that trades more now.
function splitStrategy(intent, walk, amount, price) {
  let best = null, now = 0, gold = 0n;
  for (let i = 0; i < walk.fills.length; i++) {
    now += walk.fills[i].amount;
    gold += BigInt(walk.fills[i].amount) * BigInt(walk.fills[i].price);
    if (now >= amount) break;
    const cost = offerCost(amount - now, price);
    const net = gold + (intent === 'sell' ? cost.total - cost.fee : cost.total + cost.fee);
    if (!best || better(intent, net, best.net) || net === best.net) {
      best = { id: 'split', now, fills: walk.fills.slice(0, i + 1), gold, offered: amount - now, price, ...cost, net, remainder: 0, complete: true };
    }
  }
  return best;
}

// Where one's own offer would stand among the entered offers on its side: the amount offered at a better price
// (ahead of it) and at the same price. atLeast: the price is past the last entered row, so more may be ahead.
function standing(intent, ownLevels, price) {
  const ahead = intent === 'sell' ? l => l.price < price : l => l.price > price;
  return {
    entered: ownLevels.length > 0,
    best: ownLevels[0]?.price ?? null,
    ahead: ownLevels.filter(ahead).reduce((t, l) => t + l.amount, 0),
    same: ownLevels.filter(l => l.price === price).reduce((t, l) => t + l.amount, 0),
    atLeast: ownLevels.length > 0 && ahead(ownLevels.at(-1))
  };
}

/*
 * Break-even offer price: the boundary between placing the whole amount as an offer and trading now as far as the
 * entered offers reach (offering any rest at the same price). Selling, the lowest price at which the offer, if it
 * fills, nets at least as much; buying, the highest at which it costs no more. Only prices an offer can be placed
 * at are searched: past the best offer on the other side (at it, the offer would be matched at once) and inside
 * the Market's limit. Across them, placing an offer gains about 98% of each price step, so the comparison turns
 * once and the search finds where. null with nothing to trade now, or when no placeable price reaches it.
 */
export function breakEvenPrice(intent, amount, walk) {
  if (!walk.now) return null;
  const rest = walk.remainder, top = walk.fills[0].price;
  const offerAll = p => offerNet(intent, offerCost(amount, p));
  const tradeNow = p => walk.gold + (rest ? offerNet(intent, offerCost(rest, p)) : 0n);
  if (intent === 'sell') {
    const ok = p => offerAll(p) >= tradeNow(p);
    let lo = top + 1, hi = RULES.maxPrice;
    if (lo > hi || !ok(hi)) return null;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (ok(mid)) hi = mid; else lo = mid + 1; }
    return lo;
  }
  const ok = p => offerAll(p) <= tradeNow(p);
  let lo = 1, hi = top - 1;
  if (lo > hi || !ok(lo)) return null;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (ok(mid)) lo = mid; else hi = mid - 1; }
  return lo;
}

/*
 * The whole comparison.
 *
 *   intent      'sell' or 'buy': what the player wants to do
 *   amount      Tibia Coins to sell or buy
 *   book        {sell: [{price, amount}], buy: [{price, amount}]}: the offers the player sees, each side best first
 *               (Sell Offers lowest first, Buy Offers highest first). Any number of rows; a row left empty is
 *               skipped. The Trade page enters one row per side today.
 *   offerPrice  the Piece Price the player would ask (selling) or bid (buying) with an offer of their own
 *
 * Values are integers, null when not entered, NaN when unreadable (readInteger). Returns:
 *
 *   issues      [{field, code, ...}]: field is 'amount', 'offerPrice' or 'book.<side>.<row>.<price|amount>'
 *   take, make, split   the strategies that can be computed, or null. Each has now (traded at once), fills, gold
 *               (gold for the coins traded now), offered, price, total (the offer's Total Price), fee, offers, net
 *               (gold received after the fee when selling, paid with it when buying), remainder (coins the entered
 *               offers cannot cover) and complete (covers the whole amount). make also has standing.
 *   best        the id of the best complete strategy, or null
 *   comparison  {best, other, difference, ratio, equal} against the next best complete strategy, or null
 *   breakEven   {price, partial}: partial when only part of the amount can trade now
 *   needs       what is missing for a full comparison: 'amount', 'offers' (the other side's top row), 'offerPrice'
 */
export function adviseTrade({ intent, amount = null, book = {}, offerPrice = null }) {
  if (!SIDES.includes(intent)) throw new TypeError(`intent must be 'sell' or 'buy', not ${intent}`);
  const issues = [];
  const flag = (field, code, extra) => issues.push({ field, code, ...extra });
  // An entered value that breaks a rule is flagged; true when it can be used.
  const usable = (field, value, rule) => {
    const code = problem(value, rule);
    if (code) flag(field, code);
    return !code;
  };

  const amountOk = entered(amount) && usable('amount', amount, AMOUNT);

  // The book: each entered row needs both its numbers; rows run from the best price on.
  const levels = { sell: [], buy: [] };
  let bookOk = true;
  for (const side of SIDES) {
    (book[side] ?? []).forEach((row, i) => {
      const price = row?.price ?? null, size = row?.amount ?? null;
      if (!entered(price) && !entered(size)) return;
      const at = `book.${side}.${i}`;
      const priceIssue = entered(price) ? problem(price, PRICE) : 'required';
      const sizeIssue = entered(size) ? problem(size, AMOUNT) : 'required';
      if (priceIssue) flag(`${at}.price`, priceIssue);
      if (sizeIssue) flag(`${at}.amount`, sizeIssue);
      if (priceIssue || sizeIssue) { bookOk = false; return; }
      const previous = levels[side].at(-1);
      if (previous && (side === 'sell' ? price < previous.price : price > previous.price)) { bookOk = false; flag(`${at}.price`, 'order'); }
      levels[side].push({ price, amount: size, row: i });
    });
  }
  // A Buy Offer at or above a Sell Offer would already have traded (the history's own book check).
  const top = { sell: levels.sell[0], buy: levels.buy[0] };
  if (bookOk && top.sell && top.buy && !validBook(top.sell.price, top.buy.price)) {
    bookOk = false;
    for (const side of SIDES) flag(`book.${side}.${top[side].row}.price`, 'crossed', { sell: top.sell.price, buy: top.buy.price });
  }

  // One's own offer must not meet the other side's best offer: it would be matched at once, fee and all.
  const theirs = levels[OPPOSITE[intent]];
  let offerOk = entered(offerPrice) && usable('offerPrice', offerPrice, PRICE);
  if (offerOk && bookOk && theirs[0] && (intent === 'sell' ? offerPrice <= theirs[0].price : offerPrice >= theirs[0].price)) {
    flag('offerPrice', 'crosses', { price: theirs[0].price });
    offerOk = false;
  }

  const ready = amountOk && bookOk;
  const walk = ready && theirs.length ? takeOffers(theirs, amount) : null;
  const take = walk && takeStrategy(walk, amount);
  const make = ready && offerOk ? { ...makeStrategy(intent, amount, offerPrice), standing: standing(intent, levels[intent], offerPrice) } : null;
  const split = walk && offerOk ? splitStrategy(intent, walk, amount, offerPrice) : null;

  // Only strategies that cover the whole amount are compared; on equal gold, the one that trades more now leads.
  const ranked = [take?.complete && take, split, make].filter(Boolean)
    .sort((a, b) => a.net === b.net ? b.now - a.now : better(intent, a.net, b.net) ? -1 : 1);
  const [first, second] = ranked;
  const difference = second ? (first.net > second.net ? first.net - second.net : second.net - first.net) : null;
  const price = walk && breakEvenPrice(intent, amount, walk);

  return {
    intent, amount: amountOk ? amount : null, issues, take, make, split,
    best: first?.id ?? null,
    comparison: second ? { best: first.id, other: second.id, difference, ratio: ratioOf(difference, second.net), equal: difference === 0n } : null,
    breakEven: price ? { price, partial: walk.remainder > 0 } : null,
    needs: [!entered(amount) && 'amount', !theirs.length && 'offers', !entered(offerPrice) && 'offerPrice'].filter(Boolean)
  };
}
