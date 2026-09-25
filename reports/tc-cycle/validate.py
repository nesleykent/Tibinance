"""Independent acceptance checks for source boundaries, arithmetic and chronology."""
from pathlib import Path
import json,math,ast,hashlib
import numpy as np
import pandas as pd
P=Path(__file__).resolve().parent
r=json.load(open(P/'results.json'));obs=json.load(open(P/'inputs/observations-2.json'))
expected=set('Antica Belobra Celebra Collabra Descubra Gentebra Luminera Luzibra Ombra Ourobra Quelibra Rasteibra Terribra Tornabra Ustebra Venebra'.split())
assert {x['world'] for x in r['worlds']}==expected
assert len(obs)==45 and len({x['hash'] for x in obs})==45
for w in r['worlds']:
 o=sorted([x for x in obs if x['world']==w['world']],key=lambda x:x['capturedAt'])
 if o:assert (w['ask'],w['bid'],w['date'])==(o[-1]['sell'],o[-1]['buy'],o[-1]['capturedAt'][:10])
 assert math.isclose(w['spreadPct'],200*(w['ask']-w['bid'])/(w['ask']+w['bid']))
 assert math.isclose(w['costPct'],100*(1-w['bid']/w['ask']))
for x in r['quality']:assert x['valid']+x['missingBook']+x['crossed']+x['wideSpread']==x['records']
for key in ['forecast','worldForecast']:
 for row in r[key]:
  if row['base'] is None:assert row['world']=='Luzibra' and row['date']>='2026-10-22'
  else:assert 0<row['low']<=row['base']<=row['high']
for w in expected:
 arr=[x for x in r['worldForecast'] if x['world']==w];assert len(arr)==104
 a={x['date']:x for x in arr if x['side']=='ask'}
 for b in [x for x in arr if x['side']=='bid']:
  if b['base'] is not None:assert b['base']<a[b['date']]['base'],(w,b['date'])
for x in r['backtestDetail']:
 assert x['origin']<x['target'] and x['target']<='2026-09-23'
 assert math.isclose(x['ape'],abs(x['predicted']/x['actual']-1)*100)
for x in r['backtest']:
 values=[t['ape'] for t in r['backtestDetail'] if (t['side'],t['horizon'],t['model'])==(x['side'],x['horizon'],x['model'])]
 assert len(values)==x['n'];assert math.isclose(sum(values)/len(values),x['mape'])
for x in r['roundtrips']:assert math.isclose(x['tcGainPct'],100*(x['bidMedian']/x['askRebuyMedian']-1))
for x in r['tradeComparison']:
 a=[t for t in r['tradeComparisonDaily'] if (t['world'],t['side'])==(x['world'],x['side'])]
 assert len(a)==x['n'];assert np.isclose(np.median([t['gapPct'] for t in a]),x['medianGapPct'])
 assert all(np.isclose(t['gapPct'],100*(t['trade']/t['offer']-1)) for t in a)
# Prove forecasts ignore future additions: load only the pure function definitions.
tree=ast.parse((P/'analyze.py').read_text());funcs=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ['features','preds']]
ns={'pd':pd,'np':np,'T0':pd.Timestamp('2023-01-01')};exec(compile(ast.Module(body=funcs,type_ignores=[]),'models','exec'),ns)
y=pd.Series({pd.Timestamp(x['date']):x['ask'] for x in r['history'] if x['world']=='Antica'}).sort_index().dropna();o=pd.Timestamp('2025-01-05');future=pd.date_range(o+pd.Timedelta(weeks=1),periods=52,freq='7D');anchor=y.loc[:o].iloc[-1]
a=ns['preds'](y,o,future,anchor);modified=y.copy();modified.loc[modified.index>o]=999999999
b=ns['preds'](modified,o,future,anchor);assert np.allclose(a,b,equal_nan=True)
# Ensure offer analysis never loads transaction fields. Comparison is a separate program.
for node in ast.walk(tree):
 if isinstance(node,ast.Constant) and isinstance(node.value,str):assert not node.value.startswith(('day_average_','month_average_')),node.value
assert all(x['calendarMatch'] for x in r['calendar'])
print('PASS: 16 worlds, 45 captures, 1,664 world/side/week forecasts, spread arithmetic, source isolation, no future leakage, model errors, operational returns, paired comparisons and calendar dates.')

for source in r['sources']:
 assert hashlib.sha256((P/source['file']).read_bytes()).hexdigest()==source['sha256']
for w in expected:
 api=json.load(open(P/f'inputs/api/{w.lower()}.json'))
 archive=json.load(open(P/f'inputs/history/{w.lower()}.json'))
 records=[x for g in archive['snapshots'] for x in (g if isinstance(g,list) else [g])]
 assert sorted(api,key=lambda x:x['time'])==sorted(records,key=lambda x:x['time'])
assert r['predecessor'][0]['days']==78
assert {x['world'] for x in r['quality']}==expected|{'Obscubra'}
print('PASS: input hashes, direct API provenance, archive reconciliation and separate Obscubra history.')

# ---------------------------------------------------------------- complement.py / complement.json
import sys, shutil, subprocess, tempfile
c = json.load(open(P/'complement.json'))
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
 for p_ in x['currentPairs']:assert p_['date'][:8]=='2026-09-'
tests=c['weekday']['tests'];assert all(0<t['pIid']<=1 and 0<t['pBlock']<=1 and t['pBlock']<=t['pHolm']<=1 for t in tests)
# Probabilities: bounds, ordered quantiles, four seeds, seed ranges drawn from the runs, package block untouched.
pr=c['probabilistic'];pkg=json.load(open(P/'source-package/forecast.json'))['M1_2024']
for side,samples in pr['sides'].items():
 for label,block in samples.items():
  assert [x['seed'] for x in block['runs']]==[11,99,123,2026]
  for x in block['runs']:
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
print('PASS: complement sources and hashes, offer-only fields, swing arithmetic, Create Offer fee arithmetic, same-day capture premiums, Holm order, probability bounds and seeds, package block, calibration chronology.')

# Optional: rerun complement.py on a copy and require byte-identical output (all draws are seeded; ~2 min).
if '--reproduce' in sys.argv:
 with tempfile.TemporaryDirectory() as tmp:
  for name in ['complement.py','results.json','inputs','source-package']:
   (shutil.copytree if (P/name).is_dir() else shutil.copy)(P/name,Path(tmp)/name)
  subprocess.run([sys.executable,'complement.py'],cwd=tmp,check=True,stdout=subprocess.DEVNULL)
  assert (Path(tmp)/'complement.json').read_bytes()==(P/'complement.json').read_bytes()
 print('PASS: complement.py reproduces complement.json byte for byte.')
