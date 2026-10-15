// Currency observations are layers of the existing token chart, including its tools and PNG renderer.
import { lineLayers, dayGrid } from './market-series.js';
import { convert, historicalCosts, money, FIAT, comparePackage, observationOn, packageMetricValue } from './coin-costs.js?v=20261015-inline';
import { rateOn } from './foreign-exchange.js';
import { TOKEN_PROFILE, tokenPrice } from './tibia-token.js?v=20261015-quality';
export const METRICS = {
  token: 'TIB price', 'eur-brl': 'EUR / BRL', 'eur-usd': 'EUR / USD', 'usd-brl': 'USD / BRL',
  cost: 'Package cost', unit: 'Cost per TC', power: 'TC per TIB',
  saving: 'Savings', 'saving-percent': 'Savings %', difference: 'Above cheapest %', premium: 'Local vs EUR %', pairwise:'Purchase diff %'
};
export const isPurchase = metric => !['token','eur-brl','eur-usd','usd-brl'].includes(metric);
export const isPercent = metric => ['premium','difference','saving-percent','pairwise'].includes(metric);
export function chartData(fx, tokens, observations, settings) {
  const { metric, currency } = settings;
  if (isPurchase(metric)) return historicalCosts(fx, tokens, observations, settings);
  if (metric === 'token') return tokens.flatMap(p => {
    const r = rateOn(fx, p.day);
    return r ? [{ day:p.day, fxDay:r.day, values:Object.fromEntries(FIAT.map(c => [c,convert(p.close,'USD',c,r,p.close)])) }] : [];
  });
  const [from,to] = metric.split('-').map(s=>s.toUpperCase());
  return fx.map(r=>({day:r.day,fxDay:r.day,values:{[currency]:convert(1,from,to,r,null)}}));
}
export function formatChart(value, settings) {
  if(value===null||!Number.isFinite(value)) return 'N/A';
  const {metric,currency}=settings;
  if(metric==='token'&&currency==='USD') return tokenPrice(value);
  if(isPercent(metric)) return `${value.toFixed(2)}%`;
  if(metric==='power') return `${value.toFixed(4)} TC/TIB`;
  if(metric.includes('-')) return `${value.toFixed(5)} ${metric.split('-')[1].toUpperCase()}`;
  return money(value,currency,metric==='token'||metric==='unit');
}
export const seriesKeys = settings => isPurchase(settings.metric) ? settings.metric==='premium'?['BRL','USD','EUR']:FIAT : ['EUR'];
export function currencyView(base, rates, observations, settings, profile) {
  let rows, prices;
  if(settings.metric==='token') {
    prices=base.prices.flatMap(p=>{
      const fx=rateOn(rates,p.day);
      if(!fx&&!['USD','TIB'].includes(settings.currency)) return [];
      const to=v=>settings.currency==='TIB'?1:settings.currency==='USD'?v:convert(v,'USD',settings.currency,fx,p.close);
      return [{...p,open:to(p.open),high:to(p.high),low:to(p.low),close:to(p.close),fxDay:fx?.day??null}];
    });
    rows=prices.map(p=>({day:p.day,fxDay:p.fxDay,values:{EUR:p.close}}));
  } else {
    rows=chartData(rates,base.prices,observations,settings);
    const latest=rates.at(-1),token=base.prices.at(-1);
    // Current valuation uses the latest known close, with its source day retained. It is never an invented candle.
    if(isPurchase(settings.metric)&&(settings.metric==='power'||['cost','unit','saving'].includes(settings.metric)&&settings.currency==='TIB')&&latest&&token&&latest.day>token.day
      &&(Date.parse(latest.day)-Date.parse(token.day))/86400000<=2) {
      const o=settings.mode==='scenario'?observations.at(-1):observationOn(observations,latest.day),pkg=o?.packages.find(p=>p.coins===settings.coins);
      if(pkg)rows.push({day:latest.day,fxDay:latest.day,tokenDay:token.day,current:true,effectiveFrom:o.effectiveFrom,
        values:Object.fromEntries(comparePackage(pkg,settings.currency,latest,token.close).rows.map(r=>[r.currency,packageMetricValue(r,settings.coins,settings.metric)]))});
    }
    if(!isPurchase(settings.metric)) rows=rows.map(r=>({...r,values:{EUR:Object.values(r.values)[0]}}));
    const key=seriesKeys(settings)[0];
    prices=rows.flatMap(r=>r.values[key]===null||r.values[key]===undefined?[]:[{day:r.day,close:r.values[key]}]);
  }
  const end=prices.at(-1)?.day;
  return {...base,prices,rows,byDay:new Map(prices.map(p=>[p.day,p])),rowByDay:new Map(rows.map(p=>[p.day,p])),
    grid:prices.length?dayGrid(prices[0].day,end):[],end,profile,settings:{...settings},tokenMode:settings.metric==='token'};
}
export function createCurrencyProfile(settings) {
  const color=(key,c)=>[c.line??c.buy,c.sell,c.text][FIAT.indexOf(key)];
  const price={
    id:'token-price',depth:1,
    add(chart,{line,k,L}) {
      const part=()=>({solid:line({lineWidth:2*k}),dotted:line({lineWidth:2*k,lineStyle:L.LineStyle.Dotted}),
        points:line({lineVisible:false,pointMarkersVisible:true,pointMarkersRadius:3*k,crosshairMarkerVisible:true,lastValueVisible:true,priceLineVisible:true})});
      const primary=part(), extra=[part(),part()];
      return {...primary,extra,lines:[primary,...extra].flatMap(p=>[p.solid,p.dotted])};
    },
    draw(part,view,side,c) {
      const keys=seriesKeys(view.settings), parts=[part,...part.extra];
      for(const [i,p] of parts.entries()) {
        const key=keys[i], points=key?view.rows.flatMap(r=>r.values[key]===null||r.values[key]===undefined?[]:[{time:r.day,value:r.values[key]}]):[];
        const split=lineLayers(points);
        for(const s of [p.solid,p.dotted,p.points]) s.applyOptions({color:key?color(key,c):c.text,priceFormat:{type:'custom',minMove:0.00001,formatter:v=>formatChart(v,settings)}});
        if(i) p.points.applyOptions({pointMarkersVisible:points.length<60});
        p.solid.setData(split.solid);p.dotted.setData(split.dotted);p.points.setData(points);
      }
    },
    keys(side,c) { return seriesKeys(settings).map(key=>({mark:'dot',color:color(key,c),label:settings.metric==='token'?`Daily close (${settings.currency} / TIB)`:isPurchase(settings.metric)?`${settings.metric==='pairwise'?{EUR:'BRL/EUR',BRL:'USD/EUR',USD:'USD/BRL'}[key]:key+' purchase'} | ${METRICS[settings.metric]}`:METRICS[settings.metric]})); }
  };
  const volume={...TOKEN_PROFILE.layers[1],draw(s,view,side,c) { TOKEN_PROFILE.layers[1].draw(s,view.tokenMode?view:{...view,grid:[]},side,c); },keys:(side,c)=>settings.metric==='token'?TOKEN_PROFILE.layers[1].keys(side,c):[]};
  return {layers:[price,volume,TOKEN_PROFILE.layers[2]],priceLayer:price,maxTopMargin:0.65,format:v=>formatChart(v,settings),
    anchor:view=>view.prices.map(p=>({time:p.day,value:p.close})),priceFormat:{type:'custom',minMove:0.00001,formatter:v=>formatChart(v,settings)}};
}
