"""Offer-only analysis. Run with Python + numpy + pandas. Never read transaction prices.
Historical offer timestamps: UTC -> Europe/Berlin, server date starts at 10:00.
Captures: provided calendar dates; timezone unspecified. No intraday alignment claims.
"""
from pathlib import Path
import json, hashlib, math, re
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parent
WORLDS='Antica Belobra Celebra Collabra Descubra Gentebra Luminera Luzibra Ombra Ourobra Quelibra Rasteibra Terribra Tornabra Ustebra Venebra'.split()
ASOF=pd.Timestamp('2026-09-23')
SIDES={'ask':'sell_offer','bid':'buy_offer'}
MODELS=['Constante','Sazonal 52 semanas','Harmônico','Conjunto']
T0=pd.Timestamp('2023-01-01')
def js(x):
 if isinstance(x,dict): return {str(k):js(v) for k,v in x.items()}
 if isinstance(x,(list,tuple)):return [js(v) for v in x]
 if isinstance(x,np.generic):return js(x.item())
 if isinstance(x,pd.Timestamp):return str(x.date())
 if isinstance(x,float) and not math.isfinite(x):return None
 return x

def features(dates):
 t=np.asarray((pd.DatetimeIndex(dates)-T0).days/365.25)
 return np.column_stack([np.ones(len(t)),t,*[f(2*np.pi*k*t) for k in (1,2) for f in (np.sin,np.cos)]])
def preds(train,origin,future,anchor):
 # Fits use only available observations on/before origin. No centered cleaning or interpolation.
 train=train.loc[:origin].dropna(); train=train[train.index>=origin-pd.Timedelta(weeks=130)]
 yy=np.log(train.to_numpy()); b=np.linalg.lstsq(features(train.index),yy,rcond=None)[0]
 harmonic=(features(future)-features([origin]))@b
 def prior(d):
  s=train[abs(train.index-d)<=pd.Timedelta(days=10)]
  if s.empty:return None
  i=np.argmin(abs(s.index-d));return float(np.log(s.iloc[i]))
 prev=prior(origin-pd.Timedelta(weeks=52)); seasonal=[]
 for d in future:
  v=prior(d-pd.Timedelta(weeks=52));seasonal.append(v-prev if v is not None and prev is not None else np.nan)
 seasonal=np.array(seasonal)
 a=np.column_stack([np.zeros(len(future)),seasonal,harmonic]); ensemble=np.nanmean(a,axis=1)
 return np.exp(np.log(anchor)+np.column_stack([a,ensemble]))

captures=json.load(open(ROOT/'inputs/observations-2.json'))
assert len({r['hash'] for r in captures})==len(captures)
history={};weeks={};latest={};quality=[]; allrows=[]
for w in WORLDS+["Obscubra"]:
 rows=json.load(open(ROOT/f'inputs/api/{w.lower()}.json'))
 valid=[];invalid=0; crossed=0; wide=0
 for r in rows:
  ask=r.get('sell_offer',-1);bid=r.get('buy_offer',-1)
  if ask<=0 or bid<=0:invalid+=1;continue
  if bid>=ask:crossed+=1;continue
  if bid/ask<0.8:wide+=1;continue
  loc=pd.Timestamp(r['time'],unit='s',tz='UTC').tz_convert('Europe/Berlin')
  date=loc.tz_localize(None).normalize()-pd.Timedelta(days=int(loc.hour<10))
  if date>ASOF:continue
  valid.append({'date':date,'ask':ask,'bid':bid,'ts':r['time']})
 d=pd.DataFrame(valid).sort_values('ts').groupby('date')[['ask','bid']].median()
 history[w]=d;weeks[w]=d.resample('W-SUN').median()
 obs=sorted([r for r in captures if r['world']==w],key=lambda r:r['capturedAt'])
 if obs:
  r=obs[-1]; latest[w]={**r,'ask':r['sell'],'bid':r['buy'],'date':r['capturedAt'][:10],'source':'Captura'}
 else:
  r=d.iloc[-1];latest[w]={'world':w,'ask':float(r.ask),'bid':float(r.bid),'date':str(d.index[-1].date()),'source':'Histórico de ofertas'}
 quality.append({'world':w,'records':len(rows),'valid':len(valid),'days':len(d),'weeks':int(weeks[w].ask.notna().sum()),'missingBook':invalid,'crossed':crossed,'wideSpread':wide,'first':str(d.index[0].date()),'last':str(d.index[-1].date()),'captureCount':len(obs)})
 for dt,row in weeks[w].iterrows():
  allrows.append({'world':w,'date':str(dt.date()),'ask':row.ask,'bid':row.bid})

# Quarterly expanding-origin tests with >= 104 calendar weeks; targets actually observed.
benchmark=weeks['Antica']; tests=[]
origins=pd.date_range('2025-01-05','2026-06-30',freq='13W-SUN')
for side in SIDES:
 y=benchmark[side].dropna()
 for origin in origins:
  train=y.loc[:origin]
  if len(train)<90 or (origin-train.index[0]).days<728:continue
  anchor=train.iloc[-1]; actual_origin=train.index[-1]
  for h in (4,13,26,39,52):
   target=actual_origin+pd.Timedelta(weeks=h)
   if target not in y.index:continue
   pr=preds(train,actual_origin,[target],anchor)[0]
   for model,pred in zip(MODELS,pr):
    if not np.isfinite(pred):continue
    tests.append({'side':side,'origin':str(actual_origin.date()),'target':str(target.date()),'horizon':h,'model':model,'actual':float(y[target]),'predicted':float(pred),'ape':abs(pred/y[target]-1)*100,'logError':np.log(y[target]/pred)})
testdf=pd.DataFrame(tests)
backtest=[]
for (side,h,m),d in testdf.groupby(['side','horizon','model'],sort=False):
 backtest.append({'side':side,'horizon':h,'model':m,'n':len(d),'mape':d.ape.mean(),'maxError':d.ape.max()})

# Forecast price sides separately. Equal weights fixed before evaluation, not fitted on tests.
future=pd.date_range('2026-09-30',periods=52,freq='7D')
ref=latest['Antica']; paths=[]; world_paths=[]; world_metrics=[]
for side in SIDES:
 y=benchmark[side].dropna().copy(); y.loc[ASOF]=ref[side]; pr=preds(y,ASOF,future,ref[side])
 for j,d in enumerate(future):
  h=j+1;nearest=min((4,13,26,39,52),key=lambda v:abs(v-h))
  err=testdf[(testdf.side==side)&(testdf.horizon==nearest)&(testdf.model=='Conjunto')].logError.abs()
  stress=max(float(err.quantile(.8)),float(np.nanmax(abs(np.log(pr[j,:3]/pr[j,3])))))
  paths.append({'date':str(d.date()),'side':side,'constant':pr[j,0],'seasonal':pr[j,1],'harmonic':pr[j,2],'base':pr[j,3],'low':pr[j,3]*np.exp(-stress),'high':pr[j,3]*np.exp(stress),'stressLog':stress,'errorSample':len(err)})
for w in WORLDS:
 r=latest[w]; d=history[w]; wk=weeks[w]; q=next(x for x in quality if x['world']==w)
 spr=(r['ask']-r['bid'])/((r['ask']+r['bid'])/2)*100
 metric={'world':w,'date':r['date'],'source':r['source'],'ask':r['ask'],'bid':r['bid'],'spreadPct':spr,'spreadGold':r['ask']-r['bid'],'ageDays':(ASOF-pd.Timestamp(r['date'])).days,**{k:q[k] for k in ['days','weeks','first','last','captureCount']}}
 for k in ['sellVolume','buyVolume','sellTopAmount','buyTopAmount','goldSupply','goldDemand','type','battleye']:metric[k]=r.get(k)
 metric['depthRatio']=r.get('buyVolume',0)/r['sellVolume'] if r.get('sellVolume') else None
 metric['costPct']=(1-r['bid']/r['ask'])*100
 for side in SIDES:
  tail=d.loc[(d.index>=pd.Timestamp(r['date'])-pd.Timedelta(days=90))&(d.index<pd.Timestamp(r['date']))][side]
  metric[side+'90Median']=float(tail.median()) if len(tail) else None
  metric[side+'Vs90']=float((r[side]/tail.median()-1)*100) if len(tail) else None
  same=pd.concat([wk[side],benchmark[side]],axis=1,keys=['world','ref']).dropna()
  prem=np.log(same.world/same.ref); recent=prem[prem.index>=ASOF-pd.Timedelta(days=180)]
  # world-specific additional stress is empirical 80th absolute premium movement;
  # lagged by calendar weeks, never compress missing periods.
  grid=prem.reindex(pd.date_range(prem.index.min(),prem.index.max(),freq='W-SUN'))
  locerr=(grid-grid.shift(13)).dropna().abs()
  localstress=float(locerr.quantile(.8)) if len(locerr)>=5 else float(prem.std()) if len(prem)>1 else 0.1
  metric[side+'Premium']=float((np.exp(recent.median())-1)*100) if len(recent) else None
  metric[side+'PremiumN']=len(recent); metric[side+'LocalStress']=localstress
  reference=history['Antica'][side].copy()
  for capture in captures:
   if capture['world']=='Antica': reference.loc[pd.Timestamp(capture['capturedAt'][:10])]=capture['sell' if side=='ask' else 'buy']
  reference=reference.sort_index().loc[:pd.Timestamp(r['date'])]
  refanchor=float(reference.iloc[-1])
  change=np.array([x['base']/refanchor for x in paths if x['side']==side])
  for j,f in enumerate([x for x in paths if x['side']==side]):
   base=r[side]*change[j]; stress=f['stressLog']+localstress
   merged=w=='Luzibra' and f['date']>='2026-10-22'
   world_paths.append({'world':w,'date':f['date'],'side':side,'base':None if merged else base,'low':None if merged else base*np.exp(-stress),'high':None if merged else base*np.exp(stress),'status':'Suspenso: fusão anunciada' if merged else 'Condicional: cotação defasada' if w=='Terribra' else 'Cenário de ofertas','anchorDate':r['date'],'localStress':localstress})
 world_metrics.append(metric)

# Transfer validation uses own contemporaneous quote and Antica training at each origin.
worldtests=[]
for w in WORLDS:
 for side in SIDES:
  y=weeks[w][side].dropna(); refy=benchmark[side].dropna()
  for origin in origins:
   local=y.loc[:origin]
   if local.empty or (origin-local.index[-1]).days>14:continue
   start=local.index[-1]; tr=refy.loc[:start]
   if len(tr)<90:continue
   for h in (4,13,26,39,52):
    target=start+pd.Timedelta(weeks=h)
    if target not in y.index:continue
    p=preds(tr,start,[target],float(local.iloc[-1]))[0,3]
    worldtests.append({'world':w,'side':side,'origin':str(start.date()),'horizon':h,'ape':abs(p/y[target]-1)*100,'naiveApe':abs(local.iloc[-1]/y[target]-1)*100})
for m in world_metrics:
 t=[x for x in worldtests if x['world']==m['world']];m['testN']=len(t);m['testMape']=float(np.mean([x['ape'] for x in t])) if t else None;m['testNaive']=float(np.mean([x['naiveApe'] for x in t])) if t else None
 m['confidence']='Limitada' if m['world'] in ['Luzibra','Terribra'] or len(t)<10 else 'Moderada'

# Descriptive seasonal and operational measures use quotes only; no fill or trade aggregates.
cycles=[]; season=[]; roundtrips=[]
for yr in [2023,2024,2025,2026]:
 for side in SIDES:
  s=weeks['Antica'].loc[f'{yr}-01-01':f'{yr}-12-31',side].dropna()
  if len(s):cycles.append({'year':yr,'side':side,'lowDate':str(s.idxmin().date()),'low':s.min(),'highDate':str(s.idxmax().date()),'high':s.max(),'rangePct':(s.max()/s.min()-1)*100,'days':len(s),'complete':yr<2026})
for month in range(1,13):
 for side in SIDES:
  vals=[]
  for yr in [2023,2024,2025,2026]:
   s=history['Antica'].loc[(history['Antica'].index.year==yr)&(history['Antica'].index.month==month),side]
   if len(s)>=10 and (yr,month)<(2026,9):vals.append((s.iloc[-1]/s.iloc[0]-1)*100)
  season.append({'month':month,'side':side,'medianPct':np.median(vals) if vals else None,'n':len(vals)})
for w in WORLDS:
 d=history[w]
 for yr in [2023,2024,2025]:
  for mo in [9,10,11,12]:
   sell=d[(d.index.year==yr)&(d.index.month==mo)].bid
   buy=d[(d.index.year==yr+1)&(d.index.month.isin([5,6,7]))].ask
   if len(sell)>=3 and len(buy)>=3:roundtrips.append({'world':w,'cycle':f'{yr}–{yr+1}','sellMonth':mo,'bidMedian':sell.median(),'askRebuyMedian':buy.median(),'tcGainPct':(sell.median()/buy.median()-1)*100,'sellN':len(sell),'buyN':len(buy)})

# Event association: Antica quote windows, broad descriptive + seasonal matched placebo test.
events=json.load(open(ROOT/'source-package/events_intervals.json'))
events=list({(e['event'],e['start'],e['end']):e for e in events}.values())
eventobs=[]; eventsummary=[];rng=np.random.default_rng(20260924)
for side in SIDES:
 s=history['Antica'][side]
 def effect(dt):
  a=s.loc[dt-pd.Timedelta(days=7):dt-pd.Timedelta(days=1)]
  b=s.loc[dt+pd.Timedelta(days=1):dt+pd.Timedelta(days=7)]
  return float(np.log(b.median()/a.median())) if len(a)>=3 and len(b)>=3 else None
 candidates={}
 for dt in s.index:
  eff=effect(dt)
  if eff is not None:candidates.setdefault((dt.year,dt.month),[]).append(eff)
 for e in events:
  dt=pd.Timestamp(e['start']);eff=effect(dt)
  if eff is not None:eventobs.append({'event':e['event'],'date':e['start'],'side':side,'logReturn':eff})
 for name in sorted({x['event'] for x in eventobs}):
  rows=[x for x in eventobs if x['event']==name and x['side']==side]
  if len(rows)<3:continue
  pools=[candidates.get((pd.Timestamp(x['date']).year,pd.Timestamp(x['date']).month),[]) for x in rows]
  if any(not a for a in pools):continue
  placebo=np.array([np.mean([rng.choice(p) for p in pools]) for _ in range(2000)])
  actual=float(np.mean([x['logReturn'] for x in rows]));center=np.median(placebo)
  p=(1+np.sum(abs(placebo-center)>=abs(actual-center)))/(len(placebo)+1)
  eventsummary.append({'event':name,'side':side,'n':len(rows),'returnPct':np.expm1(actual)*100,'abnormalPct':np.expm1(actual-center)*100,'p':p})
order=np.argsort([r['p'] for r in eventsummary]); running=1
for j in range(len(order)-1,-1,-1):
 i=order[j];running=min(running,eventsummary[i]['p']*len(order)/(j+1));eventsummary[i]['q']=running
# Calendar cross-check: same dates, 8/9h timestamp differences intentionally preserved.
e=json.load(open(ROOT/'inputs/eventschedule.json'));calendar=[]
ics=(ROOT/'inputs/calendar.ics').read_text();icsrows=[]
for block in ics.split('BEGIN:VEVENT')[1:]:
 fields=dict(re.findall(r'^(SUMMARY|DTSTART|DTEND):(.*)$',block,re.M));icsrows.append(fields)
for r in e['eventlist']:
 start=pd.Timestamp(r['startdate'],unit='s',tz='UTC');end=pd.Timestamp(r['enddate'],unit='s',tz='UTC')
 if end.date()<=ASOF.date():continue
 matches=[x for x in icsrows if x.get('SUMMARY')==r['name'] and x.get('DTSTART','')[:8]==start.strftime('%Y%m%d') and x.get('DTEND','')[:8]==end.strftime('%Y%m%d')]
 calendar.append({'event':r['name'],'start':str(start.date()),'endExclusive':str(end.date()),'calendarMatch':bool(matches),'icsStart':matches[0].get('DTSTART') if matches else None,'status':'Agenda fornecida; sujeita a revisão'})
results=js({'asOf':str(ASOF.date()),'worlds':world_metrics,'predecessor':[{'world':'Obscubra','first':str(history['Obscubra'].index[0].date()),'last':str(history['Obscubra'].index[-1].date()),'days':len(history['Obscubra']),'ask':latest['Obscubra']['ask'],'bid':latest['Obscubra']['bid'],'firstAsk':float(history['Obscubra'].iloc[0].ask),'firstBid':float(history['Obscubra'].iloc[0].bid)}],'quality':quality,'history':allrows,'forecast':paths,'worldForecast':world_paths,'backtest':backtest,'backtestDetail':tests,'worldTestDetail':worldtests,'cycles':cycles,'seasonality':season,'roundtrips':roundtrips,'eventStudy':eventsummary,'eventOccurrences':eventobs,'calendar':calendar,'calendarUpdated':pd.Timestamp(e['lastupdatetimestamp'],unit='s',tz='UTC').isoformat(),'sources':[{ 'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted([*(ROOT/'inputs').rglob('*'),ROOT/'source-package/events_intervals.json']) if p.is_file()]})
(ROOT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2,allow_nan=False))
print(json.dumps(js({'worlds':len(world_metrics),'backtest':backtest,'calendar':len(calendar),'unmatched':sum(not r['calendarMatch'] for r in calendar),'firstForecast':paths[0],'lastForecast':paths[51]}),ensure_ascii=False,indent=2))
