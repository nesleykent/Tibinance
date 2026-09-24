"""Separate diagnostic only. These rows never enter offer forecasts."""
from pathlib import Path
import json
import pandas as pd
import numpy as np
P=Path(__file__).resolve().parent
result=json.load(open(P/'results.json'));out=[];daily=[]
for quality in result['quality']:
 w=quality['world'];rows=json.load(open(P/f'inputs/api/{w.lower()}.json'))
 books=[];trades=[]
 for r in rows:
  loc=pd.Timestamp(r['time'],unit='s',tz='UTC').tz_convert('Europe/Berlin');day=loc.tz_localize(None).normalize()-pd.Timedelta(days=int(loc.hour<10))
  ask=r.get('sell_offer',-1);bid=r.get('buy_offer',-1)
  if ask>bid>0 and bid/ask>=.8:books.append({'date':day,'ask':ask,'bid':bid})
  trades.append({'date':day-pd.Timedelta(days=1),'ts':r['time'],'askTrade':r.get('day_average_sell',-1),'bidTrade':r.get('day_average_buy',-1)})
 b=pd.DataFrame(books).groupby('date')[['ask','bid']].median();t=pd.DataFrame(trades).sort_values('ts').groupby('date')[['askTrade','bidTrade']].last();t=t.where(t>0)
 joined=b.join(t).loc['2025-09-24':'2026-09-23']
 same_t=t.copy();same_t.index+=pd.Timedelta(days=1);same_joined=b.join(same_t).loc['2025-09-24':'2026-09-23']
 for side in ['ask','bid']:
  j=joined[[side,side+'Trade']].dropna();gap=(j[side+'Trade']/j[side]-1)*100
  same= same_joined[[side,side+'Trade']].dropna(); samegap=(same[side+'Trade']/same[side]-1)*100
  out.append({'sameDayN':len(same),'sameDayMedianGapPct':float(samegap.median()) if len(samegap) else None,'world':w,'side':side,'n':len(j),'medianGapPct':float(gap.median()) if len(j) else None,'p10':float(gap.quantile(.1)) if len(j) else None,'p90':float(gap.quantile(.9)) if len(j) else None,'within2Pct':float((abs(gap)<=2).mean()*100) if len(j) else None,'last':str(j.index.max().date()) if len(j) else None})
  for date,row in j.iterrows():daily.append({'world':w,'side':side,'date':str(date.date()),'offer':float(row[side]),'trade':float(row[side+'Trade']),'gapPct':float(gap[date])})
result['tradeComparison']=out;result['tradeComparisonDaily']=daily
(P/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
print('Comparison rows',len(out),'paired days/sides',len(daily))
