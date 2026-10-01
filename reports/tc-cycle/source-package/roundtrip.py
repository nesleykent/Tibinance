"""Generic seasonal round-trip returns in TC terms (no personal holdings).
Accept path: sell at buy-side average price (Buy Offers filled), rebuy at sell-side average (Sell Offers filled): mult = bid(t1)/ask(t2)
Maker path:  sell via Sell Offer at sell-side average minus 2% fee, rebuy via Buy Offer at buy-side average plus 2% fee."""
import json, numpy as np, pandas as pd
P=pd.read_pickle('P.pkl'); PB=pd.read_pickle('PB.pkl'); core=json.load(open('core_worlds.json'))
def polish(Pm,minw=4,iters=20):
    L=np.log(Pm); n=L.notna().sum(axis=1); L=L[n>=minw]; a=L.median(axis=0); b=pd.Series(0.0,index=L.index)
    for _ in range(iters):
        b=(L.sub(a,axis=1)).median(axis=1); a=(L.sub(b,axis=0)).median(axis=0)
    s=a.median(); return b+s
ask_i=np.exp(polish(P[core])); bid_i=np.exp(polish(PB[core]))
am=ask_i.resample('MS').median(); bm=bid_i.resample('MS').median()
spread_i=((am-bm)/((am+bm)/2)*100)
g_a=P['gentebra'].resample('MS').median(); g_b=PB['gentebra'].resample('MS').median()
spread_g=((g_a-g_b)/((g_a+g_b)/2)*100)
out={'spread_index_monthly_median_pct':round(float(spread_i.dropna().median()),2),'spread_gentebra_monthly_median_pct':round(float(spread_g.dropna().median()),2)}
def rt(a,b,t1,t2):
    t1=pd.Timestamp(t1); t2=pd.Timestamp(t2)
    if any(pd.isna(x) for x in (a.get(t1),b.get(t1),a.get(t2),b.get(t2))): return None
    acc=b[t1]/a[t2]-1; mk=0.98*a[t1]/(1.02*b[t2])-1
    return round(acc*100,1),round(mk*100,1)
rows=[]
for cyc,(y1,y2) in {'2024–25':(2024,2025),'2025–26':(2025,2026)}.items():
    for sm in (9,10,11,12):
        for bmth in (5,6,7):
            t1=f'{y1}-{sm:02d}-01'; t2=f'{y2}-{bmth:02d}-01'
            ri=rt(am,bm,t1,t2); rg=rt(g_a,g_b,t1,t2)
            rows.append(dict(cycle=cyc,sell=t1[:7],rebuy=t2[:7],index_accept=ri[0] if ri else None,index_maker=ri[1] if ri else None,gentebra_accept=rg[0] if rg else None,gentebra_maker=rg[1] if rg else None))
df=pd.DataFrame(rows)
print(df.to_string(index=False))
# summary: by sell month, average over cycles and rebuy months (index)
summ=df.groupby(df['sell'].str[5:]).agg(index_accept=('index_accept','mean'),index_maker=('index_maker','mean'),gentebra_accept=('gentebra_accept','mean'),gentebra_maker=('gentebra_maker','mean')).round(1)
print(summ)
out['table']=rows; out['by_sell_month']=summ.reset_index().to_dict('records')
# failure case: price +10% by rebuy, Accept path with current Gentebra book spread 4.47%
out['fail_case_accept_pct']=round((44938/(46991*1.10)-1)*100,1)
out['fail_case_maker_pct']=round((0.98*46991/(1.02*44938*1.10)-1)*100,1)
print(out['spread_index_monthly_median_pct'],out['spread_gentebra_monthly_median_pct'],out['fail_case_accept_pct'],out['fail_case_maker_pct'])
# cost context: minimum lot value at current ask; XP dip and weekday effect vs costs
out['lot_value_at_ask']=25*46991
json.dump(out,open('roundtrip.json','w'),indent=1)
