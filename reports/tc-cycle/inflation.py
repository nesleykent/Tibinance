"""Monthly offer-price inflation; shared daily source policy and observed cutoff.
Run directly to reproduce inflation.json and the two downloadable CSVs.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
import pandas as pd
from universe import worlds, BENCHMARK

ROOT = Path(__file__).resolve().parent
from research_data import research_cutoff, load_daily
ASOF = research_cutoff()
SIDES = {'ask': 'sell_offer', 'bid': 'buy_offer'}


def clean(value):
    if isinstance(value, dict): return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [clean(v) for v in value]
    if isinstance(value, np.generic): return clean(value.item())
    if isinstance(value, float) and not math.isfinite(value): return None
    return value


def change(a, b):
    return 100 * (a / b - 1) if pd.notna(a) and pd.notna(b) and b > 0 else None


def daily(world):
    return load_daily(world, ASOF)


def monthly(d, world):
    rows = []
    # Keep calendar gaps and pre-history explicit; never shift over missing months.
    for date in pd.date_range('2023-01-01', ASOF, freq='MS'):
        end = date + pd.offsets.MonthEnd(0)
        obs = d.loc[date:min(end, ASOF)]
        n = len(obs)
        eligible = end <= ASOF and n >= 15 and n / date.days_in_month >= .6
        for side in SIDES:
            rows.append(dict(world=world, side=side, date=str(date.date()), days=n,
                             calendarDays=date.days_in_month, coveragePct=100*n/date.days_in_month,
                             first=str(obs.index.min().date()) if n else None,
                             last=str(obs.index.max().date()) if n else None,
                             price=float(obs[side].median()) if n else None, eligible=eligible,
                             status='Eligible' if eligible else 'Partial month' if end > ASOF else 'Insufficient coverage'))
    lookup = {(r['side'], r['date']): r for r in rows}
    for r in rows:
        t = pd.Timestamp(r['date'])
        for key, months in [('momPct', 1), ('yoyPct', 12)]:
            prev = lookup.get((r['side'], str((t-pd.DateOffset(months=months)).date())))
            r.setdefault('observed', {})[key] = change(r['price'], prev['price']) if t + pd.offsets.MonthEnd(0) <= ASOF and prev else None
            r[key] = change(r['price'], prev['price']) if r['eligible'] and prev and prev['eligible'] else None
        prev = lookup.get((r['side'], str((t-pd.DateOffset(months=1)).date())))
        r['accelerationPp'] = r['yoyPct']-prev['yoyPct'] if r['yoyPct'] is not None and prev and prev['yoyPct'] is not None else None
        r['observed']['accelerationPp'] = r['observed']['yoyPct'] - prev['observed']['yoyPct'] if r['observed']['yoyPct'] is not None and prev and prev['observed']['yoyPct'] is not None else None
    return rows


def annual(rows, observed=False):
    result = []
    last_full_month = (ASOF.replace(day=1)-pd.Timedelta(days=1)).month
    for side in SIDES:
        lookup = {pd.Timestamp(r['date']).to_period('M'): r for r in rows if r['side'] == side}
        def price(year, month):
            r = lookup.get(pd.Period(year=year, month=month, freq='M'))
            return r['price'] if r and (observed or r['eligible']) else None
        for year in range(2023, ASOF.year+1):
            m = last_full_month if year == ASOF.year else 12
            current = [price(year, i) for i in range(1, m+1)]
            prior = [price(year-1, i) for i in range(1, m+1)]
            mean = float(np.mean(current)) if all(v is not None for v in current) else None
            prev_mean = float(np.mean(prior)) if all(v is not None for v in prior) else None
            result.append(dict(world=rows[0]['world'], side=side, year=year,
                               period=f'Jan–{m:02d}', months=sum(v is not None for v in current),
                               referenceMonths=m, meanPrice=mean, meanYoYPct=change(mean, prev_mean),
                               endPrice=price(year,m), endMonth=m, decemberPrice=price(year-1,12),
                               endVsDecemberPct=change(price(year,m),price(year-1,12)),
                               janToEndPct=change(price(year,m),price(year,1))))
    if not observed:
        for row, sample in zip(result, annual(rows, observed=True)):
            row['observed'] = {k: sample[k] for k in ['months', 'meanPrice', 'meanYoYPct', 'endPrice', 'decemberPrice', 'endVsDecemberPct', 'janToEndPct']}
    return result


def design(dates):
    idx = pd.DatetimeIndex(dates)
    t = ((idx.year-2023)*12+idx.month-1).to_numpy()/12
    # January baseline; intercept shifted below so 12 seasonal effects average zero.
    return np.column_stack([np.ones(len(idx)), t, *[(idx.month == m).astype(float) for m in range(2,13)]])


def decompose(rows, side, since):
    valid = [r for r in rows if r['side']==side and r['eligible'] and r['date'] >= since]
    if len(valid) < 24 or min(sum(r['date'][5:7] == f'{m:02}' for r in valid) for m in range(1,13)) < 2:
        return None
    dates = [r['date'] for r in valid]
    x = design(dates)
    b = np.linalg.lstsq(x, np.log([r['price'] for r in valid]), rcond=None)[0]
    effects = np.r_[0., b[2:]]
    center = effects.mean()
    points = []
    for r, row in zip(valid, x):
        trend = b[0]+center+b[1]*row[1]
        seasonal = effects[int(r['date'][5:7])-1]-center
        residual = math.log(r['price'])-trend-seasonal
        points.append(dict(date=r['date'], price=r['price'], trendPrice=math.exp(trend),
                           adjustedPrice=r['price']/math.exp(seasonal),
                           trendLog=trend, seasonalLog=seasonal, residualLog=residual))
    last = points[-1]
    starts = [f'{ASOF.year-1}-12-01', f'{ASOF.year}-06-01', f'{ASOF.year-1}-{last["date"][5:7]}-01']
    attribution = []
    for start in starts:
        first = next((r for r in points if r['date']==start), None)
        if not first or start >= last['date']: continue
        total = math.log(last['price']/first['price'])
        parts = {k: last[k+'Log']-first[k+'Log'] for k in ['trend','seasonal','residual']}
        attribution.append(dict(start=start, end=last['date'], changePct=change(last['price'],first['price']),
                                totalLogPoints=100*total,
                                **{k+'LogPoints':100*v for k,v in parts.items()},
                                trendSharePct=100*parts['trend']/total if abs(total) > .001 else None))
    return dict(side=side, since=since, n=len(points), annualTrendPct=100*np.expm1(b[1]),
                points=points, attribution=attribution,
                seasonal=[dict(month=i+1, effectPct=100*np.expm1(v-center)) for i,v in enumerate(effects)])


def build():
    universe = worlds()
    monthly_rows = [r for w in universe for r in monthly(daily(w),w)]
    yearly = [r for w in universe for r in annual([x for x in monthly_rows if x['world']==w])]
    antica = [r for r in monthly_rows if r['world']==BENCHMARK]
    models = [m for side in SIDES for since in ['2023-01-01','2024-01-01'] if (m:=decompose(antica,side,since))]
    end = max(r['date'] for r in antica if r['eligible'])
    comparison = []
    for w in universe:
        for side in SIDES:
            r = next(r for r in monthly_rows if (r['world'],r['side'],r['date'])==(w,side,end))
            ref = next(r for r in antica if r['side']==side and r['date']==end)
            comparison.append({**r, 'differenceVsAnticaPp':r['yoyPct']-ref['yoyPct'] if r['yoyPct'] is not None and ref['yoyPct'] is not None else None})
    files = ['market-update.json', *[f'inputs/api/{w.lower()}.json' for w in universe]]
    return clean(dict(asOf=str(ASOF.date()), benchmark=BENCHMARK, comparisonMonth=end,
                      definition='Median of daily medians of best Piece Prices; one equal-weight observation per server day. Full calendar month, >=15 days and >=60% calendar coverage. Observed rates additionally retain sparse completed months, flagged separately from coverage-qualified estimates. API daily medians retain priority; same-date capture medians fill missing days only, using the supplied calendar date without timezone inference. No interpolation or predecessor splicing.',
                      sources=[dict(file=f,sha256=hashlib.sha256((ROOT/f).read_bytes()).hexdigest()) for f in files if (ROOT/f).exists()],
                      unavailable=[w for w in universe if daily(w).empty],
                      monthly=monthly_rows, annual=yearly, models=models, comparison=comparison))


if __name__ == '__main__':
    result = build()
    (ROOT/'inflation.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    for key in ['monthly','annual']:
        pd.json_normalize(result[key]).to_csv(ROOT/f'inflation-{key}.csv',index=False,float_format='%.8f')
    print(f'Inflation: {len(result["monthly"])} monthly rows; last eligible Antica month {result["comparisonMonth"]}.')
