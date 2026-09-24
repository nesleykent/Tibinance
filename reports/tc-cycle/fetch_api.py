"""Read-only public API fetch; twelve-second spacing, documented item ID and history route."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import time,json,datetime,hashlib
P=Path(__file__).resolve().parent/'inputs/api'
P.mkdir(parents=True,exist_ok=True)
manifest=[]
for w in 'Antica Belobra Celebra Collabra Descubra Gentebra Luminera Luzibra Ombra Ourobra Quelibra Rasteibra Terribra Tornabra Ustebra Venebra Obscubra'.split():
 url='https://api.tibiamarket.top/item_history?'+urlencode({'server':w,'item_id':22118,'start_days_ago':2000,'end_days_ago':-1})
 dest=P/(w.lower()+'.json')
 if dest.exists():rows=json.load(open(dest))
 else:
  time.sleep(12)
  try:
   with urlopen(url,timeout=40) as response:rows=json.load(response)
  except HTTPError as e:
   if e.code==429:
    time.sleep(max(float(e.headers.get('Retry-After',35)),35))
    with urlopen(url,timeout=40) as response:rows=json.load(response)
   else:
    manifest.append({'world':w,'url':url,'error':e.code});print(w,e.code,flush=True);continue
  dest.write_text(json.dumps(rows,ensure_ascii=False))
 manifest.append({'world':w,'url':url,'rows':len(rows),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'retrievedAt':datetime.datetime.fromtimestamp(dest.stat().st_mtime,datetime.timezone.utc).isoformat()});print(w,len(rows),flush=True)
 (P/'manifest.json').write_text(json.dumps(manifest,indent=2))
