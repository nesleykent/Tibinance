/*
 * Trade page (trade.html, css/trade.css). The player copies what Tibia's Market shows, the top row of the Sell
 * Offers and of the Buy Offers, says how many Tibia Coins they want to sell or buy and, if they like, the price they
 * would offer them at; the page shows what trading at once, creating an offer, or both would come to.
 * js/trade-strategies.js does every sum; this module reads the fields and writes the words.
 *
 * It reads nothing from the market history and keeps nothing: what is entered lasts this visit, since a remembered
 * book would describe a market that has moved on.
 */
import { fmt, esc } from './format.js';
import { adviseTrade, readInteger, RULES, MAX_AMOUNT } from './trade-strategies.js';

const $ = id => document.getElementById(id);
const percent = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
// A difference that exists never reads as 0.00%: below the last shown digit it is "<0.01%".
const share = (ratio, difference, sign = '') => difference > 0n && ratio < 0.00005 ? `${sign}&lt;${percent.format(0.0001)}` : `${sign}${percent.format(ratio)}`;
// A figure as text that may wrap only after a digit group, never inside one (the largest orders run to 25 digits).
const figure = n => fmt(n).replace(/(\D)/g, '$1<wbr>');

// The words for each intent: the strategies, the offers each one meets, and how its gold reads.
const WORDS = {
  sell: { verb: 'sell', doing: 'selling', theirs: 'Buy Offer', own: 'Sell Offer', ownBest: 'lowest', ahead: 'lower',
    take: 'Sell now', make: 'Create Sell Offer', split: 'Sell now, offer the rest',
    now: 'Sells now', goldNow: 'Received now', left: 'Unsold', net: 'Net proceeds' },
  buy: { verb: 'buy', doing: 'buying', theirs: 'Sell Offer', own: 'Buy Offer', ownBest: 'highest', ahead: 'higher',
    take: 'Buy now', make: 'Create Buy Offer', split: 'Buy now, offer the rest',
    now: 'Buys now', goldNow: 'Paid now', left: 'Not bought', net: 'Total cost' }
};

// Why an entered value cannot be used (the codes of js/trade-strategies.js).
function issueText(issue, intent) {
  const column = issue.field.endsWith('.amount') ? 'Amount' : issue.field.endsWith('.price') ? 'Piece Price' : '';
  const amount = issue.field === 'amount' || column === 'Amount';
  const text = {
    format: 'Enter a whole number, such as 38,520 or 38.5k.',
    whole: 'Enter a whole number, such as 38,520 or 38.5k.',
    positive: 'Enter a number above 0.',
    lot: `Tibia Coins trade in lots of ${RULES.lot}.`,
    tooLarge: amount ? `At most ${fmt(MAX_AMOUNT)}: ${RULES.maxOffers} offers of ${fmt(RULES.maxOfferAmount)}, the most one character can hold.`
      : `At most ${fmt(RULES.maxPrice)}, the highest price the Market takes.`,
    required: `Enter the ${amount ? 'Amount' : 'Piece Price'} as well.`,
    order: 'Rows run from the best price on.',
    crossed: `A Buy Offer at ${fmt(issue.buy ?? 0)} and a Sell Offer at ${fmt(issue.sell ?? 0)} would already have traded: the Buy Offer must be the lower.`,
    crosses: intent === 'sell'
      ? `At or below the Buy Offer at ${fmt(issue.price ?? 0)}, your Sell Offer would be matched against it at once and still pay the fee. Selling now does the same without it.`
      : `At or above the Sell Offer at ${fmt(issue.price ?? 0)}, your Buy Offer would be matched against it at once and still pay the fee. Buying now does the same without it.`
  }[issue.code];
  return column && ['format', 'whole', 'positive', 'lot', 'tooLarge'].includes(issue.code) ? `${column}: ${text}` : text;
}

/* ------------------------------------------------------------------ result */
const prices = fills => fills.length > 1 ? `${figure(fills[0].price)} to ${figure(fills.at(-1).price)}` : figure(fills[0].price);
const inOffers = s => s.offers > 1 ? `, in ${s.offers} offers` : '';

// A strategy as the other side of a comparison: "selling now", "a Sell Offer of 10,000 at 38,900".
function phrase(r, id) {
  const w = WORDS[r.intent], s = r[id];
  if (id === 'take') return `${w.doing} now`;
  if (id === 'make') return `a ${w.own} of ${fmt(s.offered)} at ${fmt(s.price)}`;
  return `${w.doing} ${fmt(s.now)} now and offering ${fmt(s.offered)}`;
}

function prompt(r) {
  const w = WORDS[r.intent];
  if (r.issues.some(i => i.field !== 'offerPrice')) return 'Correct the marked values to see the comparison.';
  if (r.needs.includes('amount')) return `Enter how many Tibia Coins you want to ${w.verb}.`;
  return `Enter the top ${w.theirs} to see what ${w.doing} now brings, your own ${w.own} price to see what an offer would bring, or both to compare them.`;
}

// The answer first: the best strategy and by how much, or what one strategy alone comes to and what is missing.
function verdict(r) {
  const w = WORDS[r.intent], c = r.comparison;
  const crossing = r.issues.some(i => i.code === 'crosses');
  const ask = crossing ? `A ${w.own} at your price would be matched at once.` : null;
  if (c) {
    const best = r[c.best];
    let line;
    if (c.equal) {
      line = `The same as ${phrase(r, c.other)}: ${figure(best.net)} either way, and ${best.id === 'take' ? `${w.doing} now does not wait on an offer` : `this ${w.verb}s more of it now`}.`;
    } else {
      const sign = r.intent === 'sell' ? '+' : '';
      line = `<b class="up">${sign}${figure(c.difference)} (${share(c.ratio, c.difference, sign)})</b> ${r.intent === 'sell' ? 'over' : 'less than'} ${phrase(r, c.other)}${best.offered ? ', if the offer fills' : ', even if the offer filled'}.`;
    }
    return { kicker: 'Best on these numbers', head: w[c.best], line };
  }
  if (r.best === 'take') return { head: w.take, line: `${w.net}: <b>${figure(r.take.net)}</b>. ${ask ?? `Enter your ${w.own} price to compare it with an offer.`}` };
  if (r.best === 'make') return { head: w.make, line: `${w.net}, if it fills: <b>${figure(r.make.net)}</b>. Enter the top ${w.theirs} to compare it with ${w.doing} now.` };
  const t = r.take;
  return { head: `Only ${fmt(t.now)} of ${fmt(r.amount)} can ${w.verb} now`,
    line: `${w.net}: <b>${figure(t.net)}</b>. The ${w.theirs} you entered holds no more. ${ask ?? `Enter your ${w.own} price to compare offering the rest.`}` };
}

function breakEven(r) {
  if (!r.breakEven) return '';
  const w = WORDS[r.intent], { price, partial } = r.breakEven, now = fmt(r.take.now), all = fmt(r.amount);
  const detail = r.intent === 'sell'
    ? partial ? `Below it, selling ${now} now and offering the rest nets more; from it up, offering all ${all} nets at least as much, if the offer fills.`
      : 'Below it, selling now nets more; from it up, an offer that fills nets at least as much.'
    : partial ? `Above it, buying ${now} now and offering the rest costs less; from it down, offering all ${all} costs no more, if the offer fills.`
      : 'Above it, buying now costs less; from it down, an offer that fills costs no more.';
  return `<div class="trade-breakeven"><p class="trade-label">Break-even ${w.own} price</p><p class="trade-figure">${figure(price)}</p><p class="trade-note">${detail}</p></div>`;
}

// Where an offer of one's own would stand among the entered offers on its side.
function standing(r) {
  const w = WORDS[r.intent], s = r.make.standing;
  if (!s.entered) return '';
  if (!s.ahead) return s.same ? `It would join ${fmt(s.same)} already offered at that price.` : `It would be the ${w.ownBest} ${w.own}.`;
  return `Behind ${s.atLeast ? 'at least ' : ''}${fmt(s.ahead)} offered ${w.ahead}${s.same ? `, and ${fmt(s.same)} at the same price` : ''}.`;
}

function card(r, s) {
  const w = WORDS[r.intent], lines = [];
  let note;
  if (s.id === 'take') {
    lines.push([w.now, `${fmt(s.now)}${s.remainder ? ` of ${fmt(r.amount)}` : ''} at ${prices(s.fills)}`]);
    lines.push(['Market fee', '0']);
    if (s.remainder) lines.push([w.left, fmt(s.remainder), 'caution']);
    note = s.remainder ? `The ${w.theirs} you entered holds only ${fmt(s.now)}; nothing is priced beyond it.`
      : `Accepts the ${w.theirs}${s.fills.length > 1 ? 's' : ''} you entered. Accepting has no fee.`;
  } else {
    if (s.id === 'split') {
      lines.push([w.now, `${fmt(s.now)} at ${prices(s.fills)}`]);
      lines.push([w.goldNow, figure(s.gold)]);
      lines.push(['Then offers', `${figure(s.offered)} at ${figure(s.price)}${inOffers(s)}`]);
    } else lines.push(['Offers', `${figure(s.offered)} at ${figure(s.price)}${inOffers(s)}`]);
    lines.push([s.id === 'split' ? 'Offer Total Price' : 'Total Price', figure(s.total)]);
    lines.push(['Market fee', figure(s.fee)]);
    const paid = r.intent === 'buy' ? 'Its price and the fee leave your bank when it is placed.' : 'The fee leaves your bank when it is placed.';
    note = [s.id === 'make' && standing(r), paid].filter(Boolean).join(' ');
  }
  const label = s.offered ? `${w.net}, if it fills` : s.remainder ? `${w.net}, for ${fmt(s.now)}` : w.net;
  const best = r.best === s.id;
  return `<li class="trade-card${best ? ' is-best' : ''}" data-strategy="${s.id}">
    <h3 class="trade-name">${esc(w[s.id])}${best ? '<span class="trade-best">Best</span>' : ''}</h3>
    <p class="trade-net"><b>${figure(s.net)}</b><span class="trade-label">${esc(label)}</span></p>
    <dl class="trade-lines">${lines.map(([dt, dd, tone]) => `<div><dt>${esc(dt)}</dt><dd${tone ? ` class="${tone}"` : ''}>${dd}</dd></div>`).join('')}</dl>
    <p class="trade-note">${note}</p>
  </li>`;
}

// The strategies from all now to all offered: trading now, part now and the rest offered, an offer for all of it.
function resultHtml(r) {
  const strategies = [r.take, r.split, r.make].filter(Boolean);
  if (!strategies.length) return `<p class="trade-prompt">${esc(prompt(r))}</p>`;
  const v = verdict(r);
  return `<div class="trade-verdict">${v.kicker ? `<p class="trade-label">${v.kicker}</p>` : ''}<p class="trade-pick">${esc(v.head)}</p><p class="trade-gain">${v.line}</p></div>
    ${breakEven(r)}
    <ol class="trade-cards">${strategies.map(s => card(r, s)).join('')}</ol>
    <p class="trade-fine">An offer's figures hold only if it fills completely at your price; nothing here estimates whether or when it will. The Market fee is paid when an offer is placed, whether or not it fills.</p>`;
}

/* ------------------------------------------------------------------- wiring */
const form = $('tradeForm'), fields = [...form.querySelectorAll('input[data-field]')];
let intent = 'sell', said = '', saying;

// Fields to the comparison's input: book rows by their data-field path, so a deeper row is one more pair of fields.
function read() {
  const input = { intent, amount: null, offerPrice: null, book: { sell: [], buy: [] } };
  for (const field of fields) {
    const { value } = readInteger(field.value), path = field.dataset.field.split('.');
    if (path[0] === 'book') (input.book[path[1]][path[2]] ??= {})[path[3]] = value;
    else input[path[0]] = value;
  }
  return input;
}

// Each message under the row its field belongs to; a crossed book is one message, under the Buy Offers.
function showIssues(r) {
  const messages = new Map();
  for (const field of fields) {
    const own = r.issues.filter(i => i.field === field.dataset.field);
    const target = own.some(i => i.code === 'crossed') ? 'tradeBuyError' : field.dataset.error;
    if (own.length) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', target);
    } else {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    }
    for (const issue of own) messages.set(target, (messages.get(target) ?? new Set()).add(issueText(issue, intent)));
  }
  for (const box of form.querySelectorAll('.trade-error')) {
    const text = [...(messages.get(box.id) ?? [])].join(' ');
    box.textContent = text;
    box.hidden = !text;
  }
}

function update() {
  const r = adviseTrade(read()), w = WORDS[intent];
  showIssues(r);
  $('tradeOwnName').textContent = `Your ${w.own}`;
  $('tradeOfferPrice').setAttribute('aria-label', `Your ${w.own}, Piece Price`);
  $('tradeOwnAmount').textContent = r.amount ? fmt(r.amount) : '';
  $('tradeResult').innerHTML = resultHtml(r);
  // Screen readers hear the verdict, one sentence per line of it, once typing pauses, not at every keystroke.
  const lines = [...$('tradeResult').querySelectorAll('.trade-verdict > p, .trade-prompt')].map(e => e.textContent.replace(/\s+/g, ' ').trim().replace(/[.:]$/, ''));
  const text = lines.length ? `${lines.join('. ')}.` : '';
  clearTimeout(saying);
  saying = setTimeout(() => { if (text !== said) $('tradeStatus').textContent = said = text; }, 700);
}

$('tradeIntent').addEventListener('click', e => {
  const next = e.target.closest('button')?.dataset.intent;
  if (!next || next === intent) return;
  intent = next;
  for (const b of $('tradeIntent').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.intent === intent));
  update();
});
form.addEventListener('input', update);
// On leaving a field, a readable number is written back in full, so the player sees exactly what was read
// ("38.5k" becomes 38,500 in the browser's grouping).
form.addEventListener('change', e => {
  if (!e.target.matches('input[data-field]')) return;
  const { value } = readInteger(e.target.value);
  if (Number.isSafeInteger(value)) e.target.value = fmt(value);
});
form.addEventListener('submit', e => e.preventDefault());
$('tradeClear').addEventListener('click', () => {
  for (const field of fields) field.value = '';
  update();
  $('tradeAmount').focus();
});
update();
