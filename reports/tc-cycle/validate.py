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
