"""Shared offer-only research data with explicit source/date boundaries.

API timestamps are converted to server days (10:00 Europe/Berlin). Captures retain
supplied calendar dates because their timezone is unknown. A daily API median has
priority; a capture median only fills an otherwise missing day. Anchors instead use
the latest valid capture on the newest available day (or API daily median when newer).
No predecessor is spliced into a successor. Weekly labels after cutoff are excluded.
"""
from pathlib import Path
from functools import lru_cache
import json
import math
from statistics import median
import pandas as pd
from universe import api_worlds

ROOT = Path(__file__).resolve().parent
# A book whose best Buy Offer is below this share of its best Sell Offer is treated as a data error and dropped.
# robustness.py reruns the whole pipeline with 0.70, 0.75, 0.85 and no floor (None) against this baseline.
MIN_BID_ASK = .8


def valid_book(ask, bid):
    return all(isinstance(v,(int,float)) and math.isfinite(v) for v in (ask,bid)) and 0 < bid < ask and (MIN_BID_ASK is None or bid / ask >= MIN_BID_ASK)


def server_day(row):
    t=pd.Timestamp(row['time'],unit='s',tz='UTC').tz_convert('Europe/Berlin')
    return t.tz_localize(None).normalize()-pd.Timedelta(days=int(t.hour<10))


def capture_day(row):
    return pd.Timestamp(row['capturedAt'][:10])


@lru_cache(maxsize=None)
def api_rows(world):
    source=ROOT/f'inputs/api/{world.lower()}.json'
    return json.loads(source.read_text()) if source.exists() else []


def cutoff_from(rows, captures, today=None):
    today=pd.Timestamp(today or pd.Timestamp.now(tz='America/Sao_Paulo').date()).normalize()
    dates=[server_day(r) for r in rows if valid_book(r.get('sell_offer'),r.get('buy_offer'))]
    dates += [capture_day(c) for c in captures if valid_book(c.get('sell'),c.get('buy'))]
    dates=[d for d in dates if d<=today]
    if not dates: raise ValueError('No valid offer date on or before today')
    return max(dates)


@lru_cache(maxsize=1)
def research_cutoff():
    return cutoff_from([r for w in api_worlds() for r in api_rows(w)],json.loads((ROOT/'market-update.json').read_text()))


def load_captures(cutoff=None):
    cutoff=research_cutoff() if cutoff is None else pd.Timestamp(cutoff)
    rows=json.loads((ROOT/'market-update.json').read_text())
    assert len({r['hash'] for r in rows})==len(rows),'Duplicate capture hash'
    return sorted([r for r in rows if capture_day(r)<=cutoff and valid_book(r.get('sell'),r.get('buy'))],key=lambda r:r['capturedAt'])


def build_daily(rows,captures,cutoff):
    cutoff=pd.Timestamp(cutoff)
    q=dict(records=len(rows),valid=0,missingBook=0,crossed=0,wideSpread=0,afterCutoff=0,captureDaysAdded=0)
    valid=[]
    for r in rows:
        date=server_day(r)
        if date>cutoff:q['afterCutoff']+=1;continue
        ask,bid=r.get('sell_offer',-1),r.get('buy_offer',-1)
        if not all(isinstance(v,(int,float)) and math.isfinite(v) and v>0 for v in (ask,bid)):q['missingBook']+=1;continue
        if bid>=ask:q['crossed']+=1;continue
        if MIN_BID_ASK is not None and bid/ask<MIN_BID_ASK:q['wideSpread']+=1;continue
        valid.append(dict(date=date,ask=ask,bid=bid));q['valid']+=1
    d=pd.DataFrame(valid).groupby('date')[['ask','bid']].median() if valid else pd.DataFrame(columns=['ask','bid'],index=pd.DatetimeIndex([],name='date'))
    cs=[dict(date=capture_day(c),ask=c['sell'],bid=c['buy']) for c in captures if capture_day(c)<=cutoff and valid_book(c.get('sell'),c.get('buy'))]
    if cs:
        fallback=pd.DataFrame(cs).groupby('date')[['ask','bid']].median()
        fallback=fallback.loc[~fallback.index.isin(d.index)]
        q['captureDaysAdded']=len(fallback)
        if len(fallback):d=pd.concat([d,fallback]).sort_index()
    return d.astype(float),q


def load_daily(world,cutoff=None):
    cutoff=research_cutoff() if cutoff is None else pd.Timestamp(cutoff)
    return build_daily(api_rows(world),[c for c in load_captures(cutoff) if c['world']==world],cutoff)[0]


def latest_quote(world,daily,captures,cutoff):
    captures=[c for c in captures if c['world']==world and capture_day(c)<=cutoff and valid_book(c.get('sell'),c.get('buy'))]
    capture=max(captures,key=lambda r:r['capturedAt']) if captures else None
    if capture is not None and (daily.empty or capture_day(capture)>=daily.index[-1]):
        return {**capture,'ask':capture['sell'],'bid':capture['buy'],'date':capture['capturedAt'][:10],'source':'Captura'}
    r=daily.iloc[-1]
    return dict(world=world,ask=float(r.ask),bid=float(r.bid),date=str(daily.index[-1].date()),source='Histórico de ofertas')


def window_quote(world,captures,hours,cutoff=None):
    """Median of each side over the world's valid captures in the `hours` up to and including its latest capture, on the
    captures' own clock (timezone unspecified, but one clock). An alternative anchor that a single quote cannot set alone;
    None for a world without captures. n counts the captures in the window: n == 1 means the latest quote stands alone."""
    cutoff=research_cutoff() if cutoff is None else pd.Timestamp(cutoff)
    cs=[c for c in captures if c['world']==world and capture_day(c)<=cutoff and valid_book(c.get('sell'),c.get('buy'))]
    if not cs:return None
    last=max(pd.Timestamp(c['capturedAt']) for c in cs)
    win=sorted([c for c in cs if last-pd.Timedelta(hours=hours)<=pd.Timestamp(c['capturedAt'])<=last],key=lambda c:c['capturedAt'])
    return {'ask':float(median([c['sell'] for c in win])),'bid':float(median([c['buy'] for c in win])),'n':len(win),
            'first':win[0]['capturedAt'],'last':win[-1]['capturedAt']}


def slippage_bound(best,top,volume,gold,q):
    """Upper bound on the average-price slippage, as a share of the best price, of an order for q TC that takes one side of
    a capture's book. The Amount at the best price fills first; the rest of the visible book, sorted away from the best
    price, averages (gold - top * best) / (volume - top), and its first units can average no worse than that. The capture
    gives the best price, its Amount, the visible Amount and its gold value, not every level, so this is a bound, not an
    estimate. None when the order exceeds the visible Amount or the book is incomplete."""
    if not all(isinstance(v,(int,float)) and math.isfinite(v) and v>0 for v in (best,top,volume,gold)) or q>volume:return None
    if q<=top:return 0.0
    rest=(gold-top*best)/(volume-top)
    return (q-top)/q*abs(rest/best-1)


def weekly_series(daily,cutoff=None,method='median'):
    cutoff=research_cutoff() if cutoff is None else pd.Timestamp(cutoff)
    return getattr(daily.resample('W-SUN'),method)().loc[:cutoff]
