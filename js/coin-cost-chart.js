// The existing Markets chart builder, with a comparison profile and the same gap rules.
import { createMarketChart, dayOf } from './market-chart.js?v=20261015-plain';
import { lineLayers, rangeStart } from './market-series.js';
import { convert, historicalCosts, money, FIAT } from './coin-costs.js';
import { rateOn } from './foreign-exchange.js';
export const METRICS = {
  'eur-brl': 'EUR / BRL', 'eur-usd': 'EUR / USD', 'usd-brl': 'USD / BRL',
  token: 'TIB value', cost: 'Package cost', power: 'Purchasing power | TC per TIB', premium: 'Local price vs EUR reference (%)'
};
export function chartData(fx, tokens, observations, settings) {
  const { metric, currency } = settings;
  if (['cost', 'power', 'premium'].includes(metric)) return historicalCosts(fx, tokens, observations, settings);
  if (metric === 'token') return tokens.flatMap(p => {
    const r = rateOn(fx, p.day);
    return r ? [{ day: p.day, fxDay: r.day, values: Object.fromEntries(FIAT.map(c => [c, convert(p.close, 'USD', c, r, p.close)])) }] : [];
  });
  const [from, to] = metric.split('-').map(s => s.toUpperCase());
  return fx.map(r => ({ day: r.day, fxDay: r.day, values: { [currency]: convert(1, from, to, r, null) } }));
}
export function costChart(root, readout) {
  let settings = {}, rows = [], keys = [], format = v => String(v), labels = {};
  const layer = {
    id: 'cost-history', depth: 1,
    add(chart, {line, L}) {
      return Object.fromEntries(FIAT.map(c => [c, { solid:line({lineWidth:2}), dotted:line({lineWidth:2,lineStyle:L.LineStyle.Dotted}),
        points:line({lineVisible:false,pointMarkersVisible:true,pointMarkersRadius:2,lastValueVisible:true,crosshairMarkerVisible:true}) }]));
    },
    draw(parts, view, side, colors) {
      for (const [i,c] of FIAT.entries()) {
        const part = parts[c], values = view.rows.flatMap(r => r.values[c] === null || r.values[c] === undefined ? [] : [{time:r.day,value:r.values[c]}]);
        const split = lineLayers(values);
        for (const s of Object.values(part)) s.applyOptions({color:[colors.line ?? colors.buy,colors.sell,colors.text][i],priceFormat:{type:'custom',minMove:0.00001,formatter:format}});
        part.solid.setData(split.solid); part.dotted.setData(split.dotted); part.points.setData(values);
      }
    }, keys:()=>[]
  };
  // The shared builder expects a main points series for marker density; the EUR part is canonical here.
  const profileLayer = { ...layer, add(chart,tools,c) { const parts = layer.add(chart,tools,c); return {...parts,points:parts.EUR.points}; } };
  const profile = { layers:[profileLayer], priceLayer:profileLayer, format:v=>format(v), priceFormat:{type:'custom',minMove:0.00001,formatter:v=>format(v)} };
  const market = createMarketChart(root,{profile});
  function describe(row) {
    if (!row) { readout.textContent='No observations in this period.'; return; }
    readout.textContent = `${row.day} UTC | ${keys.filter(c=>row.values[c] !== null && row.values[c] !== undefined).map(c=>`${labels[c]}: ${format(row.values[c],c)}`).join(' | ')}${row.fxDay !== row.day ? ` | FX publication ${row.fxDay}` : ''}`;
  }
  market.chart.subscribeCrosshairMove(p=>describe(p.time === undefined ? rows.at(-1) : rows.find(r=>r.day===dayOf(p.time))));
  const observer = new MutationObserver(()=>market.retheme());
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return {
    update(fx,tokens,observations,next) {
      settings=next; rows=chartData(fx,tokens,observations,settings);
      const {metric,currency,range}=settings;
      const isPair=metric.includes('-'), target=isPair?metric.split('-')[1].toUpperCase():currency;
      // FX is one line; the selector's TIB value is not a fiat series key.
      if (isPair) rows=rows.map(r=>({...r,values:{EUR:Object.values(r.values)[0]}}));
      if(metric==='token') rows=rows.map(r=>({...r,values:{EUR:r.values[currency==='TIB'?'USD':currency]}}));
      keys = isPair||metric==='token' ? ['EUR'] : FIAT;
      labels=Object.fromEntries(FIAT.map(c=>[c,metric==='token'?`TIB / ${c}`:c]));
      if(isPair) labels.EUR=METRICS[metric];
      if(metric==='token') labels.EUR=`TIB / ${currency==='TIB'?'USD':currency}`;
      format=(v,c)=>metric==='power'?`${new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(v)} TC / TIB`
        :metric==='premium'?`${v.toFixed(2)}%`:metric==='token'?money(v,currency==='TIB'?'USD':currency,true)
        :isPair?`${v.toFixed(5)} ${target}`:money(v,currency);
      market.draw({rows},'sell');
      if(rows.length) {
        const end=rows.at(-1).day, start=rangeStart(end,range);
        market.chart.timeScale().setVisibleRange({from:start && start>rows[0].day?start:rows[0].day,to:end});
      }
      root.setAttribute('aria-label',`${METRICS[metric]}. ${rows.length} observations. ${metric==='cost'||metric==='power'||metric==='premium' ? settings.mode==='scenario'?'Constant-price scenario.':'Dated manual prices.':''} See the history readout and data table.`);
      describe(rows.at(-1));
      return rows;
    }
  };
}
