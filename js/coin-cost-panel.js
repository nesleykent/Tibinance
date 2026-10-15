import { esc } from './format.js';
import { rangeStart } from './market-series.js';
import { loadFx, stale } from './foreign-exchange.js';
import { CURRENCIES, FIAT, comparePackage, money, observationOn, validatePrices } from './coin-costs.js';
import { costChart, METRICS } from './coin-cost-chart.js';
const percent = new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:2,signDisplay:'exceptZero'});
const pct = value => value === null ? 'N/A' : percent.format(value);
const countries = { EUR:'Germany', BRL:'Brazil', USD:'United States' };
const KEY = 'tibinance.coin-cost.currency';
export function mountCoinCosts(tokenFile) {
  const opener = Object.assign(document.createElement('button'), {id:'coinCostsOpen',type:'button',className:'tv-btn',textContent:'Coin costs'});
  opener.setAttribute('aria-controls','coinCosts'); opener.setAttribute('aria-expanded','false');
  document.querySelector('#chartHead .head-line').append(opener);
  const root = Object.assign(document.createElement('section'), { id:'coinCosts',className:'coin-costs',hidden:true });
  root.setAttribute('aria-labelledby','coinCostsTitle');
  root.innerHTML = `<header class="cost-head"><h2 id="coinCostsTitle">Tibia Coin costs</h2>
    <label>Display currency <select id="costCurrency">${CURRENCIES.map(c=>`<option>${c}</option>`).join('')}</select></label>
    <button type="button" id="costClose" class="tv-btn">Back to TIB chart</button></header>
    <div class="cost-body"><p class="cost-note">Compare official purchase prices using reference exchange rates. TIB amounts are theoretical market equivalents, with no implied redemption for Tibia Coins. All fees and exchange spreads are excluded.</p>
    <p id="costStatus" class="cost-status" role="status" aria-live="polite">Loading currency comparisons…</p>
    <button type="button" id="costRefresh" class="tv-btn">Refresh data</button>
    <div id="costContent" hidden><dl id="costRates" class="cost-rates"></dl>
    <p id="costDates" class="cost-note"></p>
    <div class="cost-table-scroll" tabindex="0" role="region" aria-label="Package comparison, scroll for all columns"><table class="cost-table">
      <caption id="costCaption"></caption><thead><tr><th scope="col">Package / purchase currency</th><th scope="col">Official price</th><th scope="col" id="costConvertedHead">Equivalent</th><th scope="col">TIB equivalent</th><th scope="col">Per TC</th><th scope="col">Above cheapest</th><th scope="col">Save by switching</th></tr></thead><tbody id="costRows"></tbody></table></div>
    <p class="cost-note">“Above cheapest” = (price ÷ cheapest − 1). Savings = price − cheapest; savings % uses the original price as denominator. Comparisons exclude unavailable purchase currencies. A price tie can have more than one cheapest currency.</p>
    <details><summary>Differences between purchase currencies</summary><p class="cost-note">Each percentage compares the second purchase currency with the first, using the first as denominator. Positive means the second costs more.</p><div class="cost-table-scroll" tabindex="0" role="region" aria-label="Pairwise purchasing-price differences"><table class="cost-table"><thead><tr><th scope="col">Package</th><th scope="col">BRL vs EUR</th><th scope="col">USD vs EUR</th><th scope="col">USD vs BRL</th></tr></thead><tbody id="costPairwise"></tbody></table></div></details>
    <section class="cost-history" aria-labelledby="costHistoryTitle"><h3 id="costHistoryTitle">Currency & purchasing power history</h3>
    <div class="cost-controls">
      <label>Analysis <select id="costMetric">${Object.entries(METRICS).map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select></label>
      <label id="costPackageLabel">Package <select id="costPackage"></select></label>
      <label id="costModeLabel">Price basis <select id="costMode"><option value="observed">Dated manual observations</option><option value="scenario">Constant-price scenario</option></select></label>
      <label>Range <select id="costRange"><option>1M</option><option>3M</option><option>1Y</option><option selected>All</option></select></label>
    </div><p id="costBasis" class="cost-note"></p><p id="costHistoryEmpty" class="cost-empty" hidden></p>
    <div id="costChart" class="cost-chart" role="img"></div><div id="costChartKey" class="cost-chart-key" aria-label="History series"></div>
    <p id="costReadout" aria-live="off"></p><p id="costAnalysis" class="cost-note"></p>
    <details><summary>Historical values & source dates</summary><div class="cost-table-scroll" tabindex="0" role="region" aria-label="Historical values, scroll for all columns"><table class="cost-table"><thead id="costHistoryHead"></thead><tbody id="costHistoryRows"></tbody></table></div></details>
    </section><p class="cost-note">FX: <a href="https://frankfurter.dev/" target="_blank" rel="noopener">Frankfurter</a>, restricted to <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener">European Central Bank reference rates</a>. Normally published around 16:00 CET on working days; no intraday or executable rate is implied. USD/BRL is derived from the same EUR snapshot. Historic token valuations use the latest preceding FX publication, at most four calendar days old; its date remains visible. Missing observations stay gaps.</p></div></div>`;
  document.getElementById('chartPanel').after(root);
  const $ = id => root.querySelector(`#${id}`);
  let currency='EUR', fx=null, prices=null, cached=false, historyChart=null, busy=false, loadingError='', token=tokenFile;
  try { const saved=localStorage.getItem(KEY); if(CURRENCIES.includes(saved)) currency=saved; } catch { /* this visit only */ }
  $('costCurrency').value=currency;
  function open(on) {
    root.hidden=!on; document.getElementById('chartPanel').hidden=on;
    opener.setAttribute('aria-expanded',String(on));
    if(on) { renderHistory(); $('costCurrency').focus(); } else opener.focus();
  }
  opener.addEventListener('click',()=>open(true));
  $('costClose').addEventListener('click',()=>open(false));
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();open(false);}});
  function render() {
    if(!fx || !prices) return;
    const now = new Date(), latest=fx.rates.at(-1), last=token.prices.at(-1);
    const o=observationOn(prices.observations,now.toISOString().slice(0,10));
    if(!o) { $('costStatus').textContent='No manual prices are effective yet.'; return; }
    $('costContent').hidden=false;
    const isStale=stale(latest.day,now), tokenStale=!last || (Date.parse(now.toISOString().slice(0,10))-Date.parse(last.day))/86400000>2;
    $('costStatus').classList.toggle('stale',isStale||tokenStale||cached||!!loadingError);
    $('costStatus').textContent=[loadingError, cached?'Cached snapshot | refresh unavailable.':'Persisted daily snapshot.',isStale?'Stale FX data.':'',tokenStale?'Stale or unavailable TIB close.':'',`FX publication ${latest.day}.`].filter(Boolean).join(' ');
    const prev=fx.rates.at(-2);
    $('costRates').innerHTML=[['EUR','BRL'],['EUR','USD'],['USD','BRL']].map(([from,to])=>{
      const rate=latest[to]/latest[from], change=prev?rate/(prev[to]/prev[from])-1:null;
      return `<div><dt>${from} / ${to}</dt><dd>${rate.toFixed(5)} <span>${pct(change)}</span></dd><dd class="cost-note">${prev?`vs ${prev.day}`:'No prior publication'}</dd></div>`;
    }).join('');
    $('costDates').textContent=`FX retrieved ${new Date(fx.fetchedAt).toLocaleString()} | TIB completed USD close ${last?.day??'unavailable'} UTC${last?` (${money(last.close,'USD',true)} / TIB)`:''}. All conversions in this table share the ${latest.day} FX snapshot; TIB uses that separately dated close.`;
    $('costCaption').textContent=`Manually supplied CipSoft prices | effective ${o.effectiveFrom}. Germany EUR is the fixed commercial reference; BRL and USD are independent official prices.`;
    $('costConvertedHead').textContent=`Equivalent (${currency})`;
    $('costRows').innerHTML=o.packages.map(pkg=>{
      const result=comparePackage(pkg,currency,latest,last?.close);
      return result.rows.map((r,i)=>`<tr><th scope="row">${i===0?`<span class="cost-package">${pkg.coins.toLocaleString('en-US')} TC</span><span class="cost-summary">Cheapest: ${result.cheapestCurrencies.join(' / ')||'N/A'}</span>`:`<span class="sr-only">${pkg.coins.toLocaleString('en-US')} TC </span>`}${countries[r.currency]} | ${r.currency}${result.cheapestCurrencies.includes(r.currency)?'<span class="cost-summary cost-best">Cheapest</span>':''}</th>
        <td>${r.original===null?'Unavailable':money(r.original,r.currency)}</td><td>${money(r.converted,currency)}</td><td>${money(r.tib,'TIB')}</td><td>${money(r.perCoin,currency,true)}</td><td>${pct(r.premium)}</td><td>${money(r.saving,currency)} <span class="cost-summary">${pct(r.savingRatio)}</span></td></tr>`).join('');
    }).join('');
    $('costPairwise').innerHTML=o.packages.map(pkg=>{
      const {rows}=comparePackage(pkg,currency,latest,last?.close);
      return `<tr><th scope="row">${pkg.coins.toLocaleString('en-US')} TC</th>${[[0,1],[0,2],[1,2]].map(([a,b])=>`<td>${pct(rows[a].eur===null||rows[b].eur===null?null:rows[b].eur/rows[a].eur-1)}</td>`).join('')}</tr>`;
    }).join('');
    const chosen=$('costPackage').value;
    $('costPackage').innerHTML=o.packages.map(p=>`<option value="${p.coins}">${p.coins.toLocaleString('en-US')} TC</option>`).join('');
    if([...$('costPackage').options].some(p=>p.value===chosen)) $('costPackage').value=chosen;
    renderHistory();
  }
  function renderHistory() {
    if(!fx||!prices||root.hidden) return;
    historyChart ??= costChart($('costChart'),$('costReadout'));
    const metric=$('costMetric').value, mode=$('costMode').value;
    const purchasing=['cost','power','premium'].includes(metric), pair=metric.includes('-');
    $('costModeLabel').hidden=!purchasing; $('costPackageLabel').hidden=!purchasing;
    const settings={metric,mode,currency,coins:Number($('costPackage').value),range:$('costRange').value};
    const rows=historyChart.update(fx.rates,token.prices,prices.observations,settings);
    const unit=metric==='token'?(currency==='TIB'?'USD':currency):currency;
    const keys=pair||metric==='token'?['EUR']:FIAT;
    const label=c=>pair?METRICS[metric]:metric==='token'?`TIB / ${unit}`:c;
    const value=(v,c)=>v===null||v===undefined?'N/A':pair?v.toFixed(5):metric==='power'?`${v.toFixed(6)} TC / TIB`:metric==='premium'?`${v.toFixed(2)}%`:money(v,unit,metric==='token');
    $('costBasis').textContent=purchasing?(mode==='observed'?`Uses manual prices only from each effective date onward. No CipSoft prices are known before ${prices.observations[0].effectiveFrom}.`:`Scenario using the ${prices.observations.at(-1).effectiveFrom} price list held constant across earlier exchange rates and TIB closes. These are hypothetical equivalents, not historical official prices.`)
      :metric==='token'?`Completed TIB candles expressed in ${unit} per TIB, using the prior ECB publication within four days.`:'Observed ECB reference rates. Change is measured between actual publications.';
    $('costChartKey').innerHTML=keys.map(c=>`<span class="cost-key">${label(c)}</span>`).join('');
    const end=rows.at(-1)?.day, cut=end?rangeStart(end,$('costRange').value):null;
    const shown=rows.filter(r=>!cut||r.day>=cut);
    const from=shown[0],to=shown.at(-1);
    $('costHistoryEmpty').hidden=shown.length>1;
    $('costHistoryEmpty').textContent=shown.length===1?'One dated observation is available. More observations are needed for a historical trend.':'No overlapping observations for this analysis. Choose another currency, metric, or the explicitly labelled constant-price scenario.';
    $('costAnalysis').textContent=from&&to&&from!==to?keys.filter(c=>from.values[c]!==null&&to.values[c]!==null).map(c=>`${label(c)}: ${value(from.values[c],c)} on ${from.day} → ${value(to.values[c],c)} on ${to.day} (${metric==='premium'?`${(to.values[c]-from.values[c]).toFixed(2)} percentage points`:pct(from.values[c]===0?null:to.values[c]/from.values[c]-1)}).`).join(' '):'';
    // The table is an accessible alternative to the canvas; both use the canonical calendar range.
    $('costHistoryHead').innerHTML=`<tr><th scope="col">UTC day</th>${keys.map(c=>`<th scope="col">${label(c)}</th>`).join('')}<th scope="col">FX publication</th>${purchasing?'<th scope="col">Price effective date</th>':''}</tr>`;
    $('costHistoryRows').innerHTML=shown.map(r=>`<tr><th scope="row">${r.day}</th>${keys.map(c=>`<td>${esc(value(r.values[c],c))}</td>`).join('')}<td>${r.fxDay}</td>${purchasing?`<td>${r.effectiveFrom}</td>`:''}</tr>`).join('');
  }
  async function refresh(reloadToken=true) {
    if(busy) return; busy=true; $('costRefresh').disabled=true;
    $('costStatus').textContent='Loading currency comparisons…'; root.setAttribute('aria-busy','true');
    try {
      const [result,response]=await Promise.all([loadFx(),fetch('data/coin-prices.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)})]);
      if(!response.ok) throw new Error(`Manual price file: ${response.status}`);
      const nextPrices=validatePrices(await response.json());
      fx=result.file; cached=result.cached; prices=nextPrices; loadingError='';
      // Reuse the existing persisted TIB feed, with the same identity and candle validation as Markets.
      if(reloadToken) try {
        const r=await fetch('data/market-history/tibia-token/history.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});
        if(!r.ok) throw new Error('Token refresh unavailable');
        const next=await r.json();
        const {tokenView}=await import('./tibia-token.js?v=20261015-quality'); tokenView(next,null); token=next;
      } catch { loadingError='TIB refresh unavailable; using the loaded close.'; }
      render();
    } catch (error) {
      loadingError='Currency comparison refresh failed. Last loaded data are retained.';
      if(fx&&prices) render(); else $('costStatus').textContent='Currency comparisons are unavailable. Use Refresh data to retry.';
      console.warn('Currency comparison unavailable.',error);
    } finally { busy=false; $('costRefresh').disabled=false; root.setAttribute('aria-busy','false'); }
  }
  $('costCurrency').addEventListener('change',()=>{currency=$('costCurrency').value;try{localStorage.setItem(KEY,currency);}catch{/* this visit only */}render();});
  for(const id of ['costMetric','costPackage','costMode','costRange']) $(id).addEventListener('change',renderHistory);
  $('costRefresh').addEventListener('click',()=>refresh());
  // Refresh the static data snapshot hourly and when returning to a visible page. Requests never go to CipSoft.
  let checkedAt=Date.now();
  const check=()=>{if(!document.hidden&&Date.now()-checkedAt>=3600000){checkedAt=Date.now();refresh();}};
  setInterval(check,60000);document.addEventListener('visibilitychange',check);
  refresh(false);
}
