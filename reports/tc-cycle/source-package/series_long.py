"""Long weekly log-price series of the 'typical world':
   2023-01 → 2024-01: Antica book mid, converted to p_sell scale and de-premiumed;
   2024-01 → 2026-09-13: cross-world index;  2026-09-21..23: new multi-world book captures (observations-2.json)."""
import json, numpy as np, pandas as pd
I=pd.read_pickle('index.pkl'); allw=pd.read_pickle('daily_by_world.pkl')
pr=pd.read_csv('world_premium.csv',index_col=0)['log_premium']; ob=json.load(open('obs2_index.json'))
ant=allw['antica']
back=np.log(ant['p_book'])+ob['k_mid']-pr['antica']
li=I['logI'].dropna()
ov=pd.concat([back,li],axis=1,keys=['back','idx']).dropna()
print('overlap days',len(ov),'median diff back-idx (log):',round((ov.back-ov.idx).median(),4),'corr of weekly changes:',round(ov.resample('W-MON').mean().diff().corr().iloc[0,1],3))
shift=(ov.back-ov.idx).median()
back=back-shift     # align level exactly to the index on the overlap
daily=pd.concat([back[back.index<li.index[0]],li])
new=pd.Series({pd.Timestamp(k):np.log(v['I_blend']) for k,v in ob['days'].items()})
daily=pd.concat([daily,new]).sort_index()
daily=daily[~daily.index.duplicated(keep='last')]
wk=daily.resample('W-MON',label='left',closed='left').mean().dropna()
print('weekly obs',len(wk),wk.index[0].date(),'→',wk.index[-1].date())
print('gap weeks (missing):',int((wk.index.to_series().diff().dt.days>7).sum()))
wk.to_pickle('weekly_log.pkl'); daily.to_pickle('daily_log_long.pkl')
print(np.exp(wk).round().tail(6))
