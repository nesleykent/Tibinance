"""Market index from all worlds via a two-way median polish on log prices:
   log p[w,t] = a[w] (world premium) + b[t] (market level) + e.
   p_sell = average price of executed Sell Offers that server day (cleaned).
   (A chained median of daily returns was tried first and rejected: it drifts ~-0.07%/day from skew.)"""
import json, numpy as np, pandas as pd
allw=pd.read_pickle('daily_by_world.pkl')
W={w['name'].lower():w for w in json.load(open('worlds.json'))}
idx=pd.date_range('2023-01-01','2026-09-20',freq='D')
P=pd.DataFrame({w:dd['p_sell'].reindex(idx) for w,dd in allw.items()})
PB=pd.DataFrame({w:dd['p_buy'].reindex(idx) for w,dd in allw.items()})
V=pd.DataFrame({w:(dd['day_sold'].fillna(0)+dd['day_bought'].fillna(0)).where(dd['day_sold'].notna()).reindex(idx) for w,dd in allw.items()})
region={w:W.get(w,{}).get('location','?') for w in P.columns}
MINW=4
def polish(Pm, minw=MINW, iters=20):
    L=np.log(Pm)
    n=L.notna().sum(axis=1)
    L=L[n>=minw]
    a=L.median(axis=0)              # world effect
    b=pd.Series(0.0,index=L.index)
    for _ in range(iters):
        b=(L.sub(a,axis=1)).median(axis=1)
        a=(L.sub(b,axis=0)).median(axis=0)
    # anchor: a has median 0 across worlds -> b is the log price of the 'median world'
    shift=a.median(); a=a-shift; b=b+shift
    return b, a, n[n>=minw]
b0,a0,n0=polish(P)
# index universe: established worlds (premium within +-15% of the median world); new-world cohorts with
# strong own trends (TC very cheap in gold at launch) are excluded from the market index
core=[w for w in P.columns if abs(a0[w])<=np.log(1.15)]
b,a,n=polish(P[core])
a0.sort_values().to_csv('world_premium_all.csv',header=['log_premium'])
json.dump(core,open('core_worlds.json','w'))
out=pd.DataFrame(index=idx)
out['logI']=b; out['I']=np.exp(b); out['N']=n
out['R']=out['logI'].diff().where(out['logI'].notna() & out['logI'].shift().notna())
for loc,tag in (('South America','BR'),('Europe','EU'),('North America','NA')):
    cols=[w for w in core if region[w]==loc]
    bb,aa,nn=polish(P[cols],minw=3)
    out['logI_'+tag]=bb; out['R_'+tag]=out['logI_'+tag].diff(); out['n_'+tag]=nn
out['volume_tx']=V.sum(axis=1,min_count=MINW); out['nV']=V.notna().sum(axis=1)
out['xs_dispersion']=(np.log(P[core]).sub(a,axis=1)).std(axis=1).where(P[core].notna().sum(axis=1)>=10)
out.to_pickle('index.pkl'); P.to_pickle('P.pkl'); PB.to_pickle('PB.pkl'); V.to_pickle('V.pkl')
a.sort_values().to_csv('world_premium.csv',header=['log_premium'])
json.dump(region,open('region.json','w'))
f=out['logI'].first_valid_index()
print('index',f,'->',out['logI'].last_valid_index(),'days',out['logI'].notna().sum())
print(out.loc[f:,'I'].resample('QE').median().round(0).to_string())
print('premium (%) top/bottom:'); pr=(np.exp(a)-1)*100
print(pr.sort_values().round(1).head(6).to_string()); print(pr.sort_values().round(1).tail(6).to_string())
print('gentebra',round(pr['gentebra'],1),'antica',round(pr['antica'],1)); print('core worlds',len(core))
print(out['N'].resample('QE').median().to_string())
