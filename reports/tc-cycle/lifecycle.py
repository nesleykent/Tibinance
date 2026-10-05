"""Exploratory world-lifecycle comparisons, with fixed rules and origin-time data.

No donor levels are spliced into successor observations. Backtests compare all
candidates on exactly the same origins within each side/horizon/regime. Overlap
means row counts are not independent sample sizes; no calibrated probabilities.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
import pandas as pd

ROOT=Path(__file__).resolve().parent
from events_bridge import canonical_events, CANONICAL_EVENTS
FACTS=canonical_events()
BIRTH={w:pd.Timestamp(day) for w,day in FACTS['lifecycle']['births'].items()}
MERGE=pd.Timestamp(next(e['start'] for e in FACTS['events'] if e.get('merge',{}).get('status')=='completed' and e['merge']['into']=='Terribra'))
TRANSFER=pd.Timestamp(FACTS['lifecycle']['transfers']['Luzibra'])
from universe import MERGERS
NEXT_MERGE=pd.Timestamp(MERGERS['Luzibra'])
PREDECESSORS=tuple(FACTS['lifecycle']['predecessors']['Terribra'])
SIDES=('ask','bid')
TERRIBRA_HORIZONS=(4,8,13,26)
AGE_HORIZONS=(1,2,4,8,13,26,39,52)

def point(series, date, tolerance=3):
    """Last actually observed point, never later than requested date."""
    date=pd.Timestamp(date)
    s=series.dropna().loc[:date]
    if s.empty or (date-s.index[-1]).days>tolerance:return None
    return s.index[-1],float(s.iloc[-1])

def horizon_returns(log_series, origin, horizon):
    """Observed h-week changes; endpoints past-only, no interpolation."""
    s=log_series.dropna().loc[:origin]
    if s.empty:return []
    s=s.loc[pd.Timestamp(origin)-pd.Timedelta(weeks=104):]
    values=[]
    for end in pd.date_range(s.index[0],s.index[-1],freq='W-SUN'):
        a=point(s,end-pd.Timedelta(weeks=horizon));b=point(s,end)
        if a and b:values.append(b[1]-a[1])
    return values

def precursor_prior(series, origin, horizon, merge=MERGE):
    """Equal weight per donor, applied to changes, never cross-world levels."""
    means=[];counts={}
    end=min(pd.Timestamp(origin),pd.Timestamp(merge)-pd.Timedelta(days=1))
    for world,s in series.items():
        returns=horizon_returns(s,end,horizon)
        counts[world]=len(returns)
        if len(returns)>=3:means.append(float(np.median(returns)))
    return (float(np.mean(means)) if means else None),counts

def donor_change(log_series, birth, age_days, horizon, known_by, stop_before):
    """Compare donor at target age and future age, requiring known donor data."""
    start=pd.Timestamp(birth)+pd.Timedelta(days=int(age_days))
    end=start+pd.Timedelta(weeks=horizon)
    # Require desired age itself to be inside the regime/known period, not just
    # a stale earlier observation that would cross the structural boundary.
    if end>pd.Timestamp(known_by) or end>=pd.Timestamp(stop_before):return None
    s=log_series.loc[:min(pd.Timestamp(known_by),pd.Timestamp(stop_before)-pd.Timedelta(days=1))]
    a=point(s,start,tolerance=7);b=point(s,end,tolerance=7)
    if not a or not b or a[0]==b[0]:return None
    return {'change':b[1]-a[1],'donorStart':str(a[0].date()),'donorEnd':str(b[0].date()),
            'startAgeDays':int((a[0]-birth).days),'endAgeDays':int((b[0]-birth).days)}

def summarize(rows):
    if not rows:return []
    frame=pd.DataFrame(rows);groups=['side','horizon']+(['regime'] if 'regime' in frame else [])
    out=[]
    for key,g in frame.groupby(groups,sort=True):
        origins=[set(m.origin) for _,m in g.groupby('model')]
        if any(s!=origins[0] for s in origins[1:]):raise ValueError('Candidates must have matched origins')
        scores={model:float(m.ape.mean()) for model,m in g.groupby('model')}
        for model,m in g.groupby('model',sort=False):
            constant=scores.get('Constant');benchmark=scores.get('Benchmark')
            row={k:(v.item() if isinstance(v,np.generic) else v) for k,v in zip(groups,key)};row.update(model=model,n=len(m),mape=float(m.ape.mean()),mae=float(m.ae.mean()),
                gainVsConstantPct=(100*(1-scores[model]/constant) if constant else None),
                gainVsBenchmarkPct=(100*(1-scores[model]/benchmark) if benchmark else None),
                gainVsLocalPct=(100*(1-scores[model]/scores['Local']) if scores.get('Local') else None))
            out.append(row)
    return out

def observed_rows(prices,premium,benchmark,world,origin,horizon):
    start=point(prices[world],origin);end=point(prices[world],origin+pd.Timedelta(weeks=horizon))
    current_premium=point(premium[world],origin)
    br=horizon_returns(benchmark,origin,horizon)
    if not start or not end or not current_premium or len(br)<10:return None
    return start,end,float(np.median(br))

def rows_for_predictions(predictions,actual,**meta):
    return [{**meta,'model':m,'actual':actual,'predicted':float(p),'ape':abs(float(p)/actual-1)*100,'ae':abs(float(p)-actual)} for m,p in predictions.items()]

def age_predictions(anchor, benchmark_change, relative, raw):
    """Each candidate has its own data requirements; donors never gate controls."""
    changes={'Constant':0.,'Benchmark':benchmark_change,
        'AgeRelative':benchmark_change+relative['change'] if benchmark_change is not None and relative is not None else None,
        'AgeRaw':raw['change'] if raw is not None else None}
    return {model:float(anchor*np.exp(change)) if anchor is not None and change is not None else None for model,change in changes.items()}


def mark_crossed(scenarios):
    """Flag incompatible independent-side scenario pairs without repairing them."""
    pairs={}
    for row in scenarios:
        if row.get('value') is not None:
            key=(row.get('regime'),row['horizon'],row['model'])
            pairs.setdefault(key,{})[row['side']]=row
    for pair in pairs.values():
        crossed=bool('ask' in pair and 'bid' in pair and pair['bid']['value']>=pair['ask']['value'])
        for row in pair.values():row['crossedBook']=crossed


def build():
    from research_data import load_daily,research_cutoff
    cutoff=research_cutoff();names=('Antica','Terribra',*PREDECESSORS,'Luzibra','Floribra')
    daily={w:load_daily(w,cutoff) for w in names}
    coverage=[]
    for w,d in daily.items():
        coverage.append({'world':w,'first':str(d.index[0].date()) if len(d) else None,'last':str(d.index[-1].date()) if len(d) else None,'days':len(d),
            'birth':str(BIRTH[w].date()) if w in BIRTH else None,'firstAgeDays':int((d.index[0]-BIRTH[w]).days) if len(d) and w in BIRTH else None,
            'lastAgeDays':int((d.index[-1]-BIRTH[w]).days) if len(d) and w in BIRTH else None})
    terr_tests=[];age_tests=[];terr_scenarios=[];age_scenarios=[];curves=[]
    for side in SIDES:
        prices={w:d[side] for w,d in daily.items()}
        benchmark=np.log(prices['Antica'])
        premium={w:(np.log(s)-benchmark).dropna() for w,s in prices.items() if w!='Antica'}
        for w in ('Luzibra','Floribra'):
            # Every observed daily point; no normalized time interpolation.
            for date,value in prices[w].items():
                curves.append({'world':w,'date':str(date.date()),'ageDays':int((date-BIRTH[w]).days),'side':side,'price':float(value),
                    'premiumPct':float(np.expm1(premium[w].loc[date])*100) if date in premium[w].index else None,
                    'preTransfer':bool(w!='Luzibra' or date<TRANSFER)})
        origins=pd.date_range(MERGE,cutoff,freq='W-SUN')
        for origin in origins:
            for h in TERRIBRA_HORIZONS:
                target=origin+pd.Timedelta(weeks=h)
                if target>cutoff:continue
                observed=observed_rows(prices,premium,benchmark,'Terribra',origin,h)
                local=horizon_returns(premium['Terribra'].loc[MERGE:],origin,h)
                prior,counts=precursor_prior({w:premium[w] for w in PREDECESSORS},origin,h)
                if observed is None or len(local)<3 or prior is None:continue
                start,end,base=observed;local_median=float(np.median(local));anchor=start[1]
                predictions={'Constant':anchor,'Benchmark':anchor*np.exp(base),'Local':anchor*np.exp(base+local_median),
                    'Precursor':anchor*np.exp(base+.5*local_median+.5*prior)}
                terr_tests+=rows_for_predictions(predictions,end[1],side=side,horizon=h,origin=str(origin.date()),target=str(target.date()),
                    anchorDate=str(start[0].date()),actualDate=str(end[0].date()),localReturnSample=len(local),donorReturnSample=counts,activeDonors=[w for w,n in counts.items() if n>=3])
        # Scenarios keep exactly the same fixed rules used by the backtest.
        for h in TERRIBRA_HORIZONS:
            anchor=point(prices['Terribra'],cutoff);br=horizon_returns(benchmark,cutoff,h)
            local=horizon_returns(premium['Terribra'].loc[MERGE:],cutoff,h)
            prior,counts=precursor_prior({w:premium[w] for w in PREDECESSORS},cutoff,h)
            if not anchor or len(br)<10 or len(local)<3 or prior is None:
                terr_scenarios.append({'side':side,'horizon':h,'target':str((cutoff+pd.Timedelta(weeks=h)).date()),'status':'unsupported','localReturnSample':len(local),'donorReturnSample':counts,'activeDonors':[w for w,n in counts.items() if n>=3]});continue
            b=float(np.median(br));l=float(np.median(local))
            for model,change in {'Constant':0,'Benchmark':b,'Local':b+l,'Precursor':b+.5*l+.5*prior}.items():
                terr_scenarios.append({'side':side,'horizon':h,'target':str((cutoff+pd.Timedelta(weeks=h)).date()),'model':model,'value':float(anchor[1]*np.exp(change)),
                    'status':'exploratory','anchorDate':str(anchor[0].date()),'localReturnSample':len(local),'donorReturnSample':counts,'activeDonors':[w for w,n in counts.items() if n>=3]})
        for regime,stop in [('preTransfer',TRANSFER),('preMerger',NEXT_MERGE)]:
            for origin in pd.date_range(BIRTH['Floribra'],cutoff,freq='W-SUN'):
                for h in AGE_HORIZONS:
                    target=origin+pd.Timedelta(weeks=h)
                    if target>cutoff:continue
                    observed=observed_rows(prices,premium,benchmark,'Floribra',origin,h)
                    age=(origin-BIRTH['Floribra']).days
                    relative=donor_change(premium['Luzibra'],BIRTH['Luzibra'],age,h,origin,stop)
                    raw=donor_change(np.log(prices['Luzibra']),BIRTH['Luzibra'],age,h,origin,stop)
                    if observed is None or relative is None or raw is None:continue
                    start,end,base=observed;anchor=start[1]
                    predictions={'Constant':anchor,'Benchmark':anchor*np.exp(base),'AgeRelative':anchor*np.exp(base+relative['change']),'AgeRaw':anchor*np.exp(raw['change'])}
                    age_tests+=rows_for_predictions(predictions,end[1],side=side,horizon=h,regime=regime,origin=str(origin.date()),target=str(target.date()),
                        anchorDate=str(start[0].date()),actualDate=str(end[0].date()),ageDays=age,donorStart=relative['donorStart'],donorEnd=relative['donorEnd'])
            for h in AGE_HORIZONS:
                anchor=point(prices['Floribra'],cutoff);br=horizon_returns(benchmark,cutoff,h)
                age=(cutoff-BIRTH['Floribra']).days
                relative=donor_change(premium['Luzibra'],BIRTH['Luzibra'],age,h,cutoff,stop)
                raw=donor_change(np.log(prices['Luzibra']),BIRTH['Luzibra'],age,h,cutoff,stop)
                meta={'side':side,'horizon':h,'target':str((cutoff+pd.Timedelta(weeks=h)).date()),'regime':regime,'ageDays':age,'targetAgeDays':age+7*h}
                base=float(np.median(br)) if len(br)>=10 else None
                if anchor:meta['anchorDate']=str(anchor[0].date())
                predictions=age_predictions(anchor[1] if anchor else None,base,relative,raw)
                for model,value in predictions.items():
                    match=relative if model=='AgeRelative' else raw if model=='AgeRaw' else None
                    if value is None:
                        reason=('Sem endpoints de premium same-day com Antica na mesma idade e dentro do regime.' if model=='AgeRelative'
                            else 'Sem endpoints observados da mesma idade dentro do regime e conhecidos no corte.' if model=='AgeRaw'
                            else 'Sem anchor recente ou amostra histórica suficiente para o benchmark.')
                        age_scenarios.append({**meta,'model':model,'status':'unsupported','reason':reason});continue
                    row={**meta,'model':model,'status':'exploratory','value':value}
                    if match:
                        row.update(donorStart=match['donorStart'],donorEnd=match['donorEnd'],
                            donorStartAgeDays=match['startAgeDays'],donorEndAgeDays=match['endAgeDays'])
                    age_scenarios.append(row)
    mark_crossed(terr_scenarios);mark_crossed(age_scenarios)
    sources=[{'label':e['title'],'url':url} for e in FACTS['events']
             if any(w in ('Luzibra','Floribra','Terribra') for w in (e['worlds'] if e['worlds']!='all' else []))
             for url in e['references']]

    files=[ROOT/'market-update.json',CANONICAL_EVENTS,ROOT/'universe.py',ROOT/'research_data.py',Path(__file__),*[ROOT/'inputs/api'/f'{w.lower()}.json' for w in names]]
    payload={'asOf':str(cutoff.date()),'methodology':{
        'status':'Exploratory; fixed candidate rules, not a validated replacement for the main forecast.',
        'premium':'log(world same-side offer / Antica same-day same-side offer)',
        'benchmark':'Median observed h-week Antica log return over the preceding 104 weeks; at least 10 returns.',
        'training':'Origin-time only; endpoint lookup backwards <=3 days (donor age <=7 days), no interpolation. Weekly Sunday origins; scenarios at cutoff.',
        'evaluation':'MAPE and MAE on identical observed origins per side/horizon/regime. Weekly overlapping targets: n is not independent sample size. No tuning, selection-adjusted claim, calibrated interval or causal age effect.',
        'limits':['One successor and one donor pair; age, launch cohort, calendar, transfers and premium restrictions are confounded.',
            'Offer endpoints are indicative, not traded prices or fill guarantees. Bid/ask are modeled independently; scenarios are not an executable book.',
            'These exploratory models use a simple historical benchmark-return rule, distinct from the main report ensemble.',
            'Donor missing ages remain unsupported. Merger prices are not carried across world identities.']},
        'coverage':coverage,'sources':sources,'inputHashes':{str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else '../../data/events/events.json':hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.exists()},
        'terribra':{'world':'Terribra','predecessors':list(PREDECESSORS),'mergeDate':str(MERGE.date()),
            'methods':{'Constant':'Última oferta; retorno zero.','Benchmark':'Última oferta × exp(retorno Antica).','Local':'Benchmark × exp(mediana dos retornos do premium de Terribra).',
                'Precursor':'Benchmark × exp(0.5 × mediana local + 0.5 × média das medianas dos precursores elegíveis antes do merger). Jacabra/Obscubra fornecem apenas mudanças próprias, com mínimo de 3 retornos por donor; activeDonors identifica quem contribui em cada horizonte.'},
            'backtest':summarize(terr_tests),'backtestDetail':terr_tests,'scenarios':terr_scenarios,
            'conclusion':'Comparar Precursor com Local altera o prior e reduz à metade o termo local, sem isolar a contribuição incremental dos precursores; Constant e Benchmark são controles. O histórico de Terribra começa após o merger e permanece separado.'},
        'ageAnalogy':{'target':'Floribra','donor':'Luzibra','birthDates':{w:str(BIRTH[w].date()) for w in ('Floribra','Luzibra')},'transferOpened':str(TRANSFER.date()),'mergerNotBefore':str(NEXT_MERGE.date()),
            'methods':{'AgeRelative':'Benchmark × exp(mudança do log-premium de Luzibra entre a idade atual de Floribra e essa idade + horizonte).',
                'AgeRaw':'Última oferta de Floribra × razão de preços de Luzibra nas mesmas idades; sensibilidade sem ajuste por Antica.',
                'preTransfer':'Donor estritamente anterior a 30/06/2026; análise principal evita a abertura de transfers.',
                'preMerger':'Sensibilidade com todo donor disponível antes do merger e já conhecido na origem; pode incluir transfers abertos.'},
            'curves':curves,'backtest':summarize(age_tests),'backtestDetail':age_tests,'scenarios':age_scenarios,
            'currentAgeDays':int((cutoff-BIRTH['Floribra']).days),'firstDonorAgeDays':next(r['firstAgeDays'] for r in coverage if r['world']=='Luzibra'),
            'conclusion':'Luzibra na mesma idade é um cenário comparativo, não o futuro identificado de Floribra. Cenários raw com suporte são exibidos separadamente; premium exige Antica no mesmo dia. Backtest vazio significa ausência de targets elegíveis, nunca erro zero.'}}
    return payload

if __name__=='__main__':
    result=build()
    (ROOT/'lifecycle.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'asOf':result['asOf'],'coverage':result['coverage'],'terribraScores':len(result['terribra']['backtest']),'ageScores':len(result['ageAnalogy']['backtest'])},ensure_ascii=False))
