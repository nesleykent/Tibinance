"""Parse the tibiamarket /events dumps (ev*.txt) into a daily table and event intervals.
Repairs: strips '*' markers; fills gaps of <=5 days inside the same event (the API dump skipped some days)."""
import glob, re, json, datetime as dt, collections
days=collections.defaultdict(set)
for f in sorted(glob.glob('events/ev*.txt')):
    for line in open(f):
        m=re.match(r'(\d{4}-\d\d-\d\d): (.*)',line.strip())
        if not m: continue
        d=dt.date.fromisoformat(m.group(1))
        for e in m.group(2).split('|'):
            e=e.strip().lstrip('*').strip()
            if e and e!='-': days[d].add(e)
# per event, sorted day list -> intervals with gap fill
byev=collections.defaultdict(list)
for d,es in days.items():
    for e in es: byev[e].append(d)
MAXGAP={'Full Moon':1,'XP/Skill Event':2,'Rapid Respawn':1,'Skill Event':1,'Loot Event':1,'Exaltation Overload':1,"Valentine's Day":1,'The Great Expedition':1}  # monthly short events: only tiny gaps
intervals=[]
for e,ds in byev.items():
    ds=sorted(set(ds)); start=prev=ds[0]
    g=MAXGAP.get(e,5)
    for d in ds[1:]:
        if (d-prev).days<=g+1: prev=d; continue
        intervals.append((e,start,prev)); start=prev=d
    intervals.append((e,start,prev))
intervals.sort(key=lambda x:(x[1],x[0]))
# rebuild daily table from intervals (gap-filled)
daily=collections.defaultdict(set)
for e,s,t in intervals:
    d=s
    while d<=t: daily[d].add(e); d+=dt.timedelta(days=1)
json.dump([dict(event=e,start=str(s),end=str(t),days=(t-s).days+1) for e,s,t in intervals],open('events_intervals.json','w'),indent=1)
json.dump({str(d):sorted(v) for d,v in sorted(daily.items())},open('events_daily.json','w'),indent=0)
cnt=collections.Counter(e for e,s,t in intervals)
print(len(days),'days raw ->',len(daily),'days filled;',len(intervals),'intervals')
for e,c in cnt.most_common(): 
    L=[ (t-s).days+1 for ee,s,t in intervals if ee==e]
    print(f'{e:28s} n={c:3d} dur med={sorted(L)[len(L)//2]} range={min(L)}-{max(L)}')
print('first',min(daily),'last',max(daily))
