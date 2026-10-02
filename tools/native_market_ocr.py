"""Local market OCR: Tesseract first, Apple Vision for unresolved fields.

Only anonymous market columns leave this reader. Incomplete rows survive with
field-level issues; no checksum value or timestamp is reconstructed by guessing.
"""
import csv
import io
import json
import math
import re
import subprocess
from pathlib import Path
from statistics import median
from PIL import Image, ImageEnhance, ImageOps
from offer_tracking import normalize_ends_at
from market_item import read_selected_item

FIELDS = ('amount', 'price', 'total', 'endsAt')
DATE = re.compile(r'(?<!\d)\d{4}-\d{2}-\d{2}[T, ]\s*\d{2}:\d{2}:\d{2}(?!\d)')


def tesseract_words(path, psm=11, whitelist=None):
    cmd = ['tesseract', str(path), 'stdout', '--psm', str(psm)]
    if whitelist:
        cmd += ['-c', f'tessedit_char_whitelist={whitelist}']
    run = subprocess.run(cmd + ['tsv'], capture_output=True, text=True, timeout=90)
    if run.returncode:
        raise RuntimeError('Tesseract failed (diagnostic details suppressed)')
    out = []
    for r in csv.DictReader(io.StringIO(run.stdout), delimiter='\t', quoting=csv.QUOTE_NONE):
        if not r['text'].strip() or float(r['conf']) < 0:
            continue
        x, y, w, h = (int(r[k]) for k in ('left', 'top', 'width', 'height'))
        out.append(dict(t=r['text'].strip(), x=x, r=x+w, y=y, b=y+h,
                        h=h, cx=x+w/2, cy=y+h/2, conf=float(r['conf'])))
    return out


def vision_words(path, executable):
    if not executable:
        raise RuntimeError('Apple Vision fallback unavailable; provide --vision-binary')
    run = subprocess.run([str(executable), str(path)], capture_output=True, text=True, timeout=90)
    if run.returncode:
        raise RuntimeError('Apple Vision failed (diagnostic details suppressed)')
    return json.loads(run.stdout)


def lines(words):
    rows = []
    for w in sorted(words, key=lambda w: (w['cy'], w['x'])):
        found = next((r for r in reversed(rows[-3:]) if abs(median(p['cy'] for p in r)-w['cy']) <= max(median(p['h'] for p in r), w['h']) * .7), None)
        if found is None:
            rows.append([w])
        else:
            found.append(w)
    return [sorted(r, key=lambda w: w['x']) for r in rows]


def norm(text):
    return re.sub('[^a-z]', '', text.lower())


def geometry(words, height):
    sections = []
    for line in lines(words):
        for i, w in enumerate(line):
            if norm(w['t']) == 'offers' and i and norm(line[i-1]['t']) in ('sell', 'buy'):
                sections.append({'side': norm(line[i-1]['t']), 'y': w['y']})
    sections.sort(key=lambda r: r['y'])
    if {s['side'] for s in sections} != {'sell', 'buy'}:
        raise ValueError('Sell/Buy table labels could not both be recognized')
    sections = sections[:2]
    creates = [w['y'] for w in words if norm(w['t']) == 'create' and w['y'] > sections[-1]['y']]
    for index, table in enumerate(sections):
        stop = sections[index+1]['y'] if index+1 < len(sections) else min(creates, default=height)
        table['stop'] = stop
        for line in lines([w for w in words if table['y'] < w['y'] < stop]):
            amount = next((w for w in line if norm(w['t']) == 'amount' and ':' not in w['t']), None)
            piece = next((w for w in line if norm(w['t']) == 'piece'), None)
            total = next((w for w in line if norm(w['t']) == 'total'), None)
            prices = [w for w in line if norm(w['t']) == 'price']
            if amount and piece and total and len(prices) >= 2:
                table.update(amountR=amount['r'], pieceR=prices[0]['r'], totalR=prices[1]['r'],
                             x0=max(0, int(amount['x']-(amount['r']-amount['x'])*2.5)),
                             top=median(w['b'] for w in [amount,piece,total,*prices])+1,
                             glyph=amount['h'])
                table['nameX'] = next((w['x'] for w in line if norm(w['t'])=='name'), table['x0'])
                break
    donor = next((t for t in sections if 'top' in t), None)
    if not donor:
        raise ValueError('Amount/Piece Price/Total Price column headings could not be recognized')
    for table in sections:
        if 'top' not in table:
            table.update({k: donor[k] for k in ('amountR','pieceR','totalR','x0','glyph','nameX')})
            table['top'] = donor['top'] + table['y']-donor['y']
    return sections


def parse_table(words, table, engine):
    selected = [w for w in words if table['top'] <= w['cy'] < table['stop']-table['glyph']*.8 and w['x'] >= (table['nameX'] if engine=='apple-vision' else table['x0'])]
    edges = {'amount':table['amountR'], 'price':table['pieceR'], 'total':table['totalR']}
    rows = []
    for line in lines(selected):
        values, confidence, raw = {}, {}, {}
        for field, edge in edges.items():
            tokens = [w for w in line if table['x0'] <= w['x'] < table['totalR']+table['glyph']*.4
                      and re.fullmatch(r'[\d,.]+',w['t'])
                      and min(edges, key=lambda k: abs(edges[k]-w['r'])) == field
                      and abs(edge-w['r']) <= table['glyph']*1.5]
            text = ''.join(w['t'] for w in tokens)
            raw[field] = text
            values[field] = int(re.sub(r'[,\.]', '', text)) if text and re.sub(r'[,\.]', '', text).isdigit() else None
            confidence[field] = min((w['conf'] for w in tokens), default=0)
        dates = [w for w in line if table['totalR']+table['glyph']*.4 <= w['x'] <= table['totalR']+table['glyph']*24]
        text = ' '.join(w['t'] for w in dates)
        matched = DATE.findall(text)
        try:
            values['endsAt'] = normalize_ends_at(matched[0]) if len(matched)==1 else None
        except ValueError:
            values['endsAt'] = None
        confidence['endsAt'] = min((w['conf'] for w in dates if re.search(r'\d{2}[:-]\d{2}',w['t'])), default=0)
        raw['endsAt'] = text
        # A partial numeric row or a date establishes a reviewable row. Control
        # noise containing only one small digit must not become a fake offer.
        owner_anchor = engine=='apple-vision' and any(table['nameX'] <= w['x'] < table['x0'] for w in line)
        if not any(values[k] is not None for k in edges) and not values['endsAt'] and not owner_anchor:
            continue
        rows.append({**values, '_cy':median(w['cy'] for w in line), '_confidence':confidence,
                     '_raw':raw, '_source':{k:engine for k in FIELDS}})
    return rows


def numeric_valid(row):
    return all(type(row.get(k)) is int and row[k] > 0 for k in FIELDS[:3]) and row['amount']*row['price']==row['total']


def needs_fallback(row):
    return not numeric_valid(row) or not row['endsAt'] or row['_confidence']['endsAt'] < 70 or any(row['_confidence'][k]<35 for k in FIELDS[:3]) or row.get('_conflict') or row.get('_numericConflict')


def visual_row_centers(image, table):
    """Count text bands in the anonymous price column independently of OCR."""
    left=max(0,round(table['amountR']+2))
    right=min(image.width,round(table['pieceR']-2))
    pixels=image.load()
    bands=[]
    for y in range(max(0,round(table['top'])),min(image.height,round(table['stop']-table['glyph']*.8))):
        count=sum(sum(pixels[x,y])/3>110 for x in range(left,right))
        if right<=left or not max(3,(right-left)*.04)<=count<(right-left)*.7:
            continue
        if bands and y-bands[-1][-1]<=2:
            bands[-1].append(y)
        else:
            bands.append([y])
    return [median(band) for band in bands if len(band)>=max(2,table['glyph']*.35)]


def merge_rows(base, incoming, glyph, fallback=False):
    for candidate in incoming:
        nearby = [r for r in base if abs(r['_cy']-candidate['_cy']) <= glyph*.9]
        # Broad OCR can move a partial first row's box toward the header. A
        # unique agreement on two visible numeric fields can recover that row
        # without deduplicating simultaneous offers by their values alone.
        agreeing = [r for r in nearby if sum(r[k] is not None and r[k]==candidate[k]
                     for k in FIELDS[:3]) >= 2 and all(r[k] is None or candidate[k] is None
                     or r[k]==candidate[k] for k in FIELDS[:3])]
        prior = agreeing[0] if len(agreeing)==1 else min(
            (r for r in nearby if abs(r['_cy']-candidate['_cy']) <= glyph*.65),
            key=lambda r:abs(r['_cy']-candidate['_cy']), default=None)
        if prior is None:
            base.append(candidate)
            continue
        if not numeric_valid(prior) and numeric_valid(candidate):
            for k in FIELDS[:3]:
                prior[k] = candidate[k]
                prior['_confidence'][k] = candidate['_confidence'][k]
                prior['_raw'][k] = candidate['_raw'][k]
                prior['_source'][k] = candidate['_source'][k]
            prior['_cy'] = candidate['_cy']
        elif not numeric_valid(prior):
            for k in FIELDS[:3]:
                if prior[k] is None and candidate[k] is not None:
                    prior[k] = candidate[k]
                    prior['_confidence'][k] = candidate['_confidence'][k]
                    prior['_raw'][k] = candidate['_raw'][k]
                    prior['_source'][k] = candidate['_source'][k]
                elif prior[k] is not None and candidate[k] is not None and prior[k]!=candidate[k]:
                    prior['_numericConflict'] = True
        elif numeric_valid(prior) and numeric_valid(candidate):
            if any(prior[k]!=candidate[k] for k in FIELDS[:3]):
                prior['_numericConflict'] = True
            elif fallback:
                for k in FIELDS[:3]:
                    prior['_confidence'][k] = max(prior['_confidence'][k], candidate['_confidence'][k])
        if candidate['endsAt'] and prior['endsAt'] and candidate['endsAt'] != prior['endsAt']:
            prior['_conflict'] = True
            prior.setdefault('_alternatives',{})['endsAt'] = [prior['endsAt'],candidate['endsAt']]
        elif candidate['endsAt'] and (not prior['endsAt'] or prior['_confidence']['endsAt'] < candidate['_confidence']['endsAt']):
            prior['endsAt'] = candidate['endsAt']
            prior['_confidence']['endsAt'] = candidate['_confidence']['endsAt']
            prior['_raw']['endsAt'] = candidate['_raw']['endsAt']
            prior['_source']['endsAt'] = candidate['_source']['endsAt']
    return sorted(base, key=lambda r:r['_cy'])


def stripe_observation(words, field):
    """Read a single observed cell; do not construct values from a checksum."""
    if field == 'endsAt':
        text = ' '.join(w['t'] for w in sorted(words, key=lambda w:w['x']))
        matches = DATE.findall(text)
        # A second date fragment is evidence of a mixed row, even when only
        # one complete timestamp can be assembled from the broad reading.
        if len(matches)!=1 or len(re.findall(r'\d{4}-\d{2}-\d{2}',text))!=1:
            return None, 0, text
        try:
            value = normalize_ends_at(matches[0])
        except ValueError:
            return None, 0, text
        relevant = [w for w in words if re.search(r'\d{2}[:-]\d{2}',w['t'])]
        return value, min((w['conf'] for w in relevant), default=0), text
    numeric = [w for w in words if re.fullmatch(r'[\d,.]+', w['t'])]
    text = ' '.join(w['t'] for w in sorted(words, key=lambda w:w['x']))
    if any(re.search(r'\d',w['t']) and not re.fullmatch(r'[\d,.]+',w['t']) for w in words):
        return None, 0, text
    clean = re.sub(r'[,\.]', '', ''.join(w['t'] for w in sorted(numeric,key=lambda w:w['x'])))
    if not numeric or len(lines(numeric))!=1 or not clean.isdigit():
        return None, 0, text
    value = int(clean)
    return (value if value>0 else None), min(w['conf'] for w in numeric), text


def recover_stripes(image, table, rows, workdir, vision_binary, anchors=()):
    """Resolve table artifacts only through agreement on tightly cropped cells."""
    gaps = [b['_cy']-a['_cy'] for a,b in zip(rows,rows[1:])
            if table['glyph']*.8 <= b['_cy']-a['_cy'] <= table['glyph']*2]
    pitch = median(gaps) if gaps else table['glyph']*1.2
    span = max(table['pieceR']-table['amountR'], table['totalR']-table['pieceR'])
    date_words = [w for w in anchors if table['top']<=w['cy']<table['stop']
                  and table['totalR']<w['x']<table['totalR']+span*1.6
                  and re.search(r'\d{2}:\d{2}:\d{2}', w['t'])]
    date_right = max((w['r'] for w in date_words), default=table['totalR']+span*1.6)+table['glyph']*.5
    boundaries = {
        'amount': (max(table['x0'],table['amountR']-span)+1,table['amountR']-1),
        'price': (table['amountR']+1,table['pieceR']-1),
        'total': (table['pieceR']+1,table['totalR']-1),
        'endsAt': (table['totalR']+table['glyph']*.3,min(image.width,date_right)),
    }
    for index,row in enumerate(rows):
        numeric_needed = not numeric_valid(row) or row.get('_numericConflict') or any(
            row['_confidence'][k]<35 for k in FIELDS[:3])
        date_needed = not row['endsAt'] or row.get('_conflict') or row['_confidence']['endsAt']<70
        fields = list(FIELDS[:3]) if numeric_needed else []
        if date_needed:
            fields.append('endsAt')
        if not fields:
            continue
        top=max(0,math.floor(row['_cy']-pitch*.45))
        bottom=min(image.height,math.ceil(row['_cy']+pitch*.45))
        observations={}
        for field in fields:
            left,right=boundaries[field]
            bounds=(max(0,math.floor(left)),top,min(image.width,math.ceil(right)),bottom)
            if bounds[2]<=bounds[0] or bounds[3]<=bounds[1]:
                continue
            crop=image.crop(bounds)
            scale=max(2,min(6,42/max(1,table['glyph'])))
            crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
            path=Path(workdir)/f"stripe-{table['side']}-{index}-{field}.png"
            crop.save(path)
            reads={}
            for engine,reader in (('tesseract',lambda:tesseract_words(path,7,'0123456789,-: ')),
                                  ('apple-vision',lambda:vision_words(path,vision_binary))):
                try:
                    value,confidence,text=stripe_observation(reader(),field)
                    reads[engine]={'value':value,'confidence':confidence,'readText':text}
                except (ValueError,RuntimeError,subprocess.TimeoutExpired) as error:
                    reads[engine]={'value':None,'confidence':0,'error':str(error)}
            primary=reads['tesseract']
            threshold=70 if field=='endsAt' else 35
            if primary['value'] is None or primary['confidence']<threshold:
                # Tesseract recommends dark text on a light background. Retry
                # only failed/uncertain reads; retain the original observation.
                # https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html
                inverted=ImageEnhance.Contrast(ImageOps.invert(ImageOps.grayscale(crop))).enhance(1.5)
                retry_path=Path(workdir)/f"stripe-{table['side']}-{index}-{field}-inverted.png"
                inverted.save(retry_path)
                try:
                    value,confidence,text=stripe_observation(tesseract_words(retry_path,7,'0123456789,-: '),field)
                    if value is not None and confidence>=threshold:
                        reads['tesseract']={'value':value,'confidence':confidence,'readText':text,
                                            'rendering':'inverted','initialRead':primary}
                except (ValueError,RuntimeError,subprocess.TimeoutExpired):
                    pass
            observations[field]=reads
        row.setdefault('_recoveryEvidence',{}).update(observations)
        agreed={}
        for field,reads in observations.items():
            primary=reads.get('tesseract',{})
            fallback=reads.get('apple-vision',{})
            threshold=70 if field=='endsAt' else 35
            if primary.get('value') is not None and primary.get('value')==fallback.get('value') and min(
                    primary.get('confidence',0),fallback.get('confidence',0))>=threshold:
                agreed[field]=primary['value']
        if numeric_needed and all(k in agreed for k in FIELDS[:3]) and numeric_valid(agreed):
            for field in FIELDS[:3]:
                row[field]=agreed[field]
                row['_confidence'][field]=min(read['confidence'] for read in observations[field].values())
                row['_raw'][field]=observations[field]['tesseract']['readText']
                row['_source'][field]='stripe-tesseract+apple-vision'
            row['_numericConflict']=False
        if 'endsAt' in agreed:
            row['endsAt']=agreed['endsAt']
            row['_confidence']['endsAt']=min(read['confidence'] for read in observations['endsAt'].values())
            row['_raw']['endsAt']=observations['endsAt']['tesseract']['readText']
            row['_source']['endsAt']='stripe-tesseract+apple-vision'
            row['_conflict']=False
    return rows


def read_market(path, workdir, vision_binary=None, verify_vision=False):
    im = Image.open(path).convert('RGB')
    issues, engines, tables, rows = [], ['tesseract'], None, {}
    primary_error = None
    try:
        anchors=tesseract_words(path)
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        anchors=[]
        primary_error=str(exc)
    item=read_selected_item(path,workdir,vision_binary,anchors=anchors)
    if item['source']=='apple-vision':
        engines.append('apple-vision')
    if item['status']!='tibia_coins':
        issues.append({'side':None,'row':None,'field':'selectedItem','reason':item['reason'],'readText':item['text']})
    if item['status']=='other_item':
        return {'offers':[],'issues':issues,'engines':engines,'itemVerification':item}
    try:
        tables = geometry(anchors, im.height)
        for table in tables:
            scale = max(.5,min(6,42/max(1,table['glyph'])))
            bounds=(table['x0'],int(table['top']),min(im.width,int(table['totalR']+table['glyph']*24)),int(table['stop']-table['glyph']*.8))
            crop = ImageEnhance.Contrast(ImageOps.grayscale(im.crop(bounds))).enhance(1.35)
            crop = crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
            crop_path=Path(workdir)/f"{table['side']}.png"
            crop.save(crop_path)
            table.update(cropPath=crop_path, bounds=bounds, scale=scale)
            combined=[]
            for psm in (6,11):
                ws=tesseract_words(crop_path,psm,'0123456789,-: ')
                for w in ws:
                    for k in ('x','r','cx'): w[k]=bounds[0]+w[k]/scale
                    for k in ('y','b','cy'): w[k]=bounds[1]+w[k]/scale
                    w['h']/=scale
                merge_rows(combined,parse_table(ws,table,'tesseract'),table['glyph'])
            rows[table['side']]=sorted(combined,key=lambda r:r['_cy'])
    except (ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        primary_error=str(exc)
    fallback_needed = verify_vision or primary_error or any(not rows.get(side) or any(needs_fallback(r) for r in rows[side]) for side in ('sell','buy'))
    # Vision also checks row completeness when primary rows leave visible gaps.
    for side in ('sell','buy'):
        rs=rows.get(side,[])
        gaps=[b['_cy']-a['_cy'] for a,b in zip(rs,rs[1:])]
        if len(gaps)>=2 and max(gaps)>median(gaps)*1.6:
            fallback_needed=True
    if tables and any(len(rows.get(t['side'],[]))!=len(visual_row_centers(im,t)) for t in tables):
        fallback_needed=True
    fallback_error=None
    if fallback_needed:
        if 'apple-vision' not in engines:
            engines.append('apple-vision')
        try:
            if tables and all('cropPath' in t for t in tables):
                for table in tables:
                    ws=vision_words(table['cropPath'],vision_binary)
                    for w in ws:
                        for k in ('x','r','cx'): w[k]=table['bounds'][0]+w[k]/table['scale']
                        for k in ('y','b','cy'): w[k]=table['bounds'][1]+w[k]/table['scale']
                        w['h']/=table['scale']
                    rows[table['side']]=merge_rows(rows.get(table['side'],[]),parse_table(ws,table,'apple-vision'),table['glyph'],True)
            else:
                scaled=im.resize((im.width*2,im.height*2),Image.Resampling.LANCZOS)
                vp=Path(workdir)/'vision-anchors.png'
                scaled.save(vp)
                ws=vision_words(vp,vision_binary)
                for w in ws:
                    for k in ('x','r','cx','y','b','cy','h'): w[k]/=2
                vision_tables=geometry(ws,im.height)
                tables=tables or vision_tables
                for table in vision_tables:
                    rows[table['side']]=merge_rows(rows.get(table['side'],[]),parse_table(ws,table,'apple-vision'),table['glyph'],True)
        except (ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
            fallback_error=str(exc)
    if not tables or any(not rows.get(side) for side in ('sell','buy')):
        issues.append({'side':None,'row':None,'field':'marketTables','reason':'Both offer tables/rows were not recognized','primaryError':primary_error,'fallbackError':fallback_error})
    if tables:
        for table in tables:
            rs=rows.get(table['side'],[])
            if rs and any(needs_fallback(r) for r in rs):
                if 'apple-vision' not in engines:
                    engines.append('apple-vision')
                recover_stripes(im,table,rs,workdir,vision_binary,anchors)
    offers=[]
    for side in ('sell','buy'):
        rs=rows.get(side,[])
        table=next((t for t in tables or [] if t['side']==side),None)
        if table and len(rs)!=len(visual_row_centers(im,table)):
            issues.append({'side':side,'row':None,'field':'row','reason':'OCR row count does not match visible numeric text bands'})
        for index,r in enumerate(rs):
            for field in FIELDS:
                if r[field] is None or (field!='endsAt' and r[field]<=0):
                    issues.append({'side':side,'row':index+1,'field':field,'reason':'Unread or invalid','readText':r['_raw'][field]})
            if not numeric_valid(r):
                issues.append({'side':side,'row':index+1,'field':'amount/price/total','reason':'Checksum could not be validated'})
            if r.get('_numericConflict') or any(r['_confidence'][k]<35 for k in FIELDS[:3]):
                issues.append({'side':side,'row':index+1,'field':'amount/price/total','reason':'Conflicting or low-confidence numeric readings'})
            if r.get('_conflict') or (r['endsAt'] and r['_confidence']['endsAt']<70):
                issues.append({'side':side,'row':index+1,'field':'endsAt','reason':'Conflicting or low-confidence timestamp','readText':r['_raw']['endsAt']})
            offers.append({k:r[k] for k in FIELDS}|{'side':side,'rowIndex':index,'ocrSource':r['_source'],
                                                 'ocrConfidence':r['_confidence'],'alternatives':r.get('_alternatives',{}),
                                                 'recoveryEvidence':r.get('_recoveryEvidence',{})})
        gaps=[b['_cy']-a['_cy'] for a,b in zip(rs,rs[1:])]
        if len(gaps)>=2:
            pitch=median(gaps)
            for i,gap in enumerate(gaps):
                if gap>pitch*1.6:
                    issues.append({'side':side,'row':i+2,'field':'row','reason':'Unresolved visual gap; one or more offer rows may be missing'})
    if fallback_error:
        issues.append({'side':None,'row':None,'field':'fallback','reason':fallback_error})
    return {'offers':offers,'issues':issues,'engines':engines,'itemVerification':item}
