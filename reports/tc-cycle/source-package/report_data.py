"""Collect every number/series the report page needs into report_data.json."""
import json, numpy as np, pandas as pd
I=pd.read_pickle('index.pkl'); P=pd.read_pickle('P.pkl'); PB=pd.read_pickle('PB.pkl'); V=pd.read_pickle('V.pkl')
core=json.load(open('core_worlds.json')); ab=json.load(open('results_ab.json')); occ=json.load(open('event_occurrences.json'))
T=pd.read_csv('event_study.csv')
out={}
f,l=I['logI'].first_valid_index(),I['logI'].last_valid_index()
# weekly series (median of daily values within Mon-Sun week, labelled by week start)
def weekly(s):
    w=s.resample('W-MON',label='left',closed='left').median()
    return [[str(k.date()),round(v)] for k,v in w.dropna().items()]
out['weekly_index']=weekly(I['I'][f:l])
out['weekly_gentebra']=weekly(P['gentebra'].dropna())
ant=pd.read_pickle('daily_by_world.pkl')['antica']
out['weekly_antica_2023']=weekly(ant['p_book']['2023-01-01':'2024-01-14'])
# swings & updates
out['swings_index']=ab['swings_index_5pct']; out['swings_gentebra']=ab['swings_gentebra_5pct']
upd=[x for x in json.load(open('extra_events.json'))]
li=I['logI'].ffill(limit=2)
def ch(t,a,b):
    ta=t+pd.Timedelta(days=a); tb=t+pd.Timedelta(days=b)
    try:
        va,vb=li[ta],li[tb]
        return None if pd.isna(va) or pd.isna(vb) else round((np.exp(vb-va)-1)*100,1)
    except KeyError: return None
out['updates']=[dict(event=x['event'],date=x['start'],before60=ch(pd.Timestamp(x['start']),-60,0),after30=ch(pd.Timestamp(x['start']),0,30),after90=ch(pd.Timestamp(x['start']),0,90),source=x['source']) for x in upd]
# stats tiles
out['vol']=ab['vol_index']; out['vol_by_year']=ab['vol_by_year']; out['vol_world']=ab['vol_world_daily_std_pct']
# seasonality
out['month_returns']=ab['month_returns_pct']; out['month_avg']=ab['month_returns_avg_pct']
out['q3q4']=ab['q3_to_q4_pct']; out['q4q2']=ab['q4_to_q2_pct']
out['weekday_gentebra_pct']=ab['weekday_level_dev_gentebra_pct']; out['weekday_index_pct']=ab['weekday_level_dev_index_pct']
out['weekday_volume_pct']=ab['weekday_volume_dev_pct']
out['weekday_p']={'index':ab['weekday_level_dev_index_p'],'gentebra':ab['weekday_level_dev_gentebra_p'],'gentebra_buy':ab['weekday_level_dev_gentebra_buy_p']}
# event-time average abnormal path (index), day k relative to start, base = s-8
def path(evname,K0=-10,K1=16):
    iv=[x for x in json.load(open('events_intervals.json')) if x['event']==evname]
    R=I['R']; rows=[]
    for x in iv:
        s=pd.Timestamp(x['start'])
        if s-pd.Timedelta(days=67)<f or s+pd.Timedelta(days=K1)>l: continue
        mu=R.loc[s-pd.Timedelta(days=67):s-pd.Timedelta(days=8)].dropna().median()
        base=li.get(s+pd.Timedelta(days=K0))
        if base is None or pd.isna(base): continue
        rows.append([ (li.get(s+pd.Timedelta(days=k))-base-(k-K0)*mu)*100 for k in range(K0,K1+1)])
    A=np.array(rows,dtype=float)
    return dict(k=list(range(K0,K1+1)),mean=[round(v,2) for v in np.nanmean(A,axis=0)],n=len(rows))
out['path_xp']=path('XP/Skill Event'); out['path_rr']=path('Rapid Respawn')
# activity path for XP: median over core worlds of log(v/median of days -36..-8), averaged over occurrences
LV=np.log(V[core].where(V[core]>0))
def act_path(evname,K0=-10,K1=16):
    iv=[x for x in json.load(open('events_intervals.json')) if x['event']==evname]; rows=[]
    for x in iv:
        s=pd.Timestamp(x['start'])
        if s-pd.Timedelta(days=40)<f or s+pd.Timedelta(days=K1)>l: continue
        base=LV.loc[s-pd.Timedelta(days=36):s-pd.Timedelta(days=8)].median()
        r=[]
        for k in range(K0,K1+1):
            t=s+pd.Timedelta(days=k)
            d=(LV.loc[t]-base).dropna() if t in LV.index else pd.Series(dtype=float)
            r.append(d.median() if len(d)>=4 else np.nan)
        rows.append(r)
    A=np.array(rows,dtype=float)
    return dict(k=list(range(K0,K1+1)),pct=[None if np.isnan(v) else round((np.exp(v)-1)*100,1) for v in np.nanmean(A,axis=0)],n=len(rows))
out['act_xp']=act_path('XP/Skill Event'); out['act_rr']=act_path('Rapid Respawn')
# event table (rows with n>=3 plus updates)
keep=['XP/Skill Event','Skill Event (junho)','Rapid Respawn','Exaltation Overload','Full Moon','Last Creep Standing',
      'Evento do mês (Carnival/Prank/Flower/Hot Cuisine/Double Daily Reward/Chyllfroest)','Orcsoberfest','Colours of Magic','Annual Autumn Vintage','Summer Update','Winter Update']
et=[]
for g in keep:
    r=T[T.group==g].iloc[0]
    def v(c): 
        x=r.get(c); return None if pd.isna(x) else float(x)
    et.append(dict(group=g,n=int(r['n']),pre=v('pre_mean'),pre_p=v('pre_p'),pre_q=v('pre_q'),pre_pos=v('pre_share_pos'),
                   during=v('during_mean'),during_p=v('during_p'),during_q=v('during_q'),post7=v('post7_mean'),post7_p=v('post7_p'),post7_q=v('post7_q'),
                   post30=v('post30_mean'),post30_p=v('post30_p'),activity=None if pd.isna(r['activity_mean']) else round((np.exp(r['activity_mean']/100)-1)*100,1),activity_p=v('activity_p')))
out['event_table']=et
out['n_price_tests']=42; out['min_q']=float(T[[c for c in T.columns if c.endswith('_q')]].min().min())
# rallies
out['after_rise']=ab['after_strong_rise']; out['after_drop']=ab['after_strong_drop']; out['weekly_autocorr']=ab['weekly_autocorr']
# cross-world
out['corr']=ab['corr_world_vs_index']; out['xcorr_weekly_BR_EU']=ab['xcorr_weekly_BR_vs_EU']
out['region_premium']=ab['region_premium_pct']; out['gentebra_premium']=ab['gentebra_premium_pct']; out['gentebra_premium_q']=ab['gentebra_premium_by_quarter_pct']
out['premium_persistence']=ab['premium_persistence_q2q']
prem_all=pd.read_csv('world_premium_all.csv',index_col=0)['log_premium']
new=(np.exp(prem_all)-1)*100
out['new_worlds_premium']={w:round(v,1) for w,v in new.sort_values().head(12).items()}
out['n_worlds_total']=int(P.notna().any().sum()); out['n_core']=len(core)
out['index_range']=[str(f.date()),str(l.date())]
# current context: gentebra daily since 2026-05-01 (sell & buy side), plus book points from screenshots
g=P['gentebra']['2026-05-01':].dropna(); gb=PB['gentebra']['2026-05-01':].dropna()
out['gentebra_daily_sell']=[[str(k.date()),round(v)] for k,v in g.items()]
out['gentebra_daily_buy']=[[str(k.date()),round(v)] for k,v in gb.items()]
out['book_points']=[['2026-09-21',44727,45781],['2026-09-22',44761,45499],['2026-09-23',44950,46993],['2026-09-24',44938,46991]]
out['details_30d']={'as_of':'2026-09-24','sell_avg':45283,'buy_avg':43744,'sell_tx':6386,'buy_tx':3651,'sell_high':47000,'sell_low':44000,'buy_high':46001,'buy_low':1}
gs=P['gentebra'].dropna(); out['gentebra_ath']=[str(gs.idxmax().date()),int(gs.max())]; out['gentebra_min']=[str(gs.idxmin().date()),int(gs.min())]
out['gentebra_pct_rank_mid']=round((gs<45964.5).mean()*100,1)
out['index_last']=[str(l.date()),round(I['I'][l])]; out['index_max']=[str(I['I'].idxmax().date()),round(I['I'].max())]
out['yoy']=ab['yoy_index_pct']
# troughs & peaks of index (from swings)
gm=P['gentebra'].resample('MS').median(); gbm=PB['gentebra'].resample('MS').median()
out['gentebra_monthly']={str(k.date())[:7]:[round(gm[k]),round(gbm[k]) if pd.notna(gbm.get(k)) else None] for k in gm.dropna().index}
# index troughs by year (min of 7d median) and peaks
ism=I['I'].rolling(7,center=True,min_periods=4).median()
tr={}
for y in (2024,2025,2026):
    s=ism[f'{y}-05-01':f'{y}-07-31']; tr[y]=[str(s.idxmin().date()),round(s.min())]
pk={}
for y in (2024,2025):
    s=ism[f'{y}-10-01':f'{y}-12-31']; pk[y]=[str(s.idxmax().date()),round(s.max())]
out['index_troughs']=tr; out['index_peaks']=pk
rt=json.load(open('roundtrip.json')); out['roundtrip']=[dict(sell=x['sell'],index_accept=x['index_accept'],index_maker=x['index_maker'],gentebra_accept=x['gentebra_accept'],gentebra_maker=x['gentebra_maker']) for x in rt['by_sell_month']]
out['roundtrip_table']=rt['table']; out['spreads']={'index':rt['spread_index_monthly_median_pct'],'gentebra':rt['spread_gentebra_monthly_median_pct']}; out['fail_case']={'accept':rt['fail_case_accept_pct'],'maker':rt['fail_case_maker_pct']}
json.dump(out,open('report_data.json','w'),ensure_ascii=False,default=str)
print(json.dumps({k:out[k] for k in ('path_xp','act_xp','path_rr','act_rr','updates','roundtrip','index_troughs','index_peaks','gentebra_ath','gentebra_min','index_last','index_max','min_q','new_worlds_premium')},ensure_ascii=False,default=str)[:6000])
print(len(out['weekly_index']),len(out['weekly_gentebra']),len(out['weekly_antica_2023']))
