"""Read-only public fetches for every world in the universe (universe.py) that has no frozen copy yet.
API history: twelve-second spacing, documented item ID and history route, written to inputs/api/.
Archive copy (nesleykent/tibia-warzones-schedule), written to inputs/history/ for the reconciliation in validate.py.
Existing files are never refetched, so the frozen inputs of earlier worlds stay byte-identical."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import time,json,datetime,hashlib
from universe import api_worlds, predecessor_worlds
P=Path(__file__).resolve().parent/'inputs/api'
H=Path(__file__).resolve().parent/'inputs/history'
P.mkdir(parents=True,exist_ok=True);H.mkdir(parents=True,exist_ok=True)
ARCHIVE='https://raw.githubusercontent.com/nesleykent/tibia-warzones-schedule/main/data/market/world/{0}/{1}_tibia_coins.json'
def get(url):
 time.sleep(12)
 try:
  with urlopen(url,timeout=40) as response:return response.read()
 except HTTPError as e:
  if e.code!=429:raise
  time.sleep(max(float(e.headers.get('Retry-After',35)),35))
  with urlopen(url,timeout=40) as response:return response.read()
old=json.loads((P/'manifest.json').read_text()) if (P/'manifest.json').exists() else []
manifest={m['world']:m for m in old}
for w in api_worlds():
 url='https://api.tibiamarket.top/item_history?'+urlencode({'server':w,'item_id':22118,'start_days_ago':2000,'end_days_ago':-1})
 dest=P/(w.lower()+'.json')
 if not dest.exists():
  try:rows=json.loads(get(url))
  except HTTPError as e:
   manifest[w]={'world':w,'url':url,'error':e.code};print(w,e.code,flush=True);continue
  dest.write_text(json.dumps(rows,ensure_ascii=False))
 if w not in manifest or 'error' in manifest[w]:
  manifest[w]={'world':w,'url':url,'rows':len(json.load(open(dest))),'retrievedAt':datetime.datetime.fromtimestamp(dest.stat().st_mtime,datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
 print(w,manifest[w].get('rows'),flush=True)
 # The archive holds the successor worlds only; predecessors are checked against the API alone.
 arch=H/(w.lower()+'.json')
 if w not in predecessor_worlds() and not arch.exists():arch.write_bytes(get(ARCHIVE.format(w,w.lower())))
 (P/'manifest.json').write_text(json.dumps([manifest[k] for k in [m['world'] for m in old]+[x for x in manifest if x not in {m['world'] for m in old}]],indent=2))
