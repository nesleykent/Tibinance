import json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from models import load, fit_m1, simulate, feats, T0
from backtest import analog_paths, piv, full
H=52
out={}
def run(start,label,ndraw=300,reps=20):
    y=load(start); last=y.dropna().index[-1]
    fut=pd.date_range(last+pd.Timedelta(weeks=1),periods=H,freq='W-MON')
    m,r=fit_m1(y,2)
    sims=simulate(m,r,H,fut,2,ndraw=ndraw,reps=reps,seed=11)
    # seasonal shape from the fitted Fourier terms (deterministic part, detrended)
    days=pd.date_range('2027-01-01','2027-12-31',freq='D'); X=feats(days,2,trend=False)
    s=sum(r.params[c]*X[c] for c in X.columns); s=s-s.mean()
    shape=dict(peak=str(s.idxmax().date())[5:],trough=str(s.idxmin().date())[5:],amplitude_pct=round(float((np.exp(s.max()-s.min())-1)*100),1))
    return y,last,fut,r,sims,shape
y,last,fut,r,sims,shape=run('2024-01-15','M1 2024+')
y0=float(y.dropna().iloc[-1]); I0=float(np.exp(y0))
print('last obs',last.date(),'level',round(I0),'| drift/yr %.3f ar %.3f sigma %.4f'%(r.params['t'],r.params['ar.L1'],np.sqrt(r.params['sigma2'])),'| paths',sims.shape[1])
print('seasonal shape (fitted):',shape)
Q=np.percentile(sims,[10,25,50,75,90],axis=1)
def window_stats(sims,fut,a,b):
    w=(fut>=pd.Timestamp(a))&(fut<=pd.Timestamp(b)); sub=sims[w]; idx=fut[w]
    lv=sub.max(axis=0); dt=idx[sub.argmax(axis=0)]
    return lv,dt
pk_lv,pk_dt=window_stats(sims,fut,'2026-09-22','2027-02-28')
tr_w=(fut>=pd.Timestamp('2027-03-01'))&(fut<=pd.Timestamp('2027-09-20'))
tr_lv=sims[tr_w].min(axis=0); tr_dt=fut[tr_w][sims[tr_w].argmin(axis=0)]
def q(a,ps=(10,50,90)): return [round(float(np.exp(np.percentile(a,p)))) for p in ps]
def qd(d,ps=(10,50,90)):
    v=np.sort(np.asarray(d,dtype='datetime64[D]').astype('int64'))
    return [str(np.datetime64(int(np.percentile(v,p)),'D')) for p in ps]
def at(date):
    i=fut.get_indexer([pd.Timestamp(date)],method='nearest')[0]; return sims[i]
res=dict(start=dict(date=str(last.date()),level=round(I0)),model=dict(drift_per_year=round(float(r.params['t']),3),ar1=round(float(r.params['ar.L1']),3),weekly_sigma=round(float(np.sqrt(r.params['sigma2'])),4),n_paths=int(sims.shape[1])),
  shape=shape,
  peak=dict(level_p10_p50_p90=q(pk_lv),date_p10_p50_p90=qd(pk_dt),pct_vs_start=[round((v/I0-1)*100,1) for v in q(pk_lv)]),
  trough=dict(level_p10_p50_p90=q(tr_lv),date_p10_p50_p90=qd(tr_dt),pct_vs_start=[round((v/I0-1)*100,1) for v in q(tr_lv)]),
  drawdown_peak_to_trough_p10_p50_p90=[round(float(v),1) for v in np.percentile((np.exp(tr_lv-pk_lv)-1)*100,[10,50,90])],
  level_2026_11_30=q(at('2026-11-30')),level_2027_03_29=q(at('2027-03-29')),level_2027_06_28=q(at('2027-06-28')),
  prob=dict(peak_above_start_plus3=round(float(np.mean(pk_lv>y0+np.log(1.03))),2),
            peak_after_oct31=round(float(np.mean(pk_dt>pd.Timestamp('2026-10-31'))),2),
            nov30_above_start=round(float(np.mean(at('2026-11-30')>y0)),2),
            jun28_below_start=round(float(np.mean(at('2027-06-28')<y0)),2),
            trough2027_above_trough2026=round(float(np.mean(tr_lv>np.log(37863))),2),
            jun28_below_nov30=round(float(np.mean(at('2027-06-28')<at('2026-11-30'))),2)))
print(json.dumps(res,indent=1))
out['M1_2024']=res
out['fan']=dict(dates=[str(d.date()) for d in fut],p10=[round(float(np.exp(v))) for v in Q[0]],p25=[round(float(np.exp(v))) for v in Q[1]],p50=[round(float(np.exp(v))) for v in Q[2]],p75=[round(float(np.exp(v))) for v in Q[3]],p90=[round(float(np.exp(v))) for v in Q[4]])
# sensitivity: 2023+ sample
y2,last2,fut2,r2,sims2,shape2=run('2023-01-09','M1 2023+',ndraw=200)
pk2=sims2[(fut2>=pd.Timestamp('2026-09-22'))&(fut2<=pd.Timestamp('2027-02-28'))].max(axis=0)
tw2=(fut2>=pd.Timestamp('2027-03-01'))&(fut2<=pd.Timestamp('2027-09-20')); tr2=sims2[tw2].min(axis=0)
out['M1_2023']=dict(shape=shape2,drift_per_year=round(float(r2.params['t']),3),peak=q(pk2),trough=q(tr2),p50_path=[round(float(np.exp(v))) for v in np.percentile(sims2,50,axis=1)])
print('M1 2023+ sensitivity:',out['M1_2023']['shape'],'drift',out['M1_2023']['drift_per_year'],'peak',out['M1_2023']['peak'],'trough',out['M1_2023']['trough'])
# analogs anchored at the current point, cycle anchor = last trough pivot
tr=[p for p in piv if p[0]=='T']; anchor=tr[-1][1]
paths=analog_paths(str(last.date()),fut,anchor)
an={}
names={'2023-07-24':'repete 2023–24','2024-07-08':'repete 2024–25','2025-06-23':'repete 2025–26','2023-01-09':'repete 1º sem. 2023'}
for k,v in paths.items():
    p=y0+v; w1=(fut<=pd.Timestamp('2027-02-28')); w2=(fut>=pd.Timestamp('2027-03-01'))
    an[k]=dict(name=names.get(k,k),path=[round(float(np.exp(x))) for x in p],peak=[str(fut[w1][np.argmax(p[w1])].date()),round(float(np.exp(p[w1].max())))],trough=[str(fut[w2][np.argmin(p[w2])].date()),round(float(np.exp(p[w2].min())))])
    print('analog',k,an[k]['name'],'peak',an[k]['peak'],'trough',an[k]['trough'])
out['analogs']=an; out['anchor_trough']=str(anchor.date()); out['days_since_trough']=int((last-anchor).days)
# history for the chart (weekly, from 2024-06)
h=full[full.index>=pd.Timestamp('2024-06-01')]
out['history']=[[str(d.date()),round(float(np.exp(v)))] for d,v in h.items()]
out['pivots']=[[p[0],str(p[1].date()),round(float(np.exp(p[2])))] for p in piv]
json.dump(out,open('forecast.json','w'),indent=1)
