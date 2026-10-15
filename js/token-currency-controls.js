import { loadFx, stale, ageDays } from './foreign-exchange.js';
import { CURRENCIES, validatePrices } from './coin-costs.js?v=20261015-inline';
import { METRICS, isPurchase } from './coin-cost-chart.js?v=20261015-inline';
import { tokenView } from './tibia-token.js?v=20261015-quality';
const KEY='tibinance.coin-cost.currency';
export function currencySettings() {
  const p=new URLSearchParams(location.search);
  let currency='USD';try{const saved=localStorage.getItem(KEY);if(CURRENCIES.includes(saved)) currency=saved;}catch{/* this visit only */}
  return {metric:Object.hasOwn(METRICS,p.get('analysis'))?p.get('analysis'):'token',currency:CURRENCIES.includes(p.get('currency'))?p.get('currency'):currency,
    coins:Number(p.get('package'))||250,mode:p.get('basis')==='observed'?'observed':'scenario'};
}
export function currencyControls(settings,file,onChange) {
  const root=Object.assign(document.createElement('div'),{id:'currencyControls',className:'head-line'});
  root.setAttribute('role','group');root.setAttribute('aria-label','Tibia Token chart series and currency');
  root.innerHTML=`<select id="currencyMetric" class="tv-select" aria-label="Chart series">${Object.entries(METRICS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select>
    <select id="currencyDisplay" class="tv-select" aria-label="Display currency">${CURRENCIES.map(c=>`<option>${c}</option>`).join('')}</select>
    <select id="currencyPackage" class="tv-select" aria-label="Tibia Coin package" hidden></select>
    <select id="currencyBasis" class="tv-select" aria-label="Official price history basis" title="Scenario holds the current manual prices fixed; dated uses only effective price observations" hidden><option value="scenario">Scenario</option><option value="observed">Dated</option></select>
    <button id="currencyRefresh" class="tv-btn" type="button" aria-label="Refresh currency data" title="Refresh currency data">↻</button>`;
  document.querySelector('#chartHead .chart-legend').before(root);
  const status=Object.assign(document.createElement('span'),{id:'currencyStatus',className:'symbol-range',textContent:'Loading ECB rates…'});
  status.setAttribute('role','status');document.getElementById('chartHead').append(status);
  const $=id=>root.querySelector(`#${id}`);
  let rates=[],observations=[],fxFile=null,cached=false,errors=[],busy=false,token=file;
  function notify() {
    $('currencyMetric').value=settings.metric;$('currencyDisplay').value=settings.currency;$('currencyBasis').value=settings.mode;
    $('currencyPackage').hidden=$('currencyBasis').hidden=!isPurchase(settings.metric);
    const o=observations.at(-1), saved=settings.coins;
    $('currencyPackage').innerHTML=(o?.packages??[]).map(p=>`<option value="${p.coins}">${p.coins.toLocaleString('en-US')} TC</option>`).join('');
    if(o?.packages.some(p=>p.coins===saved)) $('currencyPackage').value=String(saved);else if(o)settings.coins=o.packages[0].coins;
    const fxDay=rates.at(-1)?.day,tibDay=token.prices.at(-1)?.day;
    status.textContent=[...errors,cached?'Cached FX':'',fxDay?`${stale(fxDay)?'Stale ':''}ECB ${fxDay}`:'FX unavailable',tibDay?`${ageDays(tibDay)>2?'Stale ':''}TIB ${tibDay}`:'TIB unavailable',
      isPurchase(settings.metric)?`${settings.mode==='scenario'?'Scenario':'Dated prices'} ${o?.effectiveFrom??'unavailable'}`:''].filter(Boolean).join(' | ');
    status.title=`ECB reference rates, daily. Retrieved ${fxFile?.fetchedAt??'unavailable'}. Manual CipSoft prices start ${observations[0]?.effectiveFrom??'unavailable'}. All fees excluded; TIB equivalents imply no redemption.`;
    const url=new URL(location.href);url.searchParams.set('analysis',settings.metric);url.searchParams.set('currency',settings.currency);
    if(isPurchase(settings.metric)){url.searchParams.set('package',settings.coins);url.searchParams.set('basis',settings.mode);}else{url.searchParams.delete('package');url.searchParams.delete('basis');}
    url.searchParams.delete('panel');history.replaceState(null,'',url);
    onChange({rates,observations,token,status:status.textContent});
  }
  for(const [id,key] of [['currencyMetric','metric'],['currencyDisplay','currency'],['currencyPackage','coins'],['currencyBasis','mode']]) $(id).addEventListener('change',()=>{
    settings[key]=key==='coins'?Number($(id).value):$(id).value;
    if(key==='currency')try{localStorage.setItem(KEY,settings.currency);}catch{/* this visit only */}
    notify();
  });
  async function refresh(reloadToken=false) {
    if(busy)return;busy=true;$('currencyRefresh').disabled=true;status.textContent='Loading ECB rates…';errors=[];
    const results=await Promise.allSettled([loadFx(),fetch('data/coin-prices.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw new Error('Prices unavailable');return validatePrices(await r.json());})]);
    if(results[0].status==='fulfilled'){fxFile=results[0].value.file;rates=fxFile.rates;cached=results[0].value.cached;}else errors.push('FX refresh failed');
    if(results[1].status==='fulfilled')observations=results[1].value.observations;else errors.push('Manual prices unavailable');
    if(reloadToken)try {const r=await fetch('data/market-history/tibia-token/history.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('TIB unavailable');const next=await r.json();tokenView(next,null);token=next;}catch{errors.push('TIB refresh failed');}
    busy=false;$('currencyRefresh').disabled=false;notify();
  }
  $('currencyRefresh').addEventListener('click',()=>refresh(true));
  let checkedAt=Date.now();const check=()=>{if(!document.hidden&&Date.now()-checkedAt>=3600000){checkedAt=Date.now();refresh(true);}};
  setInterval(check,60000);document.addEventListener('visibilitychange',check);
  refresh();
  return {notify};
}
