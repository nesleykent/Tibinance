"""Build clean daily Tibia Coins series for every world from the tibiamarket JSON dumps.

Stats alignment: tibiamarket rows carry the scrape time. The day_* numbers are the market statistics
of the last *completed* server day. Server Save is 10:00 Europe/Berlin (08:00 UTC in summer, 09:00 UTC
in winter). stats_day = (server date at scrape time) - 1, where server date = date(t - SS hour).
"""
import json, glob, os, numpy as np, pandas as pd
from zoneinfo import ZoneInfo
BER=ZoneInfo('Europe/Berlin')
NUM=['day_average_sell','day_average_buy','day_sold','day_bought','day_highest_sell','day_lowest_sell','day_highest_buy','day_lowest_buy',
     'month_average_sell','month_average_buy','month_sold','month_bought','sell_offer','buy_offer','sell_offers','buy_offers','active_traders']
def server_date(ts_utc):
    # server day starts at 10:00 Berlin
    loc=ts_utc.dt.tz_convert(BER)
    return (loc - pd.Timedelta(hours=10)).dt.tz_localize(None).dt.normalize()
def load(path):
    d=json.load(open(path)); rows=[s for g in d.get('snapshots',[]) for s in (g if isinstance(g,list) else [g])]
    if not rows: return None
    df=pd.DataFrame(rows)
    for c in NUM:
        if c not in df: df[c]=np.nan
        df[c]=pd.to_numeric(df[c],errors='coerce'); df.loc[df[c]<=0,c]=np.nan
    df['ts']=pd.to_datetime(df['time'],unit='s',utc=True)
    df['sdate']=server_date(df['ts'])
    df['stats_day']=df['sdate']-pd.Timedelta(days=1)
    return df.sort_values('ts')
def daily(df, lag_shift=0):
    """one row per stats_day: day_* from the latest scrape of that server day; book from median of scrapes on that server date"""
    st=df.dropna(subset=['day_average_sell']).copy()
    st['stats_day']=st['stats_day']+pd.Timedelta(days=lag_shift)
    a=st.groupby('stats_day').last()[['day_average_sell','day_average_buy','day_sold','day_bought','day_highest_sell','day_lowest_sell','day_highest_buy','day_lowest_buy']]
    bk=df.dropna(subset=['sell_offer','buy_offer']).groupby('sdate')[['sell_offer','buy_offer']].median()
    bk.index.name='stats_day'
    mo=df.dropna(subset=['month_average_sell']).groupby('sdate')[['month_average_sell','month_average_buy','month_sold','month_bought']].last()
    mo.index.name='stats_day'
    out=a.join(bk,how='outer').join(mo,how='outer')
    out['book_mid']=(out['sell_offer']+out['buy_offer'])/2
    return out.sort_index()
def clean(s, win=9, thr=0.06):
    """NaN-out points deviating > thr (log) from centered rolling median"""
    ls=np.log(s)
    med=ls.rolling(win,center=True,min_periods=3).median()
    bad=(ls-med).abs()>thr
    return s.where(~bad), int(bad.sum())
if __name__=='__main__':
    W=json.load(open('worlds.json')); meta={w['name'].lower():w for w in W}
    allw={}; report=[]
    for f in sorted(glob.glob('tc/*.json')):
        name=os.path.basename(f)[:-5]; df=load(f)
        if df is None: continue
        dd=daily(df)
        dd['p_sell'],n1=clean(dd['day_average_sell'])
        dd['p_buy'],n2=clean(dd['day_average_buy'])
        dd['p_book'],n3=clean(dd['book_mid'])
        allw[name]=dd
        report.append((name,dd['p_sell'].notna().sum(),n1,n2,str(dd['p_sell'].first_valid_index())[:10] if dd['p_sell'].notna().any() else None))
    pd.to_pickle(allw,'daily_by_world.pkl')
    rep=pd.DataFrame(report,columns=['world','n_sell','sell_outliers','buy_outliers','first_sell']).sort_values('first_sell')
    rep.to_csv('coverage.csv',index=False)
    print(rep.head(15).to_string()); print('worlds:',len(allw)); print('outliers total sell/buy',rep.sell_outliers.sum(),rep.buy_outliers.sum())
