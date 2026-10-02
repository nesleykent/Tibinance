"""Offer-only analysis. Run with Python + numpy + pandas. Never read transaction prices.
Historical offer timestamps: UTC -> Europe/Berlin, server date starts at 10:00.
Captures: provided calendar dates; timezone unspecified. No intraday alignment claims.
Universe: every world in market-update.json (universe.py); no world list lives here. A world with partial history
keeps every rule below; each analysis applies its own minimum and the outputs record why a world falls short.
"""
from pathlib import Path
import json, hashlib, math, re
import numpy as np
import pandas as pd
from universe import worlds as universe_worlds, BENCHMARK, PREDECESSORS, MERGERS, api_worlds
ROOT=Path(__file__).resolve().parent
UNIVERSE=universe_worlds()
from research_data import research_cutoff, load_captures, api_rows, build_daily, latest_quote, weekly_series
ASOF=research_cutoff()
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
 a=components(train,origin,future); ensemble=np.nanmean(a,axis=1)
 return np.exp(np.log(anchor)+np.column_stack([a,ensemble]))
def components(train,origin,future):
 """Log change from the origin for each target: Constant (zero), Seasonal 52 weeks and Harmonic, one column each."""
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
 return np.column_stack([np.zeros(len(future)),np.array(seasonal),harmonic])

captures=load_captures(ASOF)
assert len({r['hash'] for r in captures})==len(captures)
# Type and BattlEye describe the world, not a price: read from its latest Market capture of any date.
kind={}
for c in sorted(json.load(open(ROOT/'market-update.json')),key=lambda c:c['capturedAt']):kind[c['world']]={'type':c['type'],'battleye':c['battleye']}
history={};weeks={};latest={};quality=[]; allrows=[]; unmodelled=[]
for w in api_worlds():
 rows=api_rows(w)
 obs=[r for r in captures if r['world']==w]
 d,q=build_daily(rows,obs,ASOF)
 if d.empty:
  if w in UNIVERSE:unmodelled.append({'world':w,**q,'reason':'Sem oferta válida até o corte'})
  continue
 history[w]=d;weeks[w]=weekly_series(d,ASOF)
 latest[w]=latest_quote(w,d,obs,ASOF)
 quality.append({'world':w,**q,'days':len(d),'weeks':int(weeks[w].ask.notna().sum()),'first':str(d.index[0].date()),'last':str(d.index[-1].date()),'captureCount':len(obs)})
 for dt,row in weeks[w].iterrows():
  allrows.append({'world':w,'date':str(dt.date()),'ask':row.ask,'bid':row.bid})

WORLDS=[w for w in UNIVERSE if w in history]
# Quarterly expanding-origin tests with >= 104 calendar weeks; targets actually observed.
benchmark=weeks[BENCHMARK]; tests=[]
origins=pd.date_range('2025-01-05',ASOF,freq='13W-SUN')
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

# Rolling-origin validation: every Sunday with an observed quote is an origin, under the same training rule as the quarterly
# test, scored at fixed horizons. Only targets where every component exists are kept, so every model and every combination
# of components is scored on identical rows. Consecutive origins share most of their target window, so uncertainty comes
# from a circular block bootstrap that resamples runs of h consecutive origins, never single origins.
ROLL_H=(13,26,52); BOOT=2000
SINGLE={'Constante':[0],'Sazonal 52 semanas':[1],'Harmônico':[2]}
COMBOS={'C+S':[0,1],'C+H':[0,2],'S+H':[1,2],'C+S+H':[0,1,2]}
rolling=[]
for side in SIDES:
 y=benchmark[side].dropna()
 for origin in pd.date_range('2025-01-05',ASOF,freq='W-SUN'):
  if origin not in y.index:continue
  train=y.loc[:origin]
  if len(train)<90 or (origin-train.index[0]).days<728:continue
  obs=[(h,origin+pd.Timedelta(weeks=h)) for h in ROLL_H if origin+pd.Timedelta(weeks=h) in y.index]
  if not obs:continue
  comp=components(train,origin,[d for _,d in obs])
  for (h,target),c in zip(obs,comp):
   if not np.isfinite(c).all():continue
   row={'side':side,'origin':str(origin.date()),'target':str(target.date()),'horizon':h,'anchor':float(y[origin]),'actual':float(y[target])}
   for name,idx in {**SINGLE,**COMBOS}.items():row[name]=float(y[origin]*np.exp(c[idx].mean()))
   rolling.append(row)
rolldf=pd.DataFrame(rolling)
def scores(pred,actual):
 e=np.log(actual/pred)
 return {'mape':float(np.mean(np.abs(pred/actual-1))*100),'mae':float(np.mean(np.abs(pred-actual))),
         'smape':float(np.mean(2*np.abs(pred-actual)/(np.abs(pred)+np.abs(actual)))*100),
         'logError':float(np.mean(np.abs(e))*100),'bias':float(np.mean(e)*100)}
def blocks(n,length,rng):
 starts=rng.integers(0,n,(BOOT,-(-n//length)))
 return ((starts[:,:,None]+np.arange(length))%n).reshape(BOOT,-1)[:,:n]
validation={'origins':'weekly','horizons':list(ROLL_H),'bootstrap':{'replicates':BOOT,'block':'h consecutive origins, circular','minBlocks':2},'metrics':[],'skill':[],'ablation':[]}
for (side,h),g in rolldf.groupby(['side','horizon'],sort=False):
 g=g.sort_values('origin'); n=len(g); actual=g.actual.to_numpy()
 span=(pd.Timestamp(g.origin.iloc[-1])-pd.Timestamp(g.origin.iloc[0])).days//7
 common={'side':side,'horizon':h,'n':n,'firstOrigin':g.origin.iloc[0],'lastOrigin':g.origin.iloc[-1],'windows':int(span//h+1)}
 for name in [*SINGLE,*COMBOS]:validation['metrics'].append({**common,'model':name,**scores(g[name].to_numpy(),actual)})
 # One seeded stream per side and horizon; every comparison in the cell reuses the same resampled origins (paired).
 rng=np.random.default_rng([20260928,list(SIDES).index(side),h]); ok=n>=2*h; idx=blocks(n,h,rng) if ok else None
 ape={name:np.abs(g[name].to_numpy()/actual-1)*100 for name in [*SINGLE,*COMBOS]}
 def compare(model,reference):
  point=1-ape[model].mean()/ape[reference].mean(); diff=ape[model].mean()-ape[reference].mean()
  out={**common,'model':model,'reference':reference,'mape':float(ape[model].mean()),'referenceMape':float(ape[reference].mean()),'skill':float(point*100),'diffPp':float(diff)}
  if ok:
   s=(1-ape[model][idx].mean(axis=1)/ape[reference][idx].mean(axis=1))*100
   out.update({'skillLow':float(np.percentile(s,2.5)),'skillHigh':float(np.percentile(s,97.5)),'shareBetter':float(np.mean(s>0))})
  else:out.update({'skillLow':None,'skillHigh':None,'shareBetter':None})
  return out
 for model in ['C+S+H','Sazonal 52 semanas','Harmônico']:validation['skill'].append(compare(model,'Constante'))
 validation['skill'].append(compare('C+S+H','Sazonal 52 semanas'))
 for model in COMBOS:validation['ablation'].append(compare(model,'Constante'))

# Forecast price sides separately. Equal weights fixed before evaluation, not fitted on tests.
future=pd.date_range(ASOF+pd.Timedelta(days=7),periods=52,freq='7D')
ref=latest[BENCHMARK]; paths=[]; world_paths=[]; world_metrics=[]
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
 for k in ['sellVolume','buyVolume','sellTopAmount','buyTopAmount','goldSupply','goldDemand']:metric[k]=r.get(k)
 metric.update(kind.get(w,{'type':None,'battleye':None}))
 # A historical anchor older than the cutoff is a stale quote: its scenario is conditional.
 metric['stale']=metric['ageDays']>0
 metric['mergerDate']=MERGERS.get(w); metric['predecessor']=PREDECESSORS.get(w)
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
  metric[side+'LocalStressBasis']='13 semanas' if len(locerr)>=5 else 'dispersão do prêmio' if len(prem)>1 else 'valor fixo de 10%'
  metric[side+'LocalStressPairs']=len(locerr)
  metric[side+'Premium']=float((np.exp(recent.median())-1)*100) if len(recent) else None
  metric[side+'PremiumN']=len(recent); metric[side+'LocalStress']=localstress
  reference=history[BENCHMARK][side].copy()
  for capture in captures:
   if capture['world']==BENCHMARK: reference.loc[pd.Timestamp(capture['capturedAt'][:10])]=capture['sell' if side=='ask' else 'buy']
  reference=reference.sort_index().loc[:pd.Timestamp(r['date'])]
  refanchor=float(reference.iloc[-1])
  metric['benchmarkRefDate']=str(reference.index[-1].date()); metric[side+'BenchmarkRef']=refanchor
  change=np.array([x['base']/refanchor for x in paths if x['side']==side])
  for j,f in enumerate([x for x in paths if x['side']==side]):
   base=r[side]*change[j]; stress=f['stressLog']+localstress
   merged=w in MERGERS and f['date']>=MERGERS[w]
   world_paths.append({'world':w,'date':f['date'],'side':side,'base':None if merged else base,'low':None if merged else base*np.exp(-stress),'high':None if merged else base*np.exp(stress),'status':'Suspenso: fusão anunciada' if merged else 'Condicional: cotação defasada' if metric['stale'] else 'Cenário de ofertas','anchorDate':r['date'],'localStress':localstress})
 # Each side moves with the same side of the benchmark from its reference date, so the local gap between the sides
 # also takes the benchmark's gap change since then. When that change exceeds the local gap, the central Buy Offers
 # meet or pass the central Sell Offers: the numbers stay as the rule gives them and those weeks are flagged.
 metric['benchmarkRefCostPct']=(1-metric['bidBenchmarkRef']/metric['askBenchmarkRef'])*100
 own=[x for x in world_paths if x['world']==w];ask={x['date']:x for x in own if x['side']=='ask'}
 crossed={x['date'] for x in own if x['side']=='bid' and x['base'] is not None and x['base']>=ask[x['date']]['base']}
 for x in own:
  if x['date'] in crossed:x['status']='Condicional: pontas cruzadas'
 metric['crossedWeeks']=len(crossed)
 world_metrics.append(metric)

# Transfer validation uses own contemporaneous quote and benchmark training at each origin.
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
 m['confidence']='Limitada' if m['mergerDate'] or m['stale'] or len(t)<10 else 'Moderada'
# Rolling transfer test: every week in which the world itself is quoted, once the benchmark meets the training rule of the
# rolling validation, is an origin. The benchmark's ensemble change over h weeks is applied to the world's own quote and
# scored on the world's quote h weeks later, against Constant (the world's own quote repeated); same block bootstrap.
transfer=[]
for w in WORLDS:
 if w==BENCHMARK:continue
 for side in SIDES:
  y=weeks[w][side].dropna(); refy=benchmark[side].dropna()
  for h in (13,26):
   rows=[]
   for origin in y.index:
    target=origin+pd.Timedelta(weeks=h); tr=refy.loc[:origin]
    if target not in y.index or len(tr)<90 or (origin-refy.index[0]).days<728:continue
    p=preds(tr,origin,[target],float(y[origin]))[0,3]
    rows.append((str(origin.date()),abs(p/y[target]-1)*100,abs(y[origin]/y[target]-1)*100))
   out={'world':w,'side':side,'horizon':h,'n':len(rows)}
   if rows:
    ape=np.array([r[1] for r in rows]);naive=np.array([r[2] for r in rows])
    span=(pd.Timestamp(rows[-1][0])-pd.Timestamp(rows[0][0])).days//7
    out.update({'firstOrigin':rows[0][0],'lastOrigin':rows[-1][0],'windows':int(span//h+1),'mape':float(ape.mean()),'naiveMape':float(naive.mean()),'skill':float((1-ape.mean()/naive.mean())*100) if naive.mean()>0 else None})
    if len(rows)>=2*h:
     idx=blocks(len(rows),h,np.random.default_rng([20260928,WORLDS.index(w),list(SIDES).index(side),h]))
     s=(1-ape[idx].mean(axis=1)/naive[idx].mean(axis=1))*100
     out.update({'skillLow':float(np.percentile(s,2.5)),'skillHigh':float(np.percentile(s,97.5))})
   transfer.append(out)

# Descriptive seasonal and operational measures use quotes only; no fill or trade aggregates.
cycles=[]; season=[]; roundtrips=[]
for yr in range(2023,ASOF.year+1):
 for side in SIDES:
  s=weeks[BENCHMARK].loc[f'{yr}-01-01':f'{yr}-12-31',side].dropna()
  if len(s):cycles.append({'year':yr,'side':side,'lowDate':str(s.idxmin().date()),'low':s.min(),'highDate':str(s.idxmax().date()),'high':s.max(),'rangePct':(s.max()/s.min()-1)*100,'days':len(s),'complete':pd.Timestamp(f'{yr}-12-31')<=ASOF})
for month in range(1,13):
 for side in SIDES:
  vals=[]
  for yr in range(2023,ASOF.year+1):
   s=history[BENCHMARK].loc[(history[BENCHMARK].index.year==yr)&(history[BENCHMARK].index.month==month),side]
   if len(s)>=10 and pd.Timestamp(year=yr,month=month,day=1)+pd.offsets.MonthEnd(0)<=ASOF:vals.append((s.iloc[-1]/s.iloc[0]-1)*100)
  season.append({'month':month,'side':side,'medianPct':np.median(vals) if vals else None,'n':len(vals)})
for w in WORLDS:
 d=history[w]
 for yr in range(2023,ASOF.year):
  for mo in [9,10,11,12]:
   sell=d[(d.index.year==yr)&(d.index.month==mo)].bid
   buy=d[(d.index.year==yr+1)&(d.index.month.isin([5,6,7]))].ask
   if len(sell)>=3 and len(buy)>=3:roundtrips.append({'world':w,'cycle':f'{yr}–{yr+1}','sellMonth':mo,'bidMedian':sell.median(),'askRebuyMedian':buy.median(),'tcGainPct':(sell.median()/buy.median()-1)*100,'sellN':len(sell),'buyN':len(buy)})

# Event association: Antica quote windows, broad descriptive + seasonal matched placebo test.
events=json.load(open(ROOT/'source-package/events_intervals.json'))
events=list({(e['event'],e['start'],e['end']):e for e in events}.values())
eventobs=[]; eventsummary=[];rng=np.random.default_rng(20260924)
for side in SIDES:
 s=history[BENCHMARK][side]
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
predecessors=[{'world':p,'successor':w,'first':str(history[p].index[0].date()),'last':str(history[p].index[-1].date()),'days':len(history[p]),'ask':latest[p]['ask'],'bid':latest[p]['bid'],'firstAsk':float(history[p].iloc[0].ask),'firstBid':float(history[p].iloc[0].bid)} for w,ps in PREDECESSORS.items() for p in ps if w in WORLDS and p in history]
results=js({'asOf':str(ASOF.date()),'benchmark':BENCHMARK,'universe':UNIVERSE,'captureCount':len(captures),'dataPolicy':{'daily':'API daily median; capture median fills missing calendar days only','captureTimezone':'Supplied local calendar date preserved; IANA timezone and UTC instant retained when available','anchor':'Latest day, latest capture preferred on a tie','weekly':'Sunday-ending labels on or before cutoff only','captureDaysAdded':sum(q['captureDaysAdded'] for q in quality)},'unmodelled':unmodelled,'worlds':world_metrics,'predecessor':predecessors,'quality':quality,'history':allrows,'forecast':paths,'worldForecast':world_paths,'backtest':backtest,'backtestDetail':tests,'validation':validation,'rollingDetail':rolling,'worldTestDetail':worldtests,'transferRolling':transfer,'cycles':cycles,'seasonality':season,'roundtrips':roundtrips,'eventStudy':eventsummary,'eventOccurrences':eventobs,'calendar':calendar,'calendarUpdated':pd.Timestamp(e['lastupdatetimestamp'],unit='s',tz='UTC').isoformat(),'sources':[{ 'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted([*(ROOT/'inputs').rglob('*'),ROOT/'market-update.json',ROOT/'source-package/events_intervals.json']) if p.is_file()]})
(ROOT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2,allow_nan=False))
print(json.dumps(js({'worlds':len(world_metrics),'backtest':backtest,'calendar':len(calendar),'unmatched':sum(not r['calendarMatch'] for r in calendar),'firstForecast':paths[0],'lastForecast':paths[51]}),ensure_ascii=False,indent=2))
