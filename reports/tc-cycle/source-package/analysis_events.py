"""Event study on the cross-world TC index (abnormal = raw log change minus prior-60-day median drift).
Placebo: same computation at random anchor days (same durations), 4000 draws of k-occurrence means.
Windows: pre = 7 days before start; during = start..end; post7 = 7 days after end; post30 = 30 days after end.
Activity: median over core worlds of log(transactions / median of the 28 days before the pre-window)."""
import json, numpy as np, pandas as pd
rng=np.random.default_rng(42)
I=pd.read_pickle('index.pkl'); V=pd.read_pickle('V.pkl'); core=json.load(open('core_worlds.json'))
li=I['logI']; R=I['R']
first=li.first_valid_index(); last=li.last_valid_index()
liff=li.ffill(limit=2)   # tolerate 1-2 missing days
# activity index: per world log volume minus trailing median, median over worlds (computed on the fly per anchor)
LV=np.log(V[core].where(V[core]>0))
def lv_at(t): 
    return LV.loc[t] if t in LV.index else None
def val(t):
    return liff.get(t,np.nan)
def drift(s):
    x=R.loc[s-pd.Timedelta(days=67):s-pd.Timedelta(days=8)].dropna()
    return x.median() if len(x)>=30 else np.nan
def windows(s,e):
    D=lambda n: pd.Timedelta(days=n)
    mu=drift(s); L=(e-s).days+1
    out={}
    out['pre']=val(s-D(1))-val(s-D(8))-7*mu
    out['during']=val(e)-val(s-D(1))-L*mu
    out['post7']=val(e+D(7))-val(e)-7*mu
    out['post30']=val(e+D(30))-val(e)-30*mu
    out['raw_during']=val(e)-val(s-D(1))
    # activity during vs baseline
    base=LV.loc[s-D(36):s-D(8)].median()
    dur=LV.loc[s:e].mean()
    a=(dur-base).dropna()
    out['activity']=a.median() if len(a)>=4 else np.nan
    return out
def valid_anchor(s,e,need_post=30):
    return s-pd.Timedelta(days=67)>=first and e+pd.Timedelta(days=need_post)<=last
ev=json.load(open('events_intervals.json'))+json.load(open('extra_events.json'))
for x in ev: x['s']=pd.Timestamp(x['start']); x['e']=pd.Timestamp(x['end'])
GROUP={'XP/Skill Event':'XP/Skill Event','Skill Event':'Skill Event (junho)','Rapid Respawn':'Rapid Respawn','Loot Event':'Loot Event',
 'Exaltation Overload':'Exaltation Overload','Full Moon':'Full Moon','Last Creep Standing':'Last Creep Standing',
 'Summer Update':'Summer Update','Winter Update':'Winter Update','Monk release':'Monk release','Tibia Token launch':'Tibia Token launch','Tibia Token fee 6%->8%':'Tibia Token fee',
 'Carnival Month':'Evento do mês (Carnival/Prank/Flower/Hot Cuisine/Double Daily Reward/Chyllfroest)','Prank Month':'Evento do mês (Carnival/Prank/Flower/Hot Cuisine/Double Daily Reward/Chyllfroest)',
 'Flower Month':'Evento do mês (Carnival/Prank/Flower/Hot Cuisine/Double Daily Reward/Chyllfroest)','Hot Cuisine Month':'Evento do mês (Carnival/Prank/Flower/Hot Cuisine/Double Daily Reward/Chyllfroest)',
 'Double Daily Reward Month':'Double Daily Reward Month','Chyllfroest':'Evento do mês (Carnival/Prank/Flower/Hot Cuisine/Double Daily Reward/Chyllfroest)',
 'Christmas':'Christmas','Winterlight Solstice':'Winterlight Solstice','New Year':'New Year','Tibia Anniversary':'Tibia Anniversary',
 'Orcsoberfest':'Orcsoberfest','Colours of Magic':'Colours of Magic','Annual Autumn Vintage':'Annual Autumn Vintage','Halloween Event':'Halloween Event',
 'Lightbearer':'Lightbearer','Rise of Devovorga':'Rise of Devovorga','The First Dragon':'The First Dragon','Demon\'s Lullaby':"Demon's Lullaby",
 'Spring into Life':'Spring into Life','Bewitched':'Bewitched','A Piece of Cake':'A Piece of Cake','Valentine\'s Day':"Valentine's Day",'The Great Expedition':'The Great Expedition'}
# drop 1-day artifacts of multi-day events
ev=[x for x in ev if not (x['event'] in ('New Year','Winterlight Solstice','Annual Autumn Vintage','Colours of Magic','Rise of Devovorga') and (x['e']-x['s']).days==0)]
occ={}
for x in ev:
    g=GROUP.get(x['event'],x['event'])
    need=30 if 'Update' in g or g in ('Monk release','Tibia Token launch','Tibia Token fee') else 7
    if not valid_anchor(x['s'],x['e'],need): continue
    w=windows(x['s'],x['e'])
    others=sorted({GROUP.get(y['event'],y['event']) for y in ev if y is not x and y['s']<=x['e']+pd.Timedelta(days=7) and y['e']>=x['s']-pd.Timedelta(days=7) and GROUP.get(y['event'],y['event'])!=g})
    occ.setdefault(g,[]).append(dict(start=str(x['s'].date()),end=str(x['e'].date()),**{k:(None if pd.isna(v) else round(float(v)*100,2)) for k,v in w.items()},overlaps=others))
# placebo pools per duration
days=pd.date_range(first+pd.Timedelta(days=67),last-pd.Timedelta(days=37))
pool_cache={}
def pool(L,M=1500):
    if L in pool_cache: return pool_cache[L]
    rows=[]
    for s in rng.choice(days,size=M,replace=True):
        s=pd.Timestamp(s); e=s+pd.Timedelta(days=L-1)
        w=windows(s,e); rows.append(w)
    df=pd.DataFrame(rows)*100
    pool_cache[L]=df; return df
def placebo_p(g,key):
    obs=[o[key] for o in occ[g] if o[key] is not None]
    if len(obs)<2: return None,None,None
    Ls=[(pd.Timestamp(o['end'])-pd.Timestamp(o['start'])).days+1 for o in occ[g] if o[key] is not None]
    k=len(obs); m_obs=np.mean(obs)
    sims=np.zeros(4000)
    for L in set(Ls):
        pl=pool(L)[key].dropna().values
        cnt=Ls.count(L)
        sims+=rng.choice(pl,size=(4000,cnt),replace=True).sum(axis=1)
    sims/=k
    p=2*min((sims<=m_obs).mean(),(sims>=m_obs).mean())
    return round(m_obs,2),round(min(p,1.0),3),round(float(np.median(sims)),2)
rows=[]
for g,lst in occ.items():
    r=dict(group=g,n=len(lst))
    for key in ('pre','during','post7','post30','activity'):
        m,p,med=placebo_p(g,key)
        r[key+'_mean']=m; r[key+'_p']=p; r[key+'_placebo_median']=med
        vals=[o[key] for o in lst if o[key] is not None]
        r[key+'_share_pos']=round(np.mean([v>0 for v in vals]),2) if vals else None
    rows.append(r)
T=pd.DataFrame(rows).sort_values('n',ascending=False)
# Benjamini-Hochberg over price tests (pre/during/post7) for groups with n>=3
tests=[]
for i,r in T.iterrows():
    if r['n']>=3:
        for key in ('pre','during','post7'):
            if pd.notna(r[key+'_p']): tests.append((i,key,r[key+'_p']))
ps=np.array([t[2] for t in tests]); order=np.argsort(ps); m=len(ps); q=np.empty(m)
prev=1.0
for rank,idx_ in reversed(list(enumerate(order,1))):
    prev=min(prev,ps[idx_]*m/rank); q[idx_]=prev
for (i,key,p),qq in zip(tests,q): T.loc[i,key+'_q']=round(qq,3)
T.to_csv('event_study.csv',index=False)
json.dump(occ,open('event_occurrences.json','w'),indent=1)
pd.set_option('display.width',250)
cols=['group','n','pre_mean','pre_p','pre_q','during_mean','during_p','during_q','post7_mean','post7_p','post7_q','post30_mean','post30_p','activity_mean','activity_p']
print(T[[c for c in cols if c in T]].to_string(index=False))
print('number of price tests',m,'min q',round(q.min(),3))
