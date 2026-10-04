// Asset-specific presentation over the same Markets chart, range, dock, events and PNG export.
import { esc } from './format.js';
import { RANGES, changeOver, rangeStart, dayGrid } from './market-series.js';
// Version the changed shared modules: GitHub Pages can retain pre-TIB code in browser caches.
import { createMarketChart, dayOf } from './market-chart.js?v=20261004-chart-first';
import { marketImage } from './market-export.js?v=20261004-chart-first';
import { dock } from './markets-dock.js';
import { EVENTS } from './market-events.js';
import { eventsPanel } from './market-events-panel.js?v=20261004-tib';
import { eventMarks } from './market-events-ui.js';
import { TOKEN_PROFILE, tokenPrice, tokenView, CONTRACT } from './tibia-token.js';
const $ = id => document.getElementById(id);
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const params = new URLSearchParams(location.search);
let range = RANGES.includes(params.get('range')) ? params.get('range') : '1Y';
let view, file;
const market = createMarketChart($('chart'), { profile: TOKEN_PROFILE }), chart = market.chart;
const marks = eventMarks({ chart, part: market.part('events'), strip: $('eventMarks'), tip: $('eventTip') });
const browser = eventsPanel($('eventsPanel'), {
  contextText: events => `Tibia Token events. Dates are Tibia server days; prices are UTC daily candles. ${events.length} recorded events.`,
  scopeText: () => 'Tibia Token',
  onFilter(events) { if (view) { view.events = events; market.refresh('events'); } },
  onFocus(event) {
    if (!event || !view.grid.length) return 'No token chart is available.';
    const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    view.grid = dayGrid([view.grid[0], shift(event.start, -7)].sort()[0], [view.grid.at(-1), shift(event.end, 7)].sort().at(-1));
    market.draw(view, 'sell'); showEvents(true);
    chart.timeScale().setVisibleRange({ from: shift(event.start, -7), to: shift(event.end, 7) });
    $('range').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', 'false'));
    requestAnimationFrame(() => requestAnimationFrame(() => marks.focusEvent(event.id)));
    return `Chart focused on ${event.start}.`;
  }
});
function showEvents(on) {
  market.setVisible('events', on); $('eventMarkers').checked = on;
  if (!on) marks.hide();
  try { localStorage.setItem('tibinance.markets.events', on ? 'shown' : 'hidden'); } catch { /* this visit only */ }
}
const change = () => changeOver(view.prices.map(p => ({ day: p.day, value: p.close })), rangeStart(view.end, range));
const changeText = c => c ? `${tokenPrice(c.to.value - c.from.value)} ${percent.format(c.ratio)}` : 'N/A';
function quote() {
  const last = view.prices.at(-1), c = change();
  $('lastPrice').textContent = last ? tokenPrice(last.close) : 'N/A';
  $('lastPrice').title = 'Daily close (USD / TIB)';
  $('lastChange').textContent = changeText(c); $('lastChange').classList.toggle('up', !!c && c.ratio > 0); $('lastChange').classList.toggle('down', !!c && c.ratio < 0); $('lastRange').textContent = c ? range : '';
  $('lastChange').title = c ? `${tokenPrice(c.from.value)} on ${c.from.day} to ${tokenPrice(c.to.value)} on ${c.to.day}` : '';
  $('chart').setAttribute('aria-label', `Tibia Token daily close in USD and pool trading volume in USD. UTC history ${view.prices[0]?.day ?? 'unavailable'} to ${view.end ?? 'unavailable'}.`);
}
function legend(day) {
  const rest = day == null;
  day ??= view?.end;
  const p = view?.byDay.get(day);
  // The candle's open, high and low beside its close, as a terminal reads a bar.
  const ohl = p ? ` <span class="rest"><span class="meta-label">O</span> ${tokenPrice(p.open)} <span class="meta-label">H</span> ${tokenPrice(p.high)} <span class="meta-label">L</span> ${tokenPrice(p.low)}</span>` : '';
  $('legend').innerHTML = `<span class="day">${esc(day ?? '')} UTC</span> <span class="label"><i class="key key-dot"></i>Daily close</span> <b class="value">${p ? tokenPrice(p.close) : 'N/A'}</b>${ohl}`;
  $('volumeLegend').innerHTML = `<span class="day"></span> <span class="label"><i class="key key-volume"></i>Pool volume</span> <b class="value">${p ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(p.volumeUsd) : 'N/A'}</b>`;
  // The chart's status stands over its top: the price scale starts below it (js/market-chart.js fitTop).
  if (rest) market.fitTop?.($('chartHead'));
}
new ResizeObserver(() => requestAnimationFrame(() => market.fitTop?.($('chartHead')))).observe($('chart'));
function applyRange() {
  $('range').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.range === range)));
  if (view.grid.length) {
    const start = rangeStart(view.end, range);
    chart.timeScale().setVisibleRange({ from: start && start > view.prices[0].day ? start : view.prices[0].day, to: view.end });
  }
  const url = new URL(location.href); url.searchParams.set('asset', 'tibia-token'); url.searchParams.set('range', range);
  url.searchParams.delete('world'); url.searchParams.delete('side'); url.searchParams.delete('view'); history.replaceState(null, '', url);
  quote();
}
async function exportImage() {
  $('exportButton').disabled = true;
  try {
    const last = view.prices.at(-1), c = change(), shown = chart.timeScale().getVisibleRange();
    const canvas = await marketImage({ view, side: 'sell', logicalRange: chart.timeScale().getVisibleLogicalRange(), hidden: market.visible('events') ? [] : ['events'],
      context: { world: 'Tibia Token (TIB)', tag: '', meta: [file.pair, file.venue, 'BNB Smart Chain'], value: tokenPrice(last.close),
        valueNote: `Daily close on ${last.day} UTC`, change: c && { text: changeText(c), tone: c.ratio > 0 ? 'up' : 'down', note: `change over ${range}` },
        shown: `UTC days ${dayOf(shown.from)} to ${dayOf(shown.to)}`, footer: `Completed UTC candles. Single pool USD prices and volume. History through ${view.end}.` } });
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed.')), 'image/png'));
    const url = URL.createObjectURL(blob), name = `tibinance-tib-usd-${range.toLowerCase()}-${view.end}.png`;
    const link = Object.assign(document.createElement('a'), { href: url, download: name }); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); $('exportStatus').textContent = `Saved ${name}.`;
  } catch (e) { console.error(e); $('exportStatus').textContent = 'The chart image could not be exported.'; }
  finally { $('exportButton').disabled = !view.grid.length; }
}
async function main() {
  // TIB has no world selection, offer side or TC forecast.
  $('side').hidden = true; $('projectionsToggle').hidden = true;
  $('screenerToggle')?.setAttribute('hidden', '');
  $('world').textContent = 'Tibia Token (TIB)';
  $('worldMeta').textContent = 'TIB / USD'; $('market').classList.add('side-sell');
  const response = await fetch('data/market-history/tibia-token/history.json');
  if (!response.ok) throw new Error(`TIB history: ${response.status}`);
  file = await response.json();
  let events = null;
  try { const response = await fetch(EVENTS); if (response.ok) events = await response.json(); } catch { /* price history remains usable */ }
  view = tokenView(file, events);
  const relevant = new Set(view.events.map(e => e.id));
  const dataset = events && { ...events, events: events.events.filter(e => relevant.has(e.id)), categories: events.categories.filter(c => view.events.some(e => e.category.id === c.id)) };
  $('eventScope').parentElement.hidden = true;
  $('worldsPanel').setAttribute('aria-label', 'Tibia Token details');
  document.querySelector('[data-dock-target="worldsPanel"]').setAttribute('aria-label', 'Asset details');
  $('worldsPanel').innerHTML = `<div class="panel-head"><h2 class="panel-title">Tibia Token</h2></div><div class="panel-body"><p>TIB / USD</p><p>${esc(file.venue)} ${esc(file.pair)} pool on BNB Smart Chain.</p><p><a href="https://bscscan.com/token/${CONTRACT}" target="_blank" rel="noopener">Official token contract</a><br><code style="overflow-wrap:anywhere">${CONTRACT}</code></p><p>History: ${view.prices[0]?.day ?? 'N/A'} to ${view.end ?? 'N/A'} UTC.</p><p>${esc(file.coverageNote)}</p><p><a href="${esc(file.sourceUrl)}" target="_blank" rel="noopener">Pool and data source</a></p><p>One pool's USD prices and trading volume. Liquidity and prices may differ between pools.</p></div>`;
  $('helpPanel').querySelector('.panel-body').innerHTML = '<p>Daily close is the last traded price in each completed UTC pool candle, quoted in USD per TIB. Bars show the pool’s trading volume in USD.</p><p>Solid lines join consecutive observed days. Dotted lines span missing days; no price is interpolated.</p><p>Ranges end on the last completed candle. Change compares its close with the last close on or before the range start, or the first available close.</p><p>Token event dates follow Tibia’s server-day calendar; price candles follow UTC. Events are contextual markers, not evidence of a price effect.</p>';
  $('through').textContent = view.end ? `UTC days through ${view.end}` : 'No completed candles';
  await document.fonts.ready;
  dock($('dock'), { key: 'tibinance.markets.dock', roomy: () => matchMedia('(min-width:1280px)').matches,
    onChange() { const days = chart.timeScale().getVisibleLogicalRange(); requestAnimationFrame(() => requestAnimationFrame(() => { if (days) chart.timeScale().setVisibleLogicalRange(days); })); } });
  market.draw(view, 'sell'); browser.update(dataset, 'Tibia Token');
  $('eventMarkers').disabled = !dataset;
  let on = true; try { on = localStorage.getItem('tibinance.markets.events') !== 'hidden'; } catch { /* this visit only */ } showEvents(on);
  await new Promise(requestAnimationFrame); applyRange(); legend();
  chart.subscribeCrosshairMove(p => legend(p.time === undefined ? null : dayOf(p.time)));
  $('range').addEventListener('click', e => { const next = e.target.closest('button')?.dataset.range; if (next) { range = next; applyRange(); } });
  $('eventMarkers').addEventListener('change', e => showEvents(e.target.checked));
  $('exportButton').addEventListener('click', exportImage);
  $('expand').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await $('market').requestFullscreen();
      else $('market').classList.toggle('expanded');
    } catch { $('market').classList.toggle('expanded'); }
    expanded();
  });
  function expanded() {
    const on = !!document.fullscreenElement || $('market').classList.contains('expanded');
    $('expand').setAttribute('aria-pressed', String(on)); $('expand').setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  }
  document.addEventListener('fullscreenchange', expanded);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('market').classList.remove('expanded'); expanded(); } });
  $('status').hidden = !!view.grid.length; $('exportButton').disabled = !view.grid.length;
  if (!view.grid.length) $('status').textContent = 'No completed TIB candles are available.';
  $('market').setAttribute('aria-busy', 'false');
}
main().catch(e => { console.error(e); $('status').hidden = false; $('status').textContent = 'The Tibia Token history could not be loaded.'; $('exportButton').disabled = true; $('market').setAttribute('aria-busy', 'false'); });
