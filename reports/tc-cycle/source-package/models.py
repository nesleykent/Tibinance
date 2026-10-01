"""Forecast models for the weekly log TC index ('typical world').
M1: regression on annual Fourier terms + linear time trend, with ARIMA(1,1,0) errors (seasonal drift + random walk).
M2: structural model: smooth stochastic trend + deterministic annual harmonics + AR(1) noise.
Both simulated with parameter uncertainty (draws from the estimated covariance)."""
import json, warnings, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.statespace.structural import UnobservedComponents
P=365.25/7; T0=pd.Timestamp('2023-01-02')
def load(start='2024-01-15',end=None):
    wk=pd.read_pickle('weekly_log.pkl')
    if end is not None: wk=wk[wk.index<=pd.Timestamp(end)]
    wk=wk[wk.index>=pd.Timestamp(start)]
    grid=pd.date_range(wk.index[0],wk.index[-1],freq='W-MON')
    return wk.reindex(grid)
def feats(idx,K,trend=True):
    t=np.asarray((idx-T0).days/365.25); X={}
    if trend: X['t']=t
    for k in range(1,K+1): X[f'c{k}']=np.cos(2*np.pi*k*t); X[f's{k}']=np.sin(2*np.pi*k*t)
    return pd.DataFrame(X,index=idx)
def fit_m1(y,K=2):
    m=SARIMAX(y,exog=feats(y.index,K),order=(1,1,0)); return m,m.fit(disp=False,maxiter=1000)
def fit_m2(y,K=2):
    m=UnobservedComponents(y,level='smooth trend',freq_seasonal=[{'period':P,'harmonics':K}],stochastic_freq_seasonal=[False],autoregressive=1)
    return m,m.fit(disp=False,maxiter=1000)
def valid(model,params):
    names=model.param_names
    for n,v in zip(names,params):
        if n.startswith('sigma2') and v<=0: return False
        if (n.startswith('ar.') or n.startswith('ar.L')) and abs(v)>=0.99: return False
    return True
def simulate(model,res,h,future_index,K,ndraw=200,reps=20,seed=1,use_exog=True):
    rng=np.random.default_rng(seed); out=[]
    cov=res.cov_params().values; mu=res.params.values
    ex=feats(future_index,K) if use_exog else None
    tries=0
    while len(out)<ndraw and tries<ndraw*20:
        tries+=1
        p=rng.multivariate_normal(mu,cov) if len(out)>0 else mu
        if not valid(model,p): continue
        try:
            r=model.filter(p)
            s=r.simulate(h,repetitions=reps,anchor='end',exog=ex) if use_exog else r.simulate(h,repetitions=reps,anchor='end')
        except Exception as e:
            continue
        a=np.asarray(s).reshape(h,-1)
        if np.isfinite(a).all(): out.append(a)
    return np.concatenate(out,axis=1)   # h x N
if __name__=='__main__':
    for lab,start in (('2024+','2024-01-15'),('2023+','2023-01-09')):
        y=load(start)
        for K in (1,2,3):
            m1,r1=fit_m1(y,K); m2,r2=fit_m2(y,K)
            print(lab,'K',K,'M1 aic %.1f drift/yr %.3f ar %.3f'%(r1.aic,r1.params['t'],r1.params['ar.L1']),'| M2 aic %.1f'%r2.aic)
