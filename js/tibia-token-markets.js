// Asset-specific presentation over the same Markets chart, range, dock, events and PNG export.
import { config } from './config.js';
import { esc } from './format.js';
import { RANGES, changeOver, rangeStart, dayGrid } from './market-series.js';
// Version the changed shared modules: GitHub Pages can retain pre-TIB code in browser caches.
import { createMarketChart, dayOf } from './market-chart.js?v=20261015-inline';
import { marketImage, pageDetails } from './market-export.js?v=20261015-inline';
import { dock } from './markets-dock.js';
import { loadEvents, addEventDays } from './events.js';
import { eventsPanel } from './market-events-panel.js?v=20261014-rebuild';
import { eventMarks } from './market-events-ui.js?v=20261015-left2';
import { tokenView, CONTRACT } from './tibia-token.js?v=20261015-quality';
import { connect, changed } from './tv-bridge.js';
import { currencySettings, currencyControls } from './token-currency-controls.js?v=20261015-inline';
import { createCurrencyProfile, currencyView, formatChart, METRICS, isPurchase, isPercent } from './coin-cost-chart.js?v=20261015-inline';
import { comparePackage, observationOn, money } from './coin-costs.js?v=20261015-inline';
import { rateOn } from './foreign-exchange.js';
const $ = id => document.getElementById(id);
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const params = new URLSearchParams(location.search);
let range = RANGES.includes(params.get('range')) ? params.get('range') : config.marketRange;
let view, file, base, dataset=null;
let currencyData={rates:[],observations:[],status:'Loading ECB rates…'};
const settings=currencySettings(), profile=createCurrencyProfile(settings);
const tokenPrice=value=>formatChart(value,settings);
const market = createMarketChart($('chart'), { profile }), chart = market.chart;
const marks = eventMarks({ chart, part: market.part('events'), strip: $('eventMarks'), tip: $('eventTip') });
const browser = eventsPanel($('eventsPanel'), {
  onFilter(events) { if (view) { base.events = events; view.events = events; market.refresh('events'); } },
  onFocus(event) {
    if (!event || !view.grid.length) return 'No token chart is available.';
    const shift = addEventDays;
    view.grid = dayGrid([view.grid[0], shift(event.start, -7)].sort()[0], [view.grid.at(-1), shift(event.end, 7)].sort().at(-1));
    market.draw(view, 'sell'); showEvents(true);
    chart.timeScale().setVisibleRange({ from: shift(event.start, -7), to: shift(event.end, 7) });
    $('range').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', 'false'));
    requestAnimationFrame(() => requestAnimationFrame(() => marks.focusEvent(event.id)));
    return `Chart focused on ${event.start}.`;
  }
});
function showEvents(on) {
  market.setVisible('events', on); $('eventMarkers').setAttribute('aria-pressed', String(on));
  if (!on) marks.hide();
  try { localStorage.setItem('tibinance.markets.events', on ? 'shown' : 'hidden'); } catch { /* this visit only */ }
}
const change = () => !view.end ? null : changeOver(view.prices.map(p => ({ day: p.day, value: p.close })), rangeStart(view.end, range));
const changeText = c => c ? `${tokenPrice(c.to.value-c.from.value)}${Number.isFinite(c.ratio)&&!isPercent(settings.metric)?` ${percent.format(c.ratio)}`:''}` : 'N/A';
function quote() {
  const last = view.prices.at(-1), c = change();
  $('lastPrice').textContent = last ? tokenPrice(last.close) : 'N/A';
  $('lastPrice').title = `${METRICS[settings.metric]} (${settings.currency})`;
  $('worldMeta').textContent=settings.metric==='token'?`TIB / ${settings.currency}`:`${METRICS[settings.metric]}${isPurchase(settings.metric)?` | ${settings.coins.toLocaleString('en-US')} TC`:''}`;
  $('lastChange').textContent = changeText(c); $('lastChange').classList.toggle('up', !!c && c.ratio > 0); $('lastChange').classList.toggle('down', !!c && c.ratio < 0); $('lastRange').textContent = c ? range : '';
  $('lastChange').title = c ? `${tokenPrice(c.from.value)} on ${c.from.day} to ${tokenPrice(c.to.value)} on ${c.to.day}` : '';
  $('chart').setAttribute('aria-label', `${METRICS[settings.metric]} in ${settings.currency}. UTC history ${view.prices[0]?.day??'unavailable'} to ${view.end??'unavailable'}. ${currencyData.status}`);
}
function legend(day) {
  const rest=day==null; day??=view?.end;
  const p=view?.byDay.get(day), row=view?.rowByDay.get(day);
  if(settings.metric==='token') {
    const ohl=p?` <span class="rest ohlc">${[['O',p.open],['H',p.high],['L',p.low]].map(([k,v])=>`<span><span class="meta-label">${k}</span> ${tokenPrice(v)}</span>`).join(' ')}</span>`:'';
    $('legend').innerHTML=`<span class="day">${esc(day??'')} UTC</span><span class="label"><i class="key key-dot"></i>Daily close</span><b class="value">${p?tokenPrice(p.close):'N/A'}</b>${ohl}`;
  } else if(isPurchase(settings.metric)) {
    const o=settings.mode==='scenario'?currencyData.observations.at(-1):observationOn(currencyData.observations,day??'');
    const pkg=o?.packages.find(p=>p.coins===settings.coins), fx=rateOn(currencyData.rates,day??'');
    const token=file.prices.find(p=>p.day===(row?.tokenDay??day))??(rest&&day===currencyData.rates.at(-1)?.day?file.prices.at(-1):null), comparison=pkg&&fx?comparePackage(pkg,settings.currency,fx,token?.close):null;
    $('legend').innerHTML=`<span class="day">${esc(day??'')} UTC${row?.tokenDay?` | TIB close ${row.tokenDay}`:''}${comparison?` | Cheapest ${comparison.cheapestCurrencies.join(' / ')}`:''}</span>`+['EUR','BRL','USD'].map((c,i)=>{
      const r=comparison?.rows[i], pair=settings.metric==='pairwise', label=pair?['BRL/EUR','USD/EUR','USD/BRL'][i]:c, detail=pair?`${label} purchase-price difference, denominator is the second purchase currency`:r?`Official ${r.original===null?'Unavailable':money(r.original,c)} | ${money(r.tib,'TIB')} | ${money(r.perCoin,settings.currency,true)}/TC | ${r.premium===null?'N/A':percent.format(r.premium)} vs cheapest | Save ${money(r.saving,settings.currency)} (${r.savingRatio===null?'N/A':percent.format(r.savingRatio)})`:'';
      return `<span class="label" title="${esc(detail)}"><i class="key key-dot" style="--side:var(${['--tv-brand','--sell','--tv-chart-text'][i]})"></i>${label}</span><b class="value" title="${esc(detail)}">${r?.original===null?'Unavailable':tokenPrice(row?.values[c]??null)}</b><span class="rest meta">${esc(detail)}</span>`;
    }).join('');
  } else $('legend').innerHTML=`<span class="day">${esc(day??'')} UTC</span><span class="label"><i class="key key-dot"></i>${METRICS[settings.metric]}</span><b class="value">${p?tokenPrice(p.close):'N/A'}</b>`;
  $('volumeLegend').innerHTML=view?.tokenMode?`<span class="day"></span><span class="label"><i class="key key-volume"></i>Pool volume</span><b class="value">${p?money(p.volumeUsd,'USD'):'N/A'}</b>`:'';
  if(row?.fxDay&&row.fxDay!==day) $('volumeLegend').innerHTML+=`<span class="day">FX publication ${row.fxDay}</span>`;
  $('chart').setAttribute('aria-label',`${METRICS[settings.metric]}. ${$('legend').textContent}. ${currencyData.status}. Fees excluded; theoretical TIB equivalents.`);
  if(rest)market.fitTop?.($('chartHead'));
}
function redraw(data) {
  currencyData=data;
  if(data.token!==file){const events=base.events;file=data.token;base=tokenView(file,dataset);base.events=events;}
  view=currencyView(base,data.rates,data.observations,settings,profile);
  market.draw(view,'sell');applyRange();legend();changed();
  $('through').textContent=view.end?`UTC days through ${view.end}`:'No overlapping observations';
  $('status').hidden=!!view.grid.length;
  if(!view.grid.length)$('status').textContent=base.prices.length?'No observations for this currency and price basis. Choose a fixed-price scenario or refresh the data.':'No completed TIB candles are available.';
  $('exportButton').disabled=!view.grid.length;
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
      context: { world: 'Tibia Token (TIB)', tag: '', meta: [METRICS[settings.metric],settings.currency,isPurchase(settings.metric)?`${settings.coins} TC | ${settings.mode==='scenario'?'Fixed-price scenario':'Dated prices'}`:file.venue], value: tokenPrice(last.close),
        valueNote: `${settings.metric==='token'?'Daily close':'Calculated value'} on ${last.day} UTC`, change: c && { text: changeText(c), tone: c.ratio > 0 ? 'up' : 'down', note: `change over ${range}` },
        shown: `UTC days ${dayOf(shown.from)} to ${dayOf(shown.to)}`, footer: `${currencyData.status}. Fees excluded. TIB equivalents imply no redemption.`, details: pageDetails() } });
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed.')), 'image/png'));
    const url = URL.createObjectURL(blob), name = `tibinance-tib-${settings.currency.toLowerCase()}-${settings.metric==='token'?'':`${settings.metric}-`}${range.toLowerCase()}-${view.end}.png`;
    const link = Object.assign(document.createElement('a'), { href: url, download: name }); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), config.downloadRevokeMs); $('exportStatus').textContent = `Saved ${name}.`;
  } catch (e) { console.error(e); $('exportStatus').textContent = 'The chart image could not be exported.'; }
  finally { $('exportButton').disabled = !view.grid.length; }
}
async function main() {
  // TIB has no world selection, offer side or TC forecast.
  $('side').hidden = true; $('projectionsToggle').hidden = true;
  $('screenerToggle')?.setAttribute('hidden', '');
  $('world').textContent = 'Tibia Token (TIB)';
  document.querySelector('.tv-legend-int > span:last-child').textContent='Tibia Token';
  $('worldMeta').textContent = 'TIB / USD'; $('market').classList.add('side-sell');
  const response = await fetch('data/market-history/tibia-token/history.json');
  if (!response.ok) throw new Error(`TIB history: ${response.status}`);
  file = await response.json();
  dataset = null;
  try { dataset = await loadEvents(); } catch (error) { console.warn('Events are unavailable.', error); }
  base=tokenView(file,dataset);
  view=currencyView(base,[],[],settings,profile);
  $('worldsPanel').setAttribute('aria-label', 'Tibia Token details');
  document.querySelector('[data-dock-target="worldsPanel"]').setAttribute('aria-label', 'Asset details');
  $('worldsPanel').innerHTML = `<div class="panel-head"><h2 class="panel-title">Tibia Token</h2></div><div class="panel-body"><p>TIB / USD</p><p>${esc(file.venue)} ${esc(file.pair)} pool on BNB Smart Chain.</p><p><a href="https://bscscan.com/token/${CONTRACT}" target="_blank" rel="noopener">Official token contract</a><br><code style="overflow-wrap:anywhere">${CONTRACT}</code></p><p>History: ${base.prices[0]?.day ?? 'N/A'} to ${base.end ?? 'N/A'} UTC.</p><p>${esc(file.coverageNote)}</p><p><a href="${esc(file.sourceUrl)}" target="_blank" rel="noopener">Pool and data source</a></p><p>One pool's USD prices and trading volume. Liquidity and prices may differ between pools.</p></div>`;
  $('helpPanel').querySelector('.panel-body').innerHTML = '<p>Currency changes the chart. Select a series for exchange rates, package costs, savings or purchasing power. Fixed-price scenario uses the 2026-10-15 manual list hypothetically; dated prices never extend before their effective dates. All fees are excluded. TIB equivalents do not imply redemption.</p><p>Daily close is the last traded price in each completed UTC pool candle, quoted in USD per TIB. Bars show the pool’s trading volume in USD.</p><p>Solid lines join consecutive observed days. Dotted lines span missing days; no price is interpolated.</p><p>Ranges end on the last completed candle. Change compares its close with the last close on or before the range start, or the first available close.</p><p>Token event dates follow Tibia’s server-day calendar; price candles follow UTC. Events are contextual markers, not evidence of a price effect.</p>';
  $('through').textContent = view.end ? `UTC days through ${view.end}` : 'No completed candles';
  await document.fonts.ready;
  dock($('dock'), { key: 'tibinance.markets.dock', roomy: () => matchMedia('(min-width:1280px)').matches,
    onChange() { const days = chart.timeScale().getVisibleLogicalRange(); requestAnimationFrame(() => requestAnimationFrame(() => { if (days) chart.timeScale().setVisibleLogicalRange(days); })); } });
  market.draw(view, 'sell'); browser.update(dataset);
  $('eventMarkers').disabled = !dataset;
  let on = true; try { on = localStorage.getItem('tibinance.markets.events') !== 'hidden'; } catch { /* this visit only */ } showEvents(on);
  await new Promise(requestAnimationFrame); applyRange(); legend();
  chart.subscribeCrosshairMove(p => legend(p.time === undefined ? null : dayOf(p.time)));
  $('range').addEventListener('click', e => { const next = e.target.closest('button')?.dataset.range; if (next) { range = next; applyRange(); } });
  $('eventMarkers').addEventListener('click', () => showEvents($('eventMarkers').getAttribute('aria-pressed') !== 'true'));
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
  // The terminal's toolbars reach the chart through this context (js/tv-bridge.js).
  connect({
    page: 'token', chart,
    series: () => market.part('token-price').points,
    key: () => settings.metric==='token'&&settings.currency==='USD'?'markets:tibia-token:TIB':`markets:tibia-token:${settings.metric}:${settings.currency}:${settings.coins}:${settings.mode}`,
    symbol: () => settings.metric==='token'?`TIB / ${settings.currency}`:METRICS[settings.metric],
    times: () => view.grid,
    values: () => view.prices.map(p => ({ time: p.day, value: p.close })),
    format: tokenPrice,
    reset: () => { chart.priceScale('right').applyOptions({ autoScale: true }); applyRange(); },
    setStyle: style => market.setStyle(style),
    retheme: () => market.retheme(),
    replay: day => {
      const prices = day ? view.prices.filter(p => p.day <= day) : null;
      market.draw(prices ? { ...view, prices, rows:view.rows.filter(p=>p.day<=day), byDay: new Map(prices.map(p => [p.day, p])) } : view, 'sell');
      if (!day) applyRange();
    },
  });
  $('status').hidden = !!view.grid.length; $('exportButton').disabled = !view.grid.length;
  if (!view.grid.length) $('status').textContent = base.prices.length?'Loading currency data…':'No completed TIB candles are available.';
  $('market').setAttribute('aria-busy', 'false');
  currencyControls(settings,file,redraw);
}
main().catch(e => { console.error(e); $('status').hidden = false; $('status').textContent = 'The Tibia Token history could not be loaded.'; $('exportButton').disabled = true; $('market').setAttribute('aria-busy', 'false'); });
