import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RULES, MAX_AMOUNT, marketFee, offerCost, takeOffers, breakEvenPrice, readInteger, adviseTrade} from '../js/trade-strategies.js';
import {fmt} from '../js/format.js';

const level = (price, amount) => ({price, amount});
const sell = (amount, book, offerPrice = null) => adviseTrade({intent:'sell', amount, book, offerPrice});
const buy = (amount, book, offerPrice = null) => adviseTrade({intent:'buy', amount, book, offerPrice});
const codes = result => result.issues.map(i => `${i.field}:${i.code}`);

test('the Market fee is 2% of the Total Price, at least 20 and at most 1,000,000, rounded up to whole gold', () => {
  assert.deepEqual(RULES.feePercent, 2n);
  assert.equal(marketFee(25n), 20n, 'the minimum');
  assert.equal(marketFee(999n), 20n);
  assert.equal(marketFee(1_000n), 20n, '2% of 1,000 is exactly the minimum');
  assert.equal(marketFee(1_050n), 21n);
  assert.equal(marketFee(1_025n), 21n, '20.5 is rounded up');
  assert.equal(marketFee(1_000_000n), 20_000n);
  assert.equal(marketFee(49_999_950n), 999_999n);
  assert.equal(marketFee(50_000_000n), 1_000_000n, '2% of 50,000,000 is exactly the cap');
  assert.equal(marketFee(50_000_050n), 1_000_000n);
  assert.equal(marketFee(999_999_999_999n * 64_000n), 1_000_000n);
});

test('an amount past 64,000 takes several offers, full ones first, each paying its own fee', () => {
  assert.deepEqual(offerCost(64_000, 40_000), {total:2_560_000_000n, fee:1_000_000n, offers:1});
  // 64,025: one full offer at the cap and an offer of 25 at 2% of 1,000,000.
  assert.deepEqual(offerCost(64_025, 40_000), {total:2_561_000_000n, fee:1_020_000n, offers:2});
  assert.deepEqual(offerCost(MAX_AMOUNT, 40_000), {total:256_000_000_000n, fee:100_000_000n, offers:100});
  assert.equal(MAX_AMOUNT, 6_400_000);
  assert.equal(RULES.lot, 25, 'Tibia Coins trade in lots of 25, as the market history counts them');
});

test('typed numbers: grouped digits, the browser grouping and k shorthand; nothing ambiguous is guessed', () => {
  const read = text => readInteger(text).value;
  assert.equal(read(''), null);
  assert.equal(read('   '), null);
  assert.equal(read(null), null);
  for (const text of ['38520', '38,520', '38.520', '38 520', '38 520', "38'520", ' 38520 ', '038520']) assert.equal(read(text), 38_520, text);
  assert.equal(read('1,234,567'), 1_234_567);
  assert.equal(read('1.234.567'), 1_234_567);
  assert.equal(read(fmt(6_400_000)), 6_400_000, 'what the panel writes back reads the same');
  assert.equal(read('38k'), 38_000);
  assert.equal(read('38.5k'), 38_500);
  assert.equal(read('38,52K'), 38_520);
  assert.equal(read('1,25kk'), 1_250_000);
  assert.equal(read('2 kk'), 2_000_000);
  assert.equal(read('1kkk'), 1_000_000_000);
  assert.equal(read('0'), 0, 'zero is read, then refused as not positive');
  for (const text of ['38.52', '38,5', '1,234.567', '12,34', '1,500k', '38.555k', '-5', '+5', '5e3', 'abc', '38 gp', 'k'])
    assert.ok(Number.isNaN(read(text)), text);
  assert.equal(read('99999999999999999999'), Infinity, 'past exact integers');
});

test('every entered value is checked: whole, positive, in lots of 25, inside the Market limits', () => {
  assert.deepEqual(codes(sell(0, {})), ['amount:positive']);
  assert.deepEqual(codes(sell(30, {})), ['amount:lot']);
  assert.deepEqual(codes(sell(25.5, {})), ['amount:whole']);
  assert.deepEqual(codes(sell(NaN, {})), ['amount:format']);
  assert.deepEqual(codes(sell(Infinity, {})), ['amount:tooLarge']);
  assert.deepEqual(codes(sell(MAX_AMOUNT + 25, {})), ['amount:tooLarge']);
  assert.deepEqual(codes(sell(MAX_AMOUNT, {})), []);
  assert.deepEqual(codes(sell(25, {buy:[level(0, 25)]})), ['book.buy.0.price:positive']);
  assert.deepEqual(codes(sell(25, {buy:[level(RULES.maxPrice + 1, 25)]})), ['book.buy.0.price:tooLarge']);
  assert.deepEqual(codes(sell(25, {buy:[level(38_000, 10)]})), ['book.buy.0.amount:lot']);
  assert.deepEqual(codes(sell(25, {buy:[level(38_000, -25)]})), ['book.buy.0.amount:positive']);
  assert.deepEqual(codes(sell(25, {}, 0)), ['offerPrice:positive']);
  assert.deepEqual(codes(sell(25, {}, 1.5)), ['offerPrice:whole']);
  // A row needs both numbers; an empty row is simply not entered.
  assert.deepEqual(codes(sell(25, {buy:[level(38_000, null)], sell:[level(null, 50)]})), ['book.sell.0.price:required', 'book.buy.0.amount:required']);
  assert.deepEqual(codes(sell(25, {buy:[level(null, null)], sell:[level('', '')]})), []);
  // Any book error leaves nothing to compute.
  const broken = sell(100, {buy:[level(38_000, null)]}, 39_000);
  assert.equal(broken.take, null);
  assert.equal(broken.make, null);
  assert.equal(broken.breakEven, null);
});

test('a crossed book is refused, as the market history refuses one', () => {
  for (const [s, b] of [[38_000, 38_000], [38_000, 38_100]]) {
    const r = sell(100, {sell:[level(s, 25)], buy:[level(b, 25)]}, 39_000);
    assert.deepEqual(codes(r), ['book.sell.0.price:crossed', 'book.buy.0.price:crossed']);
    assert.equal(r.take, null);
  }
  // Deeper rows run from the best price on; equal prices (separate offers) are fine.
  assert.deepEqual(codes(sell(100, {buy:[level(38_000, 25), level(38_100, 25)]})), ['book.buy.1.price:order']);
  assert.deepEqual(codes(buy(100, {sell:[level(38_000, 25), level(37_900, 25)]})), ['book.sell.1.price:order']);
  assert.deepEqual(codes(sell(100, {buy:[level(38_000, 25), level(38_000, 50)]})), []);
});

test('an own offer that meets the best offer on the other side would be matched at once, so it is not an offer', () => {
  const book = {sell:[level(38_800, 500)], buy:[level(38_400, 500)]};
  for (const price of [38_400, 38_000]) {
    const r = sell(100, book, price);
    assert.deepEqual(r.issues, [{field:'offerPrice', code:'crosses', price:38_400}]);
    assert.equal(r.make, null);
    assert.equal(r.take.net, 3_840_000n, 'selling now is still worked out');
    assert.equal(r.breakEven.price, 39_184);
  }
  assert.deepEqual(codes(sell(100, book, 38_401)), []);
  assert.deepEqual(codes(buy(100, book, 38_800)), ['offerPrice:crosses']);
  assert.deepEqual(codes(buy(100, book, 38_799)), []);
  // Without the other side entered, there is nothing to meet.
  assert.deepEqual(codes(sell(100, {sell:book.sell}, 38_000)), []);
});

test('selling into enough Buy Offers: an offer that fills nets more past the break-even price, which is where they meet', () => {
  const book = {buy:[level(38_420, 12_000)], sell:[level(38_900, 500)]};
  const r = sell(10_000, book, 38_900);
  assert.deepEqual(r.issues, []);
  assert.equal(r.take.now, 10_000);
  assert.equal(r.take.remainder, 0);
  assert.equal(r.take.complete, true);
  assert.equal(r.take.gold, 384_200_000n);
  assert.equal(r.take.fee, 0n, 'accepting offers has no fee');
  assert.equal(r.take.net, 384_200_000n);
  assert.equal(r.make.total, 389_000_000n);
  assert.equal(r.make.fee, 1_000_000n, 'the cap binds');
  assert.equal(r.make.net, 388_000_000n);
  assert.equal(r.make.offers, 1);
  assert.deepEqual(r.make.standing, {entered:true, best:38_900, ahead:0, same:500, atLeast:false});
  assert.equal(r.split, null, 'the Buy Offer holds the whole amount');
  assert.equal(r.best, 'make');
  assert.deepEqual(r.comparison, {best:'make', other:'take', difference:3_800_000n, ratio:0.009891, equal:false});
  assert.deepEqual(r.breakEven, {price:38_520, partial:false});
  assert.deepEqual(r.needs, []);

  // Below the break-even price selling now nets more, even if the offer filled.
  const low = sell(10_000, book, 38_500);
  assert.equal(low.best, 'take');
  assert.deepEqual(low.comparison, {best:'take', other:'make', difference:200_000n, ratio:0.000521, equal:false});
  // At it the two are equal, and selling now leads: it does not depend on an offer filling.
  const even = sell(10_000, book, 38_520);
  assert.equal(even.make.net, even.take.net);
  assert.equal(even.best, 'take');
  assert.deepEqual(even.comparison, {best:'take', other:'make', difference:0n, ratio:0, equal:true});
});

test('selling more than the Buy Offers hold: only their amount is priced, the rest is exposed, and a split is offered', () => {
  const r = sell(10_000, {buy:[level(38_420, 4_000)]}, 38_900);
  // Never the best price times the whole amount.
  assert.equal(r.take.now, 4_000);
  assert.equal(r.take.remainder, 6_000);
  assert.equal(r.take.gold, 153_680_000n);
  assert.equal(r.take.complete, false);
  assert.deepEqual(r.take.fills, [{price:38_420, amount:4_000}]);
  // Sell the 4,000 now, offer the 6,000 left: 153,680,000 + 233,400,000 - 1,000,000 (capped).
  assert.equal(r.split.now, 4_000);
  assert.equal(r.split.offered, 6_000);
  assert.equal(r.split.total, 233_400_000n);
  assert.equal(r.split.fee, 1_000_000n);
  assert.equal(r.split.net, 386_080_000n);
  assert.equal(r.make.net, 388_000_000n);
  // Selling now covers only part of the amount, so it is not compared; the offer for all of it and the split are.
  assert.deepEqual(r.comparison, {best:'make', other:'split', difference:1_920_000n, ratio:0.004973, equal:false});
  // Offering the 4,000 too pays no extra fee here (both offers are capped), so it would break even at 38,420 itself;
  // a Sell Offer there would be matched at once, so the first price it can be placed at is the break-even.
  assert.deepEqual(r.breakEven, {price:38_421, partial:true});

  // Below the cap the extra fee counts: 100 now at 38,000, 100 offered.
  const small = sell(200, {buy:[level(38_000, 100)]}, 38_500);
  assert.equal(small.split.net, 3_800_000n + 3_850_000n - 77_000n);
  assert.equal(small.make.net, 7_700_000n - 154_000n);
  assert.equal(small.best, 'split');
  assert.equal(small.breakEven.price, 38_776);
});

test('buying: the same comparison on cost, with the fee added to the offer', () => {
  const book = {sell:[level(38_800, 2_000)], buy:[level(38_000, 300)]};
  const r = buy(1_000, book, 38_000);
  assert.equal(r.take.net, 38_800_000n);
  assert.equal(r.make.total, 38_000_000n);
  assert.equal(r.make.fee, 760_000n);
  assert.equal(r.make.net, 38_760_000n, 'a Buy Offer takes its price and fee from the bank when placed');
  assert.deepEqual(r.make.standing, {entered:true, best:38_000, ahead:0, same:300, atLeast:false});
  assert.deepEqual(r.comparison, {best:'make', other:'take', difference:40_000n, ratio:0.001031, equal:false});
  // The highest Buy Offer that costs no more than buying now: 1,000 × 38,039 + 760,780.
  assert.deepEqual(r.breakEven, {price:38_039, partial:false});
  assert.equal(buy(1_000, book, 38_039).best, 'make');
  assert.equal(buy(1_000, book, 38_040).best, 'take');

  // Partial: 2,000 wanted, 500 on offer.
  const p = buy(2_000, {sell:[level(38_800, 500)]}, 38_000);
  assert.equal(p.take.now, 500);
  assert.equal(p.take.remainder, 1_500);
  assert.equal(p.take.gold, 19_400_000n);
  assert.equal(p.split.net, 19_400_000n + 57_000_000n + 1_000_000n);
  assert.equal(p.make.net, 76_000_000n + 1_000_000n);
  assert.equal(p.best, 'make');
  assert.equal(p.comparison.other, 'split');
});

test('without the other side or an own price, each strategy stands alone and says what is missing', () => {
  const offerOnly = sell(500, {sell:[level(38_900, 100)]}, 38_800);
  assert.equal(offerOnly.take, null);
  assert.equal(offerOnly.split, null);
  assert.equal(offerOnly.best, 'make');
  assert.equal(offerOnly.comparison, null);
  assert.equal(offerOnly.breakEven, null, 'nothing can be sold now to break even with');
  assert.deepEqual(offerOnly.needs, ['offers']);
  assert.deepEqual(offerOnly.make.standing, {entered:true, best:38_900, ahead:0, same:0, atLeast:false});

  const nowOnly = sell(500, {buy:[level(38_400, 1_000)]});
  assert.equal(nowOnly.best, 'take');
  assert.equal(nowOnly.comparison, null);
  assert.equal(nowOnly.make, null);
  assert.deepEqual(nowOnly.breakEven, {price:39_184, partial:false});
  assert.deepEqual(nowOnly.needs, ['offerPrice']);

  const partialOnly = sell(500, {buy:[level(38_400, 100)]});
  assert.equal(partialOnly.best, null, 'a partial sale does not cover the amount');
  assert.equal(partialOnly.take.remainder, 400);

  const nothing = sell(null, {buy:[level(38_400, 100)]}, 39_000);
  assert.equal(nothing.amount, null);
  assert.equal(nothing.take, null);
  assert.equal(nothing.make, null);
  assert.deepEqual(nothing.needs, ['amount']);
  assert.throws(() => adviseTrade({intent:'hold', amount:25}), TypeError);
});

test('an own offer behind better offers on its side is placed among them, never more precisely than entered', () => {
  const book = {sell:[level(38_800, 500), level(38_850, 200)]};
  assert.deepEqual(sell(100, book, 38_700).make.standing, {entered:true, best:38_800, ahead:0, same:0, atLeast:false});
  assert.deepEqual(sell(100, book, 38_850).make.standing, {entered:true, best:38_800, ahead:500, same:200, atLeast:false});
  // Past the last entered row, more could be ahead than was entered.
  assert.deepEqual(sell(100, book, 39_000).make.standing, {entered:true, best:38_800, ahead:700, same:0, atLeast:true});
  assert.deepEqual(buy(100, {buy:[level(38_000, 300)]}, 37_900).make.standing, {entered:true, best:38_000, ahead:300, same:0, atLeast:true});
  assert.deepEqual(sell(100, {}, 39_000).make.standing, {entered:false, best:null, ahead:0, same:0, atLeast:false});
});

test('deeper rows: only entered rows are taken, and the split keeps the rows worth taking now', () => {
  assert.deepEqual(takeOffers([level(40_000, 100), level(39_000, 900)], 2_000),
    {now:1_000, remainder:1_000, fills:[{price:40_000, amount:100}, {price:39_000, amount:900}], gold:39_100_000n});
  // A thin first row and a much lower second: take the first row now, offer the rest.
  const r = sell(1_000, {buy:[level(40_000, 100), level(30_000, 900)]}, 40_500);
  assert.equal(r.take.net, 31_000_000n);
  assert.equal(r.take.complete, true);
  assert.equal(r.split.now, 100);
  assert.deepEqual(r.split.fills, [{price:40_000, amount:100}]);
  assert.equal(r.split.net, 4_000_000n + 36_450_000n - 729_000n);
  assert.equal(r.make.net, 40_500_000n - 810_000n);
  assert.equal(r.best, 'split');
  assert.deepEqual(r.comparison, {best:'split', other:'make', difference:31_000n, ratio:0.000781, equal:false});
  // Both rows close to the top: selling now beats either.
  assert.equal(sell(1_000, {buy:[level(40_000, 100), level(39_900, 900)]}, 40_100).best, 'take');
});

test('very large orders stay exact past the range Number holds', () => {
  const r = buy(MAX_AMOUNT, {sell:[level(RULES.maxPrice, MAX_AMOUNT)]}, RULES.maxPrice - 100);
  assert.equal(r.take.net, 6_399_999_999_993_600_000n);
  assert.ok(r.take.net > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(r.make.offers, 100);
  assert.equal(r.make.fee, 100_000_000n);
  assert.equal(r.make.net, 6_399_999_999_353_600_000n + 100_000_000n);
  assert.equal(r.best, 'make');
  assert.equal(r.comparison.difference, 540_000_000n);
  // One gold under the Sell Offer saves 6,400,000 and pays 100 fees of 1,000,000: buying now is cheaper.
  assert.equal(buy(MAX_AMOUNT, {sell:[level(RULES.maxPrice, MAX_AMOUNT)]}, RULES.maxPrice - 1).best, 'take');
  // A sale at the top price leaves no price inside the limit to place an offer at; a purchase at 1, none below it.
  assert.equal(breakEvenPrice('sell', 100, takeOffers([level(RULES.maxPrice, 100)], 100)), null);
  assert.equal(breakEvenPrice('buy', 100, takeOffers([level(1, 100)], 100)), null);
});

test('the break-even price is the exact boundary: one gold either side turns the comparison', () => {
  // A small deterministic generator, so the cases are the same on every run.
  let seed = 7;
  const next = n => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed % n; };
  for (let i = 0; i < 300; i++) {
    const intent = i % 2 ? 'sell' : 'buy';
    const amount = 25 * (1 + next(4_000));
    const top = 20_000 + next(40_000);
    const held = 25 * (1 + next(4_000));
    const theirs = intent === 'sell' ? {buy:[level(top, held)]} : {sell:[level(top, held)]};
    const {breakEven} = adviseTrade({intent, amount, book:theirs});
    assert.ok(breakEven, `case ${i}`);
    const at = adviseTrade({intent, amount, book:theirs, offerPrice:breakEven.price});
    const past = adviseTrade({intent, amount, book:theirs, offerPrice:breakEven.price + (intent === 'sell' ? -1 : 1)});
    const now = held >= amount ? 'take' : 'split';
    // At the break-even price an offer for all of it is at least as good (equal results favour trading now).
    assert.ok(intent === 'sell' ? at.make.net >= at[now].net : at.make.net <= at[now].net, `case ${i}: at ${breakEven.price}`);
    assert.ok(at.comparison.best === 'make' || at.comparison.equal, `case ${i}: at ${breakEven.price}`);
    // One gold past it, trading now is strictly better.
    if (!past.issues.length) assert.ok(intent === 'sell' ? past[now].net > past.make.net : past[now].net < past.make.net, `case ${i}: past ${breakEven.price}`);
  }
});
