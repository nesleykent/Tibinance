import json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from models import load, fit_m1, fit_m2, simulate, feats
full=pd.read_pickle('weekly_log.pkl')
def zig(s,thr=0.05):
    s=s.dropna(); hi=(s.index[0],s.iloc[0]); lo=hi; trend=0; piv=[]; ext=None
    for t,v in s.items():
        if trend==0:
            if v>hi[1]: hi=(t,v)
            if v<lo[1]: lo=(t,v)
            if hi[1]-lo[1]>=np.log(1+thr) and hi[0]>lo[0]: piv=[('T',)+lo]; trend=1; ext=hi
            elif hi[1]-lo[1]>=np.log(1+thr) and lo[0]>hi[0]: piv=[('P',)+hi]; trend=-1; ext=lo
        elif trend==1:
            if v>ext[1]: ext=(t,v)
            elif ext[1]-v>=np.log(1/(1-thr)): piv.append(('P',)+ext); trend=-1; ext=(t,v)
        else:
            if v<ext[1]: ext=(t,v)
            elif v-ext[1]>=np.log(1+thr): piv.append(('T',)+ext); trend=1; ext=(t,v)
    return piv
piv=zig(full.rolling(3,center=True,min_periods=2).mean())
print('pivots (weekly, 3w smoothed):'); [print(p[0],p[1].date(),round(float(np.exp(p[2])))) for p in piv]
json.dump([[p[0],str(p[1].date()),float(p[2])] for p in piv],open('pivots.json','w'))
def evaluate(origin,label,start):
    y=load(start,origin); last=y.dropna().index[-1]
    h=50; fut=pd.date_range(last+pd.Timedelta(weeks=1),periods=h,freq='W-MON')
    act=full.reindex(fut)
    res={}
    for name,fit,K in (('M1',fit_m1,2),('M2',fit_m2,1)):
        m,r=fit(y,K)
        sims=simulate(m,r,h,fut,K,ndraw=150,reps=20,use_exog=(name=='M1'))
        q=np.nanpercentile(sims,[10,25,50,75,90],axis=1)
        med=pd.Series(q[2],index=fut); a=act.dropna()
        mape=float(np.mean(np.abs(np.exp(med[a.index]-a)-1))*100)
        cov80=float(np.mean((a>=q[0][fut.get_indexer(a.index)])&(a<=q[4][fut.get_indexer(a.index)])))
        cov50=float(np.mean((a>=q[1][fut.get_indexer(a.index)])&(a<=q[3][fut.get_indexer(a.index)])))
        w1=(fut>=pd.Timestamp(origin))&(fut<=pd.Timestamp(origin)+pd.Timedelta(days=170))
        w2=(fut>pd.Timestamp(origin)+pd.Timedelta(days=170))&(fut<=pd.Timestamp(origin)+pd.Timedelta(days=350))
        pk_pred=med[w1].idxmax(); tr_pred=med[w2].idxmin()
        aw1=act[w1].dropna(); aw2=act[w2].dropna()
        res[name]=dict(mape_pct=round(mape,2),cov80=round(cov80,2),cov50=round(cov50,2),
            peak_pred=[str(pk_pred.date()),round(float(np.exp(med[pk_pred])))],peak_act=[str(aw1.idxmax().date()),round(float(np.exp(aw1.max())))],
            trough_pred=[str(tr_pred.date()),round(float(np.exp(med[tr_pred])))],trough_act=[str(aw2.idxmin().date()),round(float(np.exp(aw2.min())))],
            start_level=round(float(np.exp(y.dropna().iloc[-1]))))
    # analog model: cycles that ended before origin, anchored at origin
    res['M3']=analog_eval(origin,fut,act)
    print(label,json.dumps(res,indent=0))
    return res
def cycles_before(origin):
    tr=[(p[1],p[2]) for p in piv if p[0]=='T']
    cyc=[]
    for (t0,v0),(t1,v1) in zip(tr[:-1],tr[1:]):
        if t1<=pd.Timestamp(origin): cyc.append((t0,t1))
    return cyc
def analog_paths(origin,fut,anchor_trough):
    """continuation paths: for each past cycle, the log change from (days since that cycle's trough equal to origin's days since anchor_trough)"""
    d_now=(pd.Timestamp(origin)-anchor_trough).days
    paths={}
    for (t0,t1) in cycles_before(origin):
        s=full.copy(); dd=(s.index-t0).days
        g=pd.Series(s.values,index=dd)
        base=np.interp(d_now,g.index,g.values)
        vals=[np.interp(d_now+(f-pd.Timestamp(origin)).days,g.index,g.values)-base for f in fut]
        paths[f'{t0.date()}']=np.array(vals)
    return paths
def analog_eval(origin,fut,act):
    tr=[p for p in piv if p[0]=='T' and p[1]<=pd.Timestamp(origin)]
    anchor=tr[-1][1]
    y0=full[full.index<=pd.Timestamp(origin)].iloc[-1]
    paths=analog_paths(origin,fut,anchor)
    out={}
    for k,v in paths.items():
        pred=pd.Series(y0+v,index=fut); a=act.dropna()
        out[k]=dict(mape_pct=round(float(np.mean(np.abs(np.exp(pred[a.index]-a)-1))*100),2))
    avg=pd.Series(y0+np.mean(list(paths.values()),axis=0),index=fut); a=act.dropna()
    out['media']=dict(mape_pct=round(float(np.mean(np.abs(np.exp(avg[a.index]-a)-1))*100),2))
    return out
if __name__=='__main__':
    bt={}
    bt['2023+']=evaluate('2025-09-15','backtest origem 2025-09-15, amostra 2023+','2023-01-09')
    bt['2024+']=evaluate('2025-09-15','backtest origem 2025-09-15, amostra 2024+','2024-01-15')
    bt['2023+_o2024']=evaluate('2024-09-16','backtest origem 2024-09-16, amostra 2023+','2023-01-09')
    # naive benchmark: no change (random walk) from origin
    for o in ('2025-09-15','2024-09-16'):
        y0=full[full.index<=pd.Timestamp(o)].iloc[-1]; fut=pd.date_range(pd.Timestamp(o)+pd.Timedelta(weeks=1),periods=50,freq='W-MON'); a=full.reindex(fut).dropna()
        print('naive (sem mudança) origem',o,'MAPE %.2f'%(np.mean(np.abs(np.exp(y0-a)-1))*100))
        bt['naive_'+o]=round(float(np.mean(np.abs(np.exp(y0-a)-1))*100),2)
    json.dump(bt,open('backtest.json','w'),indent=1)
