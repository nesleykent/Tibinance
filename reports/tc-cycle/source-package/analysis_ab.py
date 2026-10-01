"""A) long-run level, B) volatility, C) seasonality, D) regimes, E) rallies, F) cross-world."""
import json, numpy as np, pandas as pd, ruptures as rpt
from scipy import stats
I=pd.read_pickle('index.pkl'); P=pd.read_pickle('P.pkl'); V=pd.read_pickle('V.pkl')
allw=pd.read_pickle('daily_by_world.pkl'); core=json.load(open('core_worlds.json')); region=json.load(open('region.json'))
res={}
cov=I['logI'].notna()
I=I.loc[I['logI'].first_valid_index():I['logI'].last_valid_index()]
R=I['R']
# ---------- A) long-run
m_idx=I['I'].resample('MS').median()
ant=allw['antica']; ant_m=ant['p_book'].resample('MS').median(); ant_ms=ant['p_sell'].resample('MS').median()
gen=allw['gentebra']; gen_m=gen['p_sell'].resample('MS').median()
res['monthly']={'index':{str(k.date())[:7]:round(v) for k,v in m_idx.dropna().items()},
                'antica_book':{str(k.date())[:7]:round(v) for k,v in ant_m.dropna().items()},
                'antica_sell':{str(k.date())[:7]:round(v) for k,v in ant_ms.dropna().items()},
                'gentebra_sell':{str(k.date())[:7]:round(v) for k,v in gen_m.dropna().items()}}
# yoy
yo={}
for y in (2025,2026):
    for mth in range(1,13):
        k=pd.Timestamp(y,mth,1); k0=pd.Timestamp(y-1,mth,1)
        if k in m_idx and k0 in m_idx and pd.notna(m_idx[k]) and pd.notna(m_idx[k0]): yo[str(k.date())[:7]]=round((m_idx[k]/m_idx[k0]-1)*100,1)
res['yoy_index_pct']=yo
# ---------- B) volatility
def moves(r):
    r=r.dropna(); a=r.abs()
    return dict(n=int(len(r)),std_pct=round(r.std()*100,2),median_abs_pct=round(a.median()*100,2),p90_abs_pct=round(a.quantile(.9)*100,2),max_up_pct=round(r.max()*100,1),max_down_pct=round(r.min()*100,1))
wk=I['logI'].resample('W-SUN').last().diff()
mo=np.log(m_idx).diff()
res['vol_index']={'daily':moves(R),'weekly':moves(wk),'monthly':moves(mo)}
# per-world daily/weekly volatility for established worlds with long history
def world_ret(w,freq=None):
    s=np.log(P[w])
    if freq: s=s.resample(freq).mean()
    return s.diff()
pw={}
for w in core:
    r=world_ret(w).dropna()
    if len(r)>250: pw[w]=r
res['vol_world_daily_std_pct']={'median_core':round(np.median([r.std()*100 for r in pw.values()]),2),
   'gentebra':round(world_ret('gentebra').std()*100,2),'antica':round(world_ret('antica').std()*100,2)}
res['vol_world_weekly_std_pct']={'gentebra':round(world_ret('gentebra','W-SUN').std()*100,2),'antica':round(world_ret('antica','W-SUN').std()*100,2),
   'median_core':round(np.median([world_ret(w,'W-SUN').std()*100 for w in pw]),2)}
# volatility over time: per-world weekly std by year (worlds with data in all years) + index weekly std by year
byyear={}
for y in (2024,2025,2026):
    wk_y=wk[str(y)].dropna()
    ws=[world_ret(w,'W-SUN')[str(y)].dropna().std()*100 for w in ('antica','vunira','nefera','dia','secura','lobera','inabra','gladera','belobra','peloria')]
    byyear[y]={'index_weekly_std_pct':round(wk_y.std()*100,2),'old10_weekly_std_median_pct':round(float(np.nanmedian(ws)),2),'index_daily_abs_median_pct':round(R[str(y)].abs().median()*100,2)}
res['vol_by_year']=byyear
# ---------- C) seasonality
tab={}
for k,v in mo.dropna().items(): tab.setdefault(k.month,{})[k.year]=round(v*100,1)
am=np.log(ant_m).diff()   # antica 2023 from book mid
for k,v in am.dropna().items():
    if k.year==2023 or (k.year==2024 and k.month==1): tab.setdefault(k.month,{})[f'{k.year}A']=round(v*100,1)
res['month_returns_pct']={m:tab[m] for m in sorted(tab)}
res['month_returns_avg_pct']={m:round(np.mean(list(tab[m].values())),1) for m in sorted(tab)}
# quarter pattern: Q3->Q4 change each year
q=I['I'].resample('QE').median(); qa=ant['p_book'].resample('QE').median()
res['q3_to_q4_pct']={'2023 (Antica)':round((qa['2023-12-31']/qa['2023-09-30']-1)*100,1),'2024':round((q['2024-12-31']/q['2024-09-30']-1)*100,1),'2025':round((q['2025-12-31']/q['2025-09-30']-1)*100,1)}
res['q4_to_q2_pct']={'2024 (Antica Q4-23 -> Q2-24)':round((qa['2024-06-30']/qa['2023-12-31']-1)*100,1),'2025':round((q['2025-06-30']/q['2024-12-31']-1)*100,1),'2026':round((q['2026-06-30']/q['2025-12-31']-1)*100,1)}
# weekday (server day) effect on index daily return
wd=pd.DataFrame({'R':R,'wd':R.index.dayofweek}).dropna()
names=['seg','ter','qua','qui','sex','sab','dom']
wdres={}
for d in range(7):
    x=wd[wd.wd==d]['R']
    wdres[names[d]]=dict(mean_pct=round(x.mean()*100,3),se_pct=round(x.std()/np.sqrt(len(x))*100,3),n=int(len(x)))
f,p=stats.kruskal(*[wd[wd.wd==d]['R'] for d in range(7)])
res['weekday_index_return']=wdres; res['weekday_kruskal_p']=round(p,3)
# weekday effect on price level relative to 7d centered mean (detrended) for index and gentebra
def wd_level(s):
    ls=np.log(s); dev=(ls-ls.rolling(7,center=True,min_periods=6).mean()).dropna()
    return {names[d]:round(dev[dev.index.dayofweek==d].mean()*100,2) for d in range(7)}, round(stats.kruskal(*[dev[dev.index.dayofweek==d] for d in range(7)])[1],4)
res['weekday_level_dev_index_pct'],res['weekday_level_dev_index_p']=wd_level(I['I'])
res['weekday_level_dev_gentebra_pct'],res['weekday_level_dev_gentebra_p']=wd_level(P['gentebra'])
# buy side too (price at which Buy Offers were filled)
PB=pd.read_pickle('PB.pkl')
res['weekday_level_dev_gentebra_buy_pct'],res['weekday_level_dev_gentebra_buy_p']=wd_level(PB['gentebra'])
# volume by weekday: median over core worlds of log(v/rolling 28d median)
lv=np.log(V[core].where(V[core]>0)); abn=lv-lv.rolling(28,min_periods=14).median()
av=abn.median(axis=1).dropna()
res['weekday_volume_dev_pct']={names[d]:round((np.exp(av[av.index.dayofweek==d].mean())-1)*100,1) for d in range(7)}
# ---------- D) regimes on log index (piecewise linear, continuous)
sig=I['logI'].interpolate(limit_area='inside').values.reshape(-1,1)
algo=rpt.Dynp(model='clinear',min_size=30,jump=5).fit(sig)
segs=[]
bk=algo.predict(n_bkps=9)
st=0
dates=I.index
for e in bk:
    e1=min(e,len(dates))-1
    a=I['logI'].iloc[st:e1+1].dropna()
    ch=(np.exp(a.iloc[-1]-a.iloc[0])-1)*100; days=(a.index[-1]-a.index[0]).days
    segs.append(dict(start=str(a.index[0].date()),end=str(a.index[-1].date()),days=int(days),change_pct=round(ch,1),per_month_pct=round(ch/days*30.4,2) if days else None,
                     daily_std_pct=round(R.loc[a.index[0]:a.index[-1]].std()*100,2)))
    st=e1
res['regimes']=segs
# ---------- E) rallies: zigzag swings on index and gentebra
def zigzag(s,thr):
    """classic zigzag: a swing ends when price reverses by >= thr from the running extreme. Last swing = unconfirmed."""
    s=s.dropna(); hi=(s.index[0],s.iloc[0]); lo=hi; trend=0; piv=[]; ext=None
    for t,v in s.items():
        if trend==0:
            if v>hi[1]: hi=(t,v)
            if v<lo[1]: lo=(t,v)
            if hi[1]>=lo[1]*(1+thr) and hi[0]>lo[0]: piv=[lo]; trend=1; ext=hi
            elif lo[1]<=hi[1]*(1-thr) and lo[0]>hi[0]: piv=[hi]; trend=-1; ext=lo
        elif trend==1:
            if v>ext[1]: ext=(t,v)
            elif v<=ext[1]*(1-thr): piv.append(ext); trend=-1; ext=(t,v)
        else:
            if v<ext[1]: ext=(t,v)
            elif v>=ext[1]*(1+thr): piv.append(ext); trend=1; ext=(t,v)
    piv.append(ext)
    sw=[]
    for i,((t0,v0),(t1,v1)) in enumerate(zip(piv[:-1],piv[1:])):
        sw.append(dict(start=str(t0.date()),end=str(t1.date()),days=(t1-t0).days,change_pct=round((v1/v0-1)*100,1),confirmed=i<len(piv)-2))
    return sw
def swing_stats(sw):
    cf=[x for x in sw if x['confirmed']]
    up=[x for x in cf if x['change_pct']>0]; dn=[x for x in cf if x['change_pct']<0]
    # retracement: down swing after an up swing, as fraction of up
    ret=[]
    for a,b in zip(cf[:-1],cf[1:]):
        if a['change_pct']>0 and b['change_pct']<0:
            up_mult=1+a['change_pct']/100; dn_mult=1+b['change_pct']/100
            ret.append((1-dn_mult)*up_mult/(up_mult-1))   # fraction of the gain given back
    return dict(n_up=len(up),up_med_pct=round(np.median([x['change_pct'] for x in up]),1),up_med_days=int(np.median([x['days'] for x in up])),
                up_range_days=[min(x['days'] for x in up),max(x['days'] for x in up)],
                n_down=len(dn),down_med_pct=round(np.median([x['change_pct'] for x in dn]),1),down_med_days=int(np.median([x['days'] for x in dn])),
                retrace_med_pct=round(np.median(ret)*100) if ret else None, retrace_list_pct=[round(r*100) for r in ret])
# smooth daily noise first (7d median) to avoid swings made by noise
ism=I['I'].rolling(7,center=True,min_periods=4).median()
zz=zigzag(ism,0.05); res['swings_index_5pct']=zz; res['swings_index_5pct_stats']=swing_stats(zz)
gsm=P['gentebra'].rolling(7,center=True,min_periods=4).median()
zg=zigzag(gsm,0.05); res['swings_gentebra_5pct']=zg; res['swings_gentebra_5pct_stats']=swing_stats(zg)
# conditional forward returns after strong 14-day rises
li=I['logI']
r14=li-li.shift(14)
fw={h:li.shift(-h)-li for h in (7,14,30,60)}
thr=r14.quantile(.9)
ep=[]; last=None
for t,v in r14.dropna().items():
    if v>=thr and (last is None or (t-last).days>=21): ep.append(t); last=t
cond={}
for h,s in fw.items():
    x=s.reindex(ep).dropna(); u=s.dropna()
    cond[h]=dict(n=int(len(x)),after_rise_median_pct=round(x.median()*100,2),after_rise_mean_pct=round(x.mean()*100,2),share_up=round((x>0).mean(),2),
                 unconditional_median_pct=round(u.median()*100,2),unconditional_share_up=round((u>0).mean(),2),
                 mw_p=round(stats.mannwhitneyu(x,u).pvalue,3) if len(x)>=4 else None)
res['after_strong_rise']=dict(threshold_14d_pct=round(thr*100,2),episodes=[str(t.date()) for t in ep],forward=cond)
# same after strong drops
thr_d=r14.quantile(.1); epd=[]; last=None
for t,v in r14.dropna().items():
    if v<=thr_d and (last is None or (t-last).days>=21): epd.append(t); last=t
condd={}
for h,s in fw.items():
    x=s.reindex(epd).dropna(); u=s.dropna()
    condd[h]=dict(n=int(len(x)),after_drop_median_pct=round(x.median()*100,2),share_up=round((x>0).mean(),2),unconditional_median_pct=round(u.median()*100,2))
res['after_strong_drop']=dict(threshold_14d_pct=round(thr_d*100,2),episodes=[str(t.date()) for t in epd],forward=condd)
# autocorrelation of weekly index returns (momentum vs mean reversion)
wkd=wk.dropna()
res['weekly_autocorr']={f'lag{k}':round(wkd.autocorr(k),3) for k in (1,2,3,4)}
res['weekly_autocorr_n']=int(len(wkd))
# ---------- F) cross-world
def corr_with_index(w,freq):
    s=np.log(P[w]); 
    if freq: s=s.resample(freq).mean(); ii=I['logI'].resample(freq).mean()
    else: ii=I['logI']
    d=pd.concat([s.diff(),ii.diff()],axis=1).dropna()
    return d.corr().iloc[0,1] if len(d)>30 else np.nan
cd={w:corr_with_index(w,None) for w in core}; cw={w:corr_with_index(w,'W-SUN') for w in core}; cm={w:corr_with_index(w,'MS') for w in core}
res['corr_world_vs_index']=dict(daily_median=round(np.nanmedian(list(cd.values())),2),weekly_median=round(np.nanmedian(list(cw.values())),2),monthly_median=round(np.nanmedian(list(cm.values())),2),
   gentebra=dict(daily=round(cd['gentebra'],2),weekly=round(cw['gentebra'],2),monthly=round(cm['gentebra'],2)),
   antica=dict(daily=round(cd['antica'],2),weekly=round(cw['antica'],2),monthly=round(cm['antica'],2)))
# lead-lag between regions (daily index returns) and gentebra vs index
def xcorr(a,b,lags=range(-3,4)):
    out={}
    for k in lags:
        d=pd.concat([a,b.shift(-k)],axis=1).dropna()
        out[k]=round(d.corr().iloc[0,1],3)
    return out   # k>0: b later (a leads)
res['xcorr_BR_vs_EU']=xcorr(I['R_BR'],I['R_EU']); res['xcorr_BR_vs_NA']=xcorr(I['R_BR'],I['R_NA']); res['xcorr_EU_vs_NA']=xcorr(I['R_EU'],I['R_NA'])
gr=np.log(P['gentebra']).diff()
res['xcorr_gentebra_vs_index']=xcorr(gr,R); res['xcorr_antica_vs_index']=xcorr(np.log(P['antica']).diff(),R)
# weekly lead-lag
wk_reg={t:I['logI_'+t].resample('W-SUN').mean().diff() for t in ('BR','EU','NA')}
res['xcorr_weekly_BR_vs_EU']=xcorr(wk_reg['BR'],wk_reg['EU'],range(-2,3))
# region premia
pr=pd.read_csv('world_premium.csv',index_col=0)['log_premium']
res['region_premium_pct']={loc:round((np.exp(pr[[w for w in pr.index if region[w]==loc]].median())-1)*100,1) for loc in ('South America','Europe','North America','Oceania') if any(region[w]==loc for w in pr.index)}
res['gentebra_premium_pct']=round((np.exp(pr['gentebra'])-1)*100,1)
# premium persistence: quarterly premium per world, corr between consecutive quarters
Lq=np.log(P[core]).resample('QE').median(); Iq=I['logI'].resample('QE').median()
prem_q=Lq.sub(Iq,axis=0)
pc=[]
for i in range(1,len(prem_q)):
    d=pd.concat([prem_q.iloc[i-1],prem_q.iloc[i]],axis=1).dropna()
    if len(d)>=8: pc.append((str(prem_q.index[i].date()),round(d.corr().iloc[0,1],2),len(d)))
res['premium_persistence_q2q']=pc
gq=prem_q['gentebra'].dropna(); res['gentebra_premium_by_quarter_pct']={str(k.date()):round((np.exp(v)-1)*100,1) for k,v in gq.items()}
# dispersion over time
res['dispersion_by_quarter_pct']={str(k.date()):round(v*100,2) for k,v in I['xs_dispersion'].resample('QE').median().dropna().items()}
json.dump(res,open('results_ab.json','w'),indent=1,default=str)
for k in ('vol_index','vol_world_daily_std_pct','vol_world_weekly_std_pct','vol_by_year','month_returns_avg_pct','q3_to_q4_pct','q4_to_q2_pct','weekday_kruskal_p','weekday_level_dev_index_pct','weekday_level_dev_index_p','weekday_level_dev_gentebra_pct','weekday_level_dev_gentebra_p','weekday_level_dev_gentebra_buy_pct','weekday_level_dev_gentebra_buy_p','weekday_volume_dev_pct','regimes','swings_index_5pct_stats','swings_gentebra_5pct_stats','after_strong_rise','after_strong_drop','weekly_autocorr','corr_world_vs_index','xcorr_BR_vs_EU','xcorr_BR_vs_NA','xcorr_EU_vs_NA','xcorr_gentebra_vs_index','xcorr_antica_vs_index','xcorr_weekly_BR_vs_EU','region_premium_pct','gentebra_premium_pct','premium_persistence_q2q','gentebra_premium_by_quarter_pct','dispersion_by_quarter_pct','yoy_index_pct'):
    print(k,'=',json.dumps(res[k],default=str))
print('month table',json.dumps(res['month_returns_pct']))
