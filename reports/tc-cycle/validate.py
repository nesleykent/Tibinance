"""Independent acceptance checks for source boundaries, arithmetic and chronology."""
from pathlib import Path
import json,math,ast,hashlib
import numpy as np
import pandas as pd
from universe import worlds as universe_worlds, MERGERS, PREDECESSORS
from research_data import load_captures, load_daily, latest_quote, research_cutoff, valid_book
P=Path(__file__).resolve().parent
r=json.load(open(P/'results.json'));obs=load_captures(pd.Timestamp(r['asOf']))
# The universe is market-update.json as it stands: every world is either modelled or listed with its reason.
universe=set(universe_worlds());assert set(r['universe'])==universe,'results.json is stale: rerun analyze.py for the current market-update.json'
expected={x['world'] for x in r['worlds']};assert expected|{x['world'] for x in r['unmodelled']}==universe and not expected&{x['world'] for x in r['unmodelled']}
assert len(obs)==len({x['hash'] for x in obs})==r['captureCount']
assert r['asOf']==str(research_cutoff().date())
# Research uses every valid capture up to the dynamically observed cutoff.
assert {x['hash'] for x in json.load(open(P/'market-update.json')) if x['capturedAt'][:10]<=r['asOf'] and valid_book(x.get('sell'),x.get('buy'))}=={x['hash'] for x in obs}
for w in r['worlds']:
 o=sorted([x for x in obs if x['world']==w['world']],key=lambda x:x['capturedAt'])
 anchor=latest_quote(w['world'],load_daily(w['world']),o,pd.Timestamp(r['asOf']))
 assert (w['ask'],w['bid'],w['date'])==(anchor['ask'],anchor['bid'],anchor['date'])
 assert math.isclose(w['spreadPct'],200*(w['ask']-w['bid'])/(w['ask']+w['bid']))
 assert math.isclose(w['costPct'],100*(1-w['bid']/w['ask']))
 assert w['stale']==(w['ageDays']>0) and w['mergerDate']==MERGERS.get(w['world'])
 assert w['confidence']==('Limitada' if w['mergerDate'] or w['stale'] or w['testN']<10 else 'Moderada')
assert all(x['date']<=r['asOf'] for x in r['history'])
assert min(x['date'] for x in r['forecast'])==str((pd.Timestamp(r['asOf'])+pd.Timedelta(days=7)).date())
for x in r['quality']:assert x['valid']+x['missingBook']+x['crossed']+x['wideSpread']+x['afterCutoff']==x['records']
for key in ['forecast','worldForecast']:
 for row in r[key]:
  if row['base'] is None:assert row.get('world') in MERGERS and row['date']>=MERGERS[row['world']]
  else:assert 0<row['low']<=row['base']<=row['high']
for w in expected:
 arr=[x for x in r['worldForecast'] if x['world']==w];assert len(arr)==104
 stale=next(x['stale'] for x in r['worlds'] if x['world']==w)
 a={x['date']:x for x in arr if x['side']=='ask'}
 crossed={b['date'] for b in arr if b['side']=='bid' and b['base'] is not None and b['base']>=a[b['date']]['base']}
 assert len(crossed)==next(x['crossedWeeks'] for x in r['worlds'] if x['world']==w)
 assert all(x['status']==('Suspenso: fusão anunciada' if x['base'] is None else 'Condicional: pontas cruzadas' if x['date'] in crossed else 'Condicional: cotação defasada' if stale else 'Cenário de ofertas') for x in arr),w
 for b in [x for x in arr if x['side']=='bid']:
  # A crossed central pair is only ever published flagged as such (checked above), never silently.
  if b['base'] is not None:assert b['base']<a[b['date']]['base'] or b['status']=='Condicional: pontas cruzadas',(w,b['date'])
for x in r['backtestDetail']:
 assert x['origin']<x['target'] and x['target']<=r['asOf']
 assert math.isclose(x['ape'],abs(x['predicted']/x['actual']-1)*100)
for x in r['backtest']:
 values=[t['ape'] for t in r['backtestDetail'] if (t['side'],t['horizon'],t['model'])==(x['side'],x['horizon'],x['model'])]
 assert len(values)==x['n'];assert math.isclose(sum(values)/len(values),x['mape'])
# Rolling origins: every metric recomputed from the detail rows; identical rows for every model and combination; the
# three-component combination is the published ensemble; bootstrap intervals only where two blocks of h origins fit.
roll=pd.DataFrame(r['rollingDetail'])
assert (roll.origin<roll.target).all() and (roll.target<=r['asOf']).all()
assert np.allclose(roll['C+S+H'],roll.anchor*np.exp((np.log(roll['Sazonal 52 semanas']/roll.anchor)+np.log(roll['Harmônico']/roll.anchor))/3))
assert np.allclose(roll['Constante'],roll.anchor)
for x in r['validation']['metrics']:
 g=roll[(roll.side==x['side'])&(roll.horizon==x['horizon'])];p_,a_=g[x['model']].to_numpy(),g.actual.to_numpy()
 assert len(g)==x['n'] and math.isclose(x['mape'],np.mean(np.abs(p_/a_-1))*100) and math.isclose(x['mae'],np.mean(np.abs(p_-a_)))
 assert math.isclose(x['smape'],np.mean(2*np.abs(p_-a_)/(np.abs(p_)+np.abs(a_)))*100) and math.isclose(x['logError'],np.mean(np.abs(np.log(a_/p_)))*100)
for x in r['validation']['skill']+r['validation']['ablation']:
 assert math.isclose(x['skill'],100*(1-x['mape']/x['referenceMape']))
 assert (x['skillLow'] is None)==(x['n']<2*x['horizon'])
 if x['skillLow'] is not None:assert x['skillLow']<=x['skillHigh'] and 0<=x['shareBetter']<=1
for x in r['transferRolling']:
 assert x['world']!=r['benchmark'] and (x['n']==0 or x['lastOrigin']<=r['asOf'])
 if x.get('skillLow') is not None:assert x['n']>=2*x['horizon'] and x['skillLow']<=x['skillHigh']
for x in r['roundtrips']:assert math.isclose(x['tcGainPct'],100*(x['bidMedian']/x['askRebuyMedian']-1))
for x in r['tradeComparison']:
 a=[t for t in r['tradeComparisonDaily'] if (t['world'],t['side'])==(x['world'],x['side'])]
 assert len(a)==x['n'];assert np.isclose(np.median([t['gapPct'] for t in a]),x['medianGapPct'])
 assert all(np.isclose(t['gapPct'],100*(t['trade']/t['offer']-1)) for t in a)
# Prove forecasts ignore future additions: load only the pure function definitions.
tree=ast.parse((P/'analyze.py').read_text());funcs=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ['features','preds','components']]
ns={'pd':pd,'np':np,'T0':pd.Timestamp('2023-01-01')};exec(compile(ast.Module(body=funcs,type_ignores=[]),'models','exec'),ns)
y=pd.Series({pd.Timestamp(x['date']):x['ask'] for x in r['history'] if x['world']=='Antica'}).sort_index().dropna();o=pd.Timestamp('2025-01-05');future=pd.date_range(o+pd.Timedelta(weeks=1),periods=52,freq='7D');anchor=y.loc[:o].iloc[-1]
a=ns['preds'](y,o,future,anchor);modified=y.copy();modified.loc[modified.index>o]=999999999
b=ns['preds'](modified,o,future,anchor);assert np.allclose(a,b,equal_nan=True)
# Ensure offer analysis never loads transaction fields. Comparison is a separate program.
for node in ast.walk(ast.parse((P/'research_data.py').read_text())):
 if isinstance(node,ast.Constant) and isinstance(node.value,str):assert not node.value.startswith(('day_average_','month_average_')),node.value
for node in ast.walk(tree):
 if isinstance(node,ast.Constant) and isinstance(node.value,str):assert not node.value.startswith(('day_average_','month_average_')),node.value
from events_bridge import canonical_events, CANONICAL_EVENTS
canonical=canonical_events()['dataset']
assert r['eventsSource']['sha256']==hashlib.sha256(CANONICAL_EVENTS.read_bytes()).hexdigest()
assert {e['eventId'] for e in r['eventOccurrences']} <= {e['id'] for e in canonical['events']}
print(f'PASS: {len(expected)} worlds of {len(universe)} in market-update.json, {len(obs)} captures, {len(r["worldForecast"]):,} world/side/week forecasts, spread arithmetic, source isolation, no future leakage, model errors, rolling-origin metrics and bootstrap intervals, transfer tests, operational returns, paired comparisons and calendar dates.')

for source in r['sources']:
 assert hashlib.sha256((P/source['file']).read_bytes()).hexdigest()==source['sha256']
for w in expected:
 api=json.load(open(P/f'inputs/api/{w.lower()}.json'))
 archive=json.load(open(P/f'inputs/history/{w.lower()}.json'))
 records=[x for g in archive['snapshots'] for x in (g if isinstance(g,list) else [g])]
 assert sorted(api,key=lambda x:x['time'])==sorted(records,key=lambda x:x['time'])
assert {(x['world'],x['successor']) for x in r['predecessor']}=={(p,w) for w,ps in PREDECESSORS.items() for p in ps if w in expected and (P/f'inputs/api/{p.lower()}.json').exists()}
for x in r['predecessor']:assert x['days']==next(q['days'] for q in r['quality'] if q['world']==x['world'])
assert {x['world'] for x in r['quality']}==expected|{x['world'] for x in r['predecessor']}
print(f'PASS: input hashes, direct API provenance, archive reconciliation for {len(expected)} worlds and separate predecessor history.')

# ---------------------------------------------------------------- complement.py / complement.json
import sys, shutil, subprocess, tempfile
c = json.load(open(P/'complement.json'))
assert c['asOf']==r['asOf']
for source in c['sources']:
 assert hashlib.sha256((P/source['file']).read_bytes()).hexdigest()==source['sha256'],source['file']
ctree = ast.parse((P/'complement.py').read_text())
for node in ast.walk(ctree):
 if isinstance(node,ast.Constant) and isinstance(node.value,str):assert not node.value.startswith(('day_average_','month_average_')),node.value
# Swings: consecutive legs, arithmetic, cycle declines follow complete rises.
for side,sw in c['swings']['sides'].items():
 legs=sw['legs']
 for a,b in zip(legs[:-1],legs[1:]):assert a['end']==b['start'] and math.isclose(a['endLevel'],b['startLevel'])
 for l in legs:assert math.isclose(l['changePct'],100*(l['endLevel']/l['startLevel']-1))
 cur=sw['current'];assert math.isclose(cur['changePct'],100*(cur['endLevel']/cur['startLevel']-1)) and cur['start']==legs[-1]['end']
 assert all(not d['short'] and d['direction']=='queda' for d in sw['declines'])
# Round trips with Create Offer: accept column is the edition's, maker arithmetic uses the 2% fee on both placements.
acc={(x['world'],x['cycle'],x['sellMonth']):x['tcGainPct'] for x in r['roundtrips']}
for x in c['roundtripMaker']:
 assert math.isclose(x['acceptPct'],acc[(x['world'],x['cycle'],x['sellMonth'])])
 assert math.isclose(x['makerNetPct'],100*(x['sellAskMedian']*.98/(x['rebuyBidMedian']*1.02)-1))
 assert math.isclose(x['makerGrossPct'],100*(x['sellAskMedian']/x['rebuyBidMedian']-1))
# Relative value: the current premium is the median of same-day capture pairs.
for x in c['crossWorld']['worlds']:
 if x['currentPairs']:assert math.isclose(x['currentPremiumPct'],float(np.median([p['premiumPct'] for p in x['currentPairs']])))
 for p_ in x['currentPairs']:assert p_['date']<=r['asOf'] and any(o['capturedAt'][:10]==p_['date'] and o['world']==x['world'] for o in obs)
tests=c['weekday']['tests'];assert all(0<t['pIid']<=1 and 0<t['pBlock']<=1 and t['pBlock']<=t['pHolm']<=1 for t in tests)
# Probabilities: bounds, ordered quantiles, four seeds, paths per run from the stated draws, seed ranges drawn from the runs, package block untouched.
pr=c['probabilistic'];pkg=json.load(open(P/'source-package/forecast.json'))['M1_2024']
for side,samples in pr['sides'].items():
 for label,block in samples.items():
  assert [x['seed'] for x in block['runs']]==[11,99,123,2026]
  for x in block['runs']:
   assert x['paths']==pr['spec']['draws']*pr['spec']['pathsPerDraw']
   assert all(0<=v<=1 for v in x['prob'].values())
   for k in ['peakLevel','troughLevel',*[f'levels.{d}' for d in x['levels']]]:
    q=x['levels'][k[7:]] if k.startswith('levels.') else x[k];assert q[0]<=q[1]<=q[2],k
  for k,(lo,hi) in block['seedRange'].items():assert lo==min(x['prob'][k] for x in block['runs']) and hi==max(x['prob'][k] for x in block['runs'])
for f in pr['fan']:assert f['p10']<=f['p25']<=f['p50']<=f['p75']<=f['p90']
assert pr['package']['prob']==pkg['prob'] and pr['package']['peak']==pkg['peak']
# Calibration: every origin precedes its target and the last observed week; cells recomputed from the detail.
detail=pd.DataFrame(pr['calibrationDetail'])
last_week=max(x['date'] for x in r['history'] if x['world']=='Antica' and x['ask'] is not None)
assert ((pd.to_datetime(detail.origin)+pd.to_timedelta(detail.horizon*7,unit='D')).dt.strftime('%Y-%m-%d')<=last_week).all()
for row in pr['calibration']:
 g=detail[(detail.side==row['side'])&(detail.horizon==row['horizon'])]
 assert len(g)==row['n'] and math.isclose(row['cov80'],((g.pit>=.1)&(g.pit<=.9)).mean()) and math.isclose(row['cov50'],((g.pit>=.25)&(g.pit<=.75)).mean())
 assert math.isclose(row['brier'],((g.pUp-g.up)**2).mean())
# Downside: falls ordered by threshold, quantiles ordered, the curve bounded, and its value in the week of 28/06 equal to the
# probability the scenario tables publish; the fall below the week of 30/11 is defined only after that week.
for side,samples in pr['downside'].items():
 for label,d in samples.items():
  run=next(x for x in pr['sides'][side][label]['runs'] if x['seed']==11)
  for k in ['fromPeak','junVsNov','junVsStart']:assert d[k]==sorted(d[k])
  for a,b in zip(d['thresholds'][:-1],d['thresholds'][1:]):assert all(a[k]>=b[k] for k in ['fromPeak','junVsNov','junVsStart'])
  jun=next(x for x in d['curve'] if x['date']==pr['spec']['packageWeeks']['jun28'])
  assert math.isclose(jun['belowStart'],run['prob']['jun28BelowStart']) and math.isclose(jun['belowNov'],run['prob']['jun28BelowNov30'])
  assert all(0<=x['belowStart']<=1 and ((x['belowNov'] is None)==(x['date']<=pr['spec']['packageWeeks']['nov30'])) for x in d['curve'])
  assert math.isclose(next(t['fromPeak'] for t in d['thresholds'] if t['fallPct']==10),run['fall']['fromPeakGt10'])
# Sell-and-rebuy: the break-even arithmetic, and its probability by the week of 28/06 equal to the round trip's P(gain).
ask0,bid0=next((w['ask'],w['bid']) for w in r['worlds'] if w['world']==r['benchmark'])
for b in pr['breakEven']:
 most=bid0/(1+b['targetPct']/100) if b['mode']=='aceitando' else ask0*.98/(1.02*(1+b['targetPct']/100))
 assert math.isclose(b['rebuyAtMost'],most) and math.isclose(b['vsSellPct'],100*(most/ask0-1))
 if b['targetPct']==0:
  for label,v in b['pByJune'].items():assert math.isclose(v,next(x['pGain'] for x in pr['roundtrip'] if (x['sample'],x['mode'])==(label,b['mode'])))
for x in pr['roundtrip']:assert x['quantiles']==sorted(x['quantiles']) and x['pGain']+x['pLoss']<=1 and x['pLossGt10']<=x['pLoss'] and x['pGainGt10']<=x['pGain']
# Buy or sell: waiting to a week agrees with the downside curves, half now halves the plan it splits, the staged window is the
# seed-11 turning-point window, and each path's own peak and low bound the week inside their window.
dc=pr['decisions'];assert dc['weeks']['jun']==pr['spec']['packageWeeks']['jun28'] and dc['weeks']['nov']==pr['spec']['editionWeeks']['2026-11-25']
for actor,side,turn,wait in (('buyer','ask','troughDate','jun'),('seller','bid','peakDate','nov')):
 for label,plans in dc[actor].items():
  p_={x['plan']:x for x in plans};curve={x['date']:x['belowStart'] for x in pr['downside'][side][label]['curve']};run=next(x for x in pr['sides'][side][label]['runs'] if x['seed']==11)
  for x in plans:assert x['quantiles']==sorted(x['quantiles']) and 0<=x['pBetter']<=1
  for k in ('nov','jun'):assert math.isclose(p_[k]['pBetter'],curve[dc['weeks'][k]] if actor=='buyer' else 1-curve[dc['weeks'][k]])
  assert math.isclose(p_['half']['pBetter'],p_[wait]['pBetter']) and np.allclose(p_['half']['quantiles'],np.array(p_[wait]['quantiles'])/2)
  assert p_['staged']['window']==[run[turn][0],run[turn][2]]
  best,worst=('low','peak') if actor=='buyer' else ('peak','low')
  assert all(a>=b-1e-9 for a,b in zip(p_[best]['quantiles'],p_['jun' if actor=='buyer' else 'nov']['quantiles']))
  assert all(a<=b+1e-9 for a,b in zip(p_[worst]['quantiles'],p_['nov' if actor=='buyer' else 'jun']['quantiles']))
# Sensitivity: each factor's range spans its values and contains the base where the base is one of them.
for t in pr['tornado']:
 for f in t['factors']:
  vals=[v['value'] for v in f['values']];assert f['low']==min(vals) and f['high']==max(vals)
  if f['factor'] in ('seed','window','spec'):assert f['low']<=t['base']<=f['high']
# Calibration of P(fall): decomposition recomputed from its bins; the pooled cell counts every origin of its side.
for x in pr['calibrationDiagnostics']:
 g=detail[(detail.side==x['side'])&((detail.horizon==x['horizon'])|(x['horizon']==0))]
 assert len(g)==x['n']==sum(b['n'] for b in x['bins']) and math.isclose(x['brier'],((1-g.pUp-(~g.up.astype(bool)).astype(float))**2).mean())
 assert math.isclose(x['reliability'],sum(b['n']*(b['meanP']-b['freq'])**2 for b in x['bins'])/x['n'])
print('PASS: complement sources and hashes, offer-only fields, swing arithmetic, Create Offer fee arithmetic, same-day capture premiums, Holm order, probability bounds and seeds, package block, calibration chronology, downside curves, break-even arithmetic, buy-or-sell plans, sensitivity ranges and Brier decomposition.')
# Anchors and depth in complement.json: the latest-capture row repeats the published figures; a 100-TC round trip with no
# slippage is the published one, and a bound on slippage can only lower the break-even.
alt={x['anchor']:x for x in pr['anchorAlternatives']};run11=next(x for x in pr['sides']['ask']['main']['runs'] if x['seed']==11)
assert math.isclose(alt['latest']['pPeakAbove3'],run11['prob']['peakAbove3']) and math.isclose(alt['latest']['pJunBelowToday'],run11['prob']['jun28BelowStart'])
assert math.isclose(alt['latest']['takerGain'],next(x['pGain'] for x in pr['roundtrip'] if (x['sample'],x['mode'])==('main','aceitando')))
assert math.isclose(alt['latest']['sellerNov'],next(x['pBetter'] for x in pr['decisions']['seller']['main'] if x['plan']=='nov'))
assert alt['latest']['captures']==1<=alt['24h']['captures']<=alt['72h']['captures']
for x in pr['depthRoundtrip']:
 if x.get('breakEven') is not None:assert x['breakEven']<=bid0+1e-9 and all(x[k]['quantiles']==sorted(x[k]['quantiles']) for k in ('main','since2024'))
 if x['sellSlipPct']==0 and x['buySlipPct']==0:assert math.isclose(x['main']['pGain'],next(y['pGain'] for y in pr['roundtrip'] if (y['sample'],y['mode'])==('main','aceitando')))
print('PASS: anchor alternatives repeat the published figures at the latest capture; depth round trips bounded by the best quotes.')

# Robustness (robustness.json): built on the current outputs; the baseline floor and any floor with identical data change
# nothing; windows and effective sizes follow the published rolling detail; the challenger and the transfer rules reproduce the
# published scenarios where they coincide; slippage bounds are shares of the best price and never lower the round-trip cost.
x_=json.load(open(P/'robustness.json'));V=r['validation']
for s in x_['sources']:assert hashlib.sha256((P/s['file']).read_bytes()).hexdigest()==s['sha256'],f"robustness.json is stale for {s['file']}: rerun robustness.py"
for row in x_['filter']['rows']:
 if row['sameData']:assert row['maxProbPp']==row['maxLevelPct']==row['maxMapePp']==0 and not any(v['changed'] for v in row['verdicts'])
assert sum(row['baseline'] for row in x_['filter']['rows'])==1 and next(row for row in x_['filter']['rows'] if row['baseline'])['sameData']
roll=pd.DataFrame(r['rollingDetail'])
for x in x_['independence']:
 g=roll[(roll.side==x['side'])&(roll.horizon==x['horizon'])].sort_values('origin')
 assert x['n']==len(g) and x['windows']==(pd.Timestamp(g.origin.iloc[-1])-pd.Timestamp(g.origin.iloc[0])).days//7//x['horizon']+1
 assert (x['nEff'] is None)==(x['n']<2*x['horizon'])==(x['diffLow'] is None) and (x['nEff'] is None or 1<=x['nEff']<=x['n'])
 assert math.isclose(x['mapeCSH'],next(m['mape'] for m in V['metrics'] if (m['side'],m['horizon'],m['model'])==(x['side'],x['horizon'],'C+S+H')))
 assert math.isclose(x['mapeCS'],next(m['mape'] for m in V['metrics'] if (m['side'],m['horizon'],m['model'])==(x['side'],x['horizon'],'C+S')))
for f in r['forecast']:
 c=next(y for y in x_['challenger'] if (y['side'],y['date'])==(f['side'],f['date']));assert math.isclose(c['C+S+H'],f['base']) and math.isclose(c['Constante'],f['constant'])
for t in x_['transfer']['rolling']:
 if t['n']:assert math.isclose(t['skill_slope'],100*(1-t['mapeSlope']/t['mapeProp'])) and t['n']>=1 and t['windows']>=1
wf={(y['world'],y['side'],y['date']):y['base'] for y in r['worldForecast']}
for t in x_['transfer']['current']:
 if t['date']:assert t['prop']==wf[(t['world'],t['side'],t['date'])]
 if t['beta'] is not None:assert t['pairs']>=x_['transfer']['minPairs'] and t['betaLow']<=t['betaHigh']
lat=next(y for y in x_['anchor']['benchmark'] if y['anchor']=='latest');assert lat['captures']==1 and lat['ask']==ask0 and lat['bid']==bid0
for d in x_['depth']['worlds']:
 for q in x_['depth']['sizes']:
  for s in ('ask','bid'):assert d[f'{s}Slip{q}'] is None or d[f'{s}Slip{q}']>=0
  assert d[f'cost{q}'] is None or d[f'cost{q}']>=d['costPct']-1e-9
print('PASS: robustness outputs current, baseline floor unchanged, independent windows and effective sizes, challenger and transfer scenarios, anchors and slippage bounds.')

# The prospective ledger: an unbroken hash chain; the committed ledger a prefix of the working one, so no line was ever changed;
# every frozen target after its cutoff; every outcome scoring a closed week against the prediction frozen for it.
import ledger as ld
records,_=ld.read();forecasts={x['seq']:x for x in records if x['type']=='forecast'}
committed=subprocess.run(['git','show','HEAD:reports/tc-cycle/forecast-ledger.jsonl'],cwd=P,capture_output=True)
if committed.returncode==0:assert (P/'forecast-ledger.jsonl').read_bytes().startswith(committed.stdout),'forecast-ledger.jsonl: a committed line was changed or removed'
for f in forecasts.values():
 assert f['recordedAt'][:10]>=f['cutoff'] and all(w>f['cutoff'] for w in f['weekEnding']) and all(w['weekEnding']>f['cutoff'] for w in f['worlds'])
 assert len({x['id'] for x in forecasts.values()})==len(forecasts)
for o in [x for x in records if x['type']=='outcome']:
 f=forecasts[o['forecast']];assert o['forecastHash']==f['hash'] and o['weekEnding']<=o['cutoff']<=o['recordedAt'][:10]
 for side,s in o['antica'].items():
  j=f['weekEnding'].index(o['weekEnding'])
  for k,v in f['antica'][side].items():assert s[k]['predicted']==v[j] and math.isclose(s[k]['ape'],abs(v[j]/s['actual']-1)*100)
latest_f=forecasts[max(forecasts)] if forecasts else None
if latest_f and latest_f['cutoff']==r['asOf'] and any(not math.isclose(latest_f['antica']['ask']['C+S+H'][j],f['base']) for j,f in enumerate(x for x in r['forecast'] if x['side']=='ask')):
 print('NOTE: the frozen forecast for this cutoff predates later data of the same cutoff; the ledger keeps the first.')
print(f"PASS: forecast ledger chain and append-only history, {len(forecasts)} frozen forecasts, {sum(x['type']=='outcome' for x in records)} scored weeks.")

# Optional: rerun complement.py on a copy and require byte-identical output (all draws are seeded; ~2 min).
if '--reproduce' in sys.argv:
 with tempfile.TemporaryDirectory() as tmp:
  for name in ['complement.py','research_data.py','universe.py','events_bridge.py','market-update.json','results.json','inputs','source-package']:
   (shutil.copytree if (P/name).is_dir() else shutil.copy)(P/name,Path(tmp)/name)
  subprocess.run([sys.executable,'complement.py'],cwd=tmp,check=True,stdout=subprocess.DEVNULL,env={**__import__('os').environ,'TIBINANCE_REPOSITORY':str(P.parents[1])})
  assert (Path(tmp)/'complement.json').read_bytes()==(P/'complement.json').read_bytes()
 print('PASS: complement.py reproduces complement.json byte for byte.')
