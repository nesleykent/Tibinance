/*
 * The Screener's markup (markets.html #screenerPanel): a grid of worlds, each a mini chart of its best offers over the
 * range with its key figures, and the controls that search, filter and sort them. The rows and the mini chart's
 * geometry come from js/market-screener.js; the page (js/markets.js) owns the side, the range and the selected world,
 * and is told when a world is opened or the side or range changes.
 *
 * Every card is a link to the world's chart, so it can be opened in a new tab; a plain click opens it in place. The
 * filters and the order are a viewing preference, remembered on this device rather than in the address; the search
 * lasts the visit.
 */
import { esc, fmt, num } from './format.js';
import { DATA, SORTS, STATUSES, filterRows, miniChart, options, screenerRows, sortRows } from './market-screener.js';

const KEY = 'tibinance.markets.screener';
const DEFAULTS = { status: 'active', type: '', battleye: '', location: '', data: 'all', sort: 'world', dir: 1 };
// The mini chart's drawing box; the SVG stretches it to the card's width, its lines keep their own width.
const W = 240, H = 56;
const OFFER = { sell: 'Sell', buy: 'Buy' };

const percent = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const signed = new Intl.NumberFormat(undefined, { signDisplay: 'exceptZero' });
const share = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';

export function screenerPanel(root, { onOpen, onRange, onSide }) {
  const $ = id => root.querySelector(`#${id}`);
  let prefs = { ...DEFAULTS }, query = '', data = null;
  try { prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* storage unavailable or unreadable */ }
  if (!SORTS[prefs.sort]) prefs.sort = DEFAULTS.sort;
  if (!STATUSES[prefs.status]) prefs.status = DEFAULTS.status;
  if (!DATA[prefs.data]) prefs.data = DEFAULTS.data;
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* this visit only */ } };

  const select = (id, entries, value) => {
    $(id).innerHTML = entries.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
    $(id).value = value;
  };
  select('screenerStatus', Object.entries(STATUSES), prefs.status);
  select('screenerData', Object.entries(DATA), prefs.data);
  select('screenerSort', Object.entries(SORTS), prefs.sort);

  // The metadata filters offer the values found among the worlds of the chosen status; a choice that no longer exists
  // there is let go rather than leaving an empty grid nobody asked for.
  function metadataOptions(rows) {
    const pool = filterRows(rows, { status: prefs.status });
    for (const [id, key, all] of [['screenerType', 'type', 'All types'], ['screenerBattleye', 'battleye', 'Any'], ['screenerLocation', 'location', 'Anywhere']]) {
      const values = options(pool, key);
      if (prefs[key] && !values.includes(prefs[key])) prefs[key] = '';
      select(id, [['', all], ...values.map(v => [v, v])], prefs[key]);
    }
  }

  // The filters that differ from the defaults, counted on the button that unfolds them where the Screener is narrow.
  function showFilterCount() {
    const n = ['status', 'type', 'battleye', 'location', 'data'].filter(k => prefs[k] !== DEFAULTS[k]).length;
    $('screenerFiltersToggle').textContent = n ? `Filters (${n})` : 'Filters';
  }

  function showDirection() {
    const b = $('screenerDirection'), up = prefs.dir > 0;
    b.dataset.dir = up ? 'ascending' : 'descending';
    b.setAttribute('aria-label', up ? 'Ascending order' : 'Descending order');
    b.title = up ? 'Ascending: select to sort descending' : 'Descending: select to sort ascending';
  }

  function card(r, { side, range, selected }) {
    const href = `markets.html?${new URLSearchParams({ world: r.world, side, range })}`;
    const chart = r.observedInRange && miniChart(r.points, { from: r.start, to: r.end, width: W, height: H });
    // A current world's old latest best offer says its day, as the list's indicator does.
    const stale = r.stale && r.lastDay ? `<span class="screen-day" title="Latest best offer: server day ${esc(r.lastDay)}">on ${esc(r.lastDay)}</span>` : '';
    const change = r.change
      ? `<span class="screen-change" title="${esc(`${range}: ${fmt(r.change.from.value)} on ${r.change.from.day} to ${fmt(r.change.to.value)} on ${r.change.to.day}`)}"><span class="${tone(r.delta)}">${signed.format(r.delta)}</span> <span class="${tone(r.delta)}">${percent.format(r.ratio)}</span></span>`
      : `<span class="screen-change">${num(null)}</span>`;
    const spark = chart ? `<svg class="screen-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        ${chart.area ? `<path class="spark-area" d="${chart.area}"/>` : ''}
        <path class="spark-base" d="M0 ${chart.base}H${W}"/>
        ${chart.solid ? `<path class="spark-solid" d="${chart.solid}"/>` : ''}${chart.dotted ? `<path class="spark-dotted" d="${chart.dotted}"/>` : ''}
        <path class="spark-last" d="M${chart.last.x} ${chart.last.y}h0"/></svg>`
      : `<span class="screen-spark screen-none">${r.last === null ? 'No market data yet' : 'No best offer in this range'}</span>`;
    const tx = r.txPerDay === null
      ? { text: num(null), title: `No daily figures for the ${OFFER[side]} side in this range.` }
      : { text: fmt(Math.round(r.txPerDay)), title: `Mean Number of Transactions per completed server day on the ${OFFER[side]} side, over the ${r.txDays} ${r.txDays === 1 ? 'day' : 'days'} with daily figures from ${r.txFirst} to ${r.txLast}. Raw activity counters; actual traded TC quantity is unknown.` };
    const depth = r.depth === null
      ? { text: num(null), title: `No captured ${OFFER[side]} depth for ${r.world}.` }
      : { text: fmt(r.depth), title: `Captured ${OFFER[side]} Depth on server day ${r.depthDay}: Tibia Coins across every visible ${OFFER[side]} Offer of the latest capture that recorded it. Offer depth, not traded volume.` };
    const meta = [r.type && `<span>${esc(r.type)}</span>`, r.battleye && `<span class="be-${esc(r.battleye)}">BattlEye ${esc(r.battleye)}</span>`,
      r.location && `<span>${esc(r.location)}</span>`].filter(Boolean).join('');
    const stat = (label, value, title = '', cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd${title ? ` title="${esc(title)}"` : ''}>${value}</dd></div>`;
    return `<li><a class="screen-card${r.status === 'retired' ? ' is-retired' : ''}" href="${esc(href)}" data-world="${esc(r.world)}"${r.world === selected ? ' aria-current="true"' : ''}>
      <span class="screen-head"><span class="screen-name">${esc(r.world)}${r.status === 'retired' ? '<span class="tag">Retired</span>' : ''}</span>
        <span class="screen-last${r.stale ? ' stale' : ''}" title="${esc(`Best ${OFFER[side]} Offer`)}">${num(r.last)}</span></span>
      <span class="screen-sub">${stale}${change}</span>
      ${spark}
      <dl class="screen-stats">
        ${stat('Sell', num(r.sell), '', side === 'sell' ? 'on' : '')}${stat('Buy', num(r.buy), '', side === 'buy' ? 'on' : '')}
        ${stat('Spread', r.spread === null ? num(null) : fmt(r.spread), r.spread === null ? '' : `Best Sell Offer less Best Buy Offer: ${share.format(r.spread / r.sell)} of the Sell Offer`)}
        ${stat('Tx/day', tx.text, tx.title)}${stat('Depth', depth.text, depth.title)}
      </dl>
      <span class="screen-meta">${meta}</span></a></li>`;
  }

  function render() {
    if (!data) return;
    const { index, overview, side, range, selected } = data;
    const rows = screenerRows(index, overview, { side, range });
    metadataOptions(rows);
    const filters = { query, ...prefs };
    const shown = sortRows(filterRows(rows, filters), prefs.sort, prefs.dir);
    const pool = filterRows(rows, { status: prefs.status });
    $('screenerGrid').innerHTML = shown.map(r => card(r, data)).join('');
    $('screenerGrid').classList.toggle('side-sell', side === 'sell');
    $('screenerGrid').classList.toggle('side-buy', side === 'buy');
    $('screenerCount').textContent = shown.length === pool.length ? `${pool.length} ${pool.length === 1 ? 'world' : 'worlds'}` : `${shown.length} of ${pool.length} worlds`;
    // An empty grid says why, and offers the retired worlds a search would otherwise have reached.
    const empty = $('screenerEmpty');
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      const retired = prefs.status === 'active' ? filterRows(rows, { ...filters, status: 'retired' }).length : 0;
      empty.innerHTML = `No ${prefs.status === 'all' ? '' : `${STATUSES[prefs.status].toLowerCase()} `}world matches.`
        + (retired ? ` <button type="button" class="world-link" data-status="all">Show ${retired} retired ${retired === 1 ? 'world' : 'worlds'}</button>` : '');
    }
    $('screenerThrough').textContent = `Server days through ${index.through}`;
    for (const b of $('screenerRange').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.range === range));
    showDirection();
    showFilterCount();
  }

  // Changing a filter or the order: remember it, and redraw.
  function set(key, value) { prefs[key] = value; remember(); render(); }
  for (const [id, key] of [['screenerStatus', 'status'], ['screenerType', 'type'], ['screenerBattleye', 'battleye'],
    ['screenerLocation', 'location'], ['screenerData', 'data']]) $(id).addEventListener('change', e => set(key, e.target.value));
  // A new key starts in its natural order: names A to Z, figures largest first.
  $('screenerSort').addEventListener('change', e => { prefs.dir = e.target.value === 'world' ? 1 : -1; set('sort', e.target.value); });
  $('screenerDirection').addEventListener('click', () => set('dir', -prefs.dir));
  $('screenerReset').addEventListener('click', () => {
    prefs = { ...DEFAULTS }; query = $('screenerFilter').value = '';
    $('screenerStatus').value = prefs.status; $('screenerData').value = prefs.data; $('screenerSort').value = prefs.sort;
    remember(); render();
  });
  $('screenerFilter').addEventListener('input', e => { query = e.target.value; render(); });
  $('screenerFiltersToggle').addEventListener('click', e => {
    const open = root.classList.toggle('filters-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  $('screenerEmpty').addEventListener('click', e => {
    const status = e.target.closest('[data-status]')?.dataset.status;
    if (status) { $('screenerStatus').value = status; set('status', status); }
  });
  // The Screener takes the chart's place, and with it the chart's side choice: it has its own, for the same side.
  $('screenerSide').addEventListener('click', e => {
    const side = e.target.closest('button')?.dataset.side;
    if (side && side !== data?.side) onSide(side);
  });
  $('screenerRange').addEventListener('click', e => {
    const range = e.target.closest('button')?.dataset.range;
    if (range && range !== data?.range) onRange(range);
  });
  // A plain click opens the world here; a click with a modifier or another button keeps the link's own behaviour.
  $('screenerGrid').addEventListener('click', e => {
    const card = e.target.closest('a[data-world]');
    if (!card || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(card.dataset.world);
  });

  return {
    // { index, overview, side, range, selected }: what to show; the overview may be null (no Tx/day or Depth).
    update(next) { data = next; render(); },
    get filters() { return { query, ...prefs }; }
  };
}
