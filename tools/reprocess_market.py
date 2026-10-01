#!/usr/bin/env python3
"""Offline archive enrichment with explicit review records and Vision fallback."""
import argparse
import csv
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed

from native_market_ocr import read_market, FIELDS
from offer_tracking import normalize_ends_at
from market_item import read_selected_item

IMAGE_TYPES = {'.png','.jpg','.jpeg','.webp','.bmp','.tiff','.tif'}


def validate_capture(offers, capture):
    issues=[]
    for side in ('sell','buy'):
        rows=[r for r in offers if r['side']==side]
        if not rows:
            issues.append({'side':side,'row':None,'field':'row','reason':'No offers recognized'})
            continue
        if any(any(r.get(k) is None for k in FIELDS) for r in rows):
            continue
        best=(min if side=='sell' else max)(r['price'] for r in rows)
        if rows[0]['price']!=best:
            issues.append({'side':side,'row':1,'field':'price','reason':'First offer is not the best visible price'})
        comparisons={side:best,side+'Volume':sum(r['amount'] for r in rows),
                     'goldDemand' if side=='sell' else 'goldSupply':sum(r['amount']*r['price'] for r in rows),
                     side+'TopAmount':sum(r['amount'] for r in rows if r['price']==best)}
        for field,value in comparisons.items():
            if capture.get(field) is not None and capture[field]!=value:
                issues.append({'side':side,'row':None,'field':field,'reason':'OCR does not match the previously reviewed capture',
                               'expected':capture[field],'observed':value})
    sell=[r['price'] for r in offers if r['side']=='sell' and r.get('price')]
    buy=[r['price'] for r in offers if r['side']=='buy' and r.get('price')]
    if sell and buy and max(buy)>=min(sell):
        issues.append({'side':None,'row':None,'field':'price','reason':'Crossed market requires manual review'})
    return issues


def apply_corrections(reading, correction):
    if not correction:
        return reading
    # Manual correction supplies the complete visible rows, including any missed
    # rows. Revalidate every field; no OCR or checksum value is silently invented.
    rows=correction.get('offers')
    if not isinstance(rows,list) or not rows:
        raise ValueError('Corrections must provide complete nonempty offers')
    prepared=[]
    counters={'sell':0,'buy':0}
    for r in rows:
        side=r.get('side')
        if side not in counters:
            raise ValueError('Invalid correction side')
        vals={k:r.get(k) for k in FIELDS[:3]}
        if any(type(v) is not int or v<=0 for v in vals.values()) or vals['amount']*vals['price']!=vals['total']:
            raise ValueError('Correction numeric fields must be positive and satisfy amount × price = total')
        ends=normalize_ends_at(r.get('endsAt'))
        if not ends:
            raise ValueError('Correction requires exact Ends At with seconds')
        prepared.append(vals|{'endsAt':ends,'side':side,'rowIndex':counters[side],
                              'ocrSource':{k:'manual' for k in FIELDS}})
        counters[side]+=1
    return {'offers':prepared,'issues':[],'engines':reading['engines']+['manual']}


def scan_file(file, captures, vision_binary, corrections):
    with file.open('rb') as stream:
        hash_value=hashlib.file_digest(stream,'sha256').hexdigest()
    capture=captures.get(hash_value)
    entry={'hash':hash_value,'capturedAt':capture.get('capturedAt') if capture else None,
           'world':capture.get('world') if capture else None, 'status':'pending','offers':[],'issues':[]}
    if not file.stem.endswith('_Hotkey'):
        entry.update(status='excluded_automatic',issues=[{'side':None,'row':None,'field':'captureType','reason':'Automatic screenshot excluded by the existing Hotkey-only rule'}])
        return entry
    try:
        with tempfile.TemporaryDirectory(prefix='tibinance-ocr-') as workdir:
            reading=read_market(file,workdir,vision_binary)
        entry.update(reading)
        item=reading.get('itemVerification',{'status':'unconfirmed','reason':'Selected item was not verified'})
        if item['status']=='other_item':
            entry['status']='excluded_other_item'
            return entry
        reading=apply_corrections(reading,corrections.get(hash_value))
        entry.update(reading)
        if item['status']=='unconfirmed' and corrections.get(hash_value,{}).get('confirmedSelectedItem')=='Tibia Coins':
            item={'status':'tibia_coins','text':'Tibia Coins','source':'manual','reason':'Explicit manual confirmation of selected item'}
        entry['itemVerification']=item
        if item['status']!='tibia_coins' and not any(i.get('field')=='selectedItem' for i in entry['issues']):
            entry['issues'].append({'side':None,'row':None,'field':'selectedItem','reason':item['reason']})
        if capture:
            entry['issues']+=validate_capture(reading['offers'],capture)
            if corrections.get(hash_value,{}).get('confirmSnapshotDifferences') is True:
                entry['issues']=[i for i in entry['issues'] if i['reason']!='OCR does not match the previously reviewed capture']
        else:
            entry['issues'].append({'side':None,'row':None,'field':'world','reason':'Screenshot hash is absent from baseline; historical world and capture context require manual confirmation'})
        entry['status']='ready' if not entry['issues'] else 'needs_review'
    except Exception as exc:
        entry['status']='needs_review'
        entry['issues'].append({'side':None,'row':None,'field':'corrections' if hash_value in corrections else 'screenshot','reason':str(exc)})
    return entry


def verify_existing_item(file, previous, vision_binary):
    """Recheck item identity without discarding the prior extraction/review audit."""
    entry=json.loads(json.dumps(previous))
    try:
        with tempfile.TemporaryDirectory(prefix='tibinance-item-') as workdir:
            item=read_selected_item(file,workdir,vision_binary)
    except Exception as exc:
        item={'status':'unconfirmed','text':None,'source':None,'reason':str(exc)}
    entry['itemVerification']=item
    entry['issues']=[i for i in entry['issues'] if i.get('field')!='selectedItem']
    if item['status']!='tibia_coins':
        entry['issues'].append({'side':None,'row':None,'field':'selectedItem','reason':item['reason'],'readText':item.get('text')})
        entry['status']='excluded_other_item' if item['status']=='other_item' else 'needs_review'
    else:
        if not entry['offers']:
            entry['issues'].append({'side':None,'row':None,'field':'marketTables','reason':'Offer OCR must be rerun after item confirmation'})
        entry['status']='needs_review' if entry['issues'] else 'ready'
    return entry


def restore_capture_context(previous, capture):
    """Reuse recognized cells when only their baseline context was missing."""
    entry=json.loads(json.dumps(previous))
    entry.update(world=capture['world'],capturedAt=capture['capturedAt'])
    entry['issues']=[i for i in entry['issues'] if i.get('field')!='world']
    for row in entry['offers']:
        try:
            if any(type(row.get(k)) is not int or row[k]<=0 for k in FIELDS[:3]) or row['amount']*row['price']!=row['total']:
                raise ValueError('Cached numeric fields do not validate')
            if not normalize_ends_at(row.get('endsAt')):
                raise ValueError('Cached expiration does not validate')
        except ValueError as error:
            entry['issues'].append({'side':row.get('side'),'row':row.get('rowIndex',0)+1,'field':'row','reason':str(error)})
    entry['issues']+=validate_capture(entry['offers'],capture)
    entry['status']='needs_review' if entry['issues'] else 'ready'
    return entry


def atomic_json(path, data):
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,indent=2)+'\n')
    os.replace(tmp,path)


def write_outputs(output, baseline, results):
    atomic_json(output/'backfill-results.json',results)
    offers_by_hash={r['hash']:r['offers'] for r in results if r['status']=='ready'
                    and r.get('itemVerification',{}).get('status')=='tibia_coins'}
    captures=[]
    excluded=[]
    excluded_hashes={r['hash'] for r in results if r['status']=='excluded_other_item'}
    for c in baseline:
        if c['hash'] in excluded_hashes:
            excluded.append(c)
            continue
        record=dict(c)
        result=next((r for r in results if r['hash']==c['hash']),None)
        if not result or result.get('itemVerification',{}).get('status')!='tibia_coins':
            record.pop('offers',None)
            record.pop('processingVersion',None)
        if c['hash'] in offers_by_hash:
            record.update(processingVersion=1,offers=[{k:r[k] for k in (*FIELDS,'side','rowIndex')} for r in offers_by_hash[c['hash']]])
        captures.append(record)
    # UUID allocation uses the application's canonical matcher in finalize_backfill.mjs.
    atomic_json(output/'captures-extracted.json',captures)
    atomic_json(output/'excluded-captures.json',excluded)
    review=[r for r in results if r['status']=='needs_review']
    atomic_json(output/'review-corrections.json',[{'hash':r['hash'],'world':r['world'],'capturedAt':r['capturedAt'],
                                                'confirmSnapshotDifferences':False,'confirmedSelectedItem':None,'offers':r['offers']} for r in review])
    with (output/'review-report.csv').open('w',newline='') as stream:
        fields=['hash','world','capturedAt','status','screenshot','side','row','field','reason','readText','expected','observed']
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction='ignore')
        writer.writeheader()
        for r in results:
            for issue in r['issues']:
                writer.writerow({k:r.get(k) for k in fields[:4]}|{'screenshot':' | '.join(r.get('sourceFiles',[]))}|issue)
    summary={status:sum(r['status']==status for r in results) for status in ('ready','needs_review','excluded_automatic','excluded_manual','excluded_other_item')}
    summary.update(processed=len(results),baselineCaptures=len(baseline),worlds=len({c['world'] for c in baseline}),
                   offerObservations=sum(len(r['offers']) for r in results if r['status']=='ready'),
                   visionAttempted=sum('apple-vision' in r.get('engines',[]) for r in results),excludedBaselineCaptures=len(excluded),exportedCaptures=len(captures))
    atomic_json(output/'summary.json',summary)
    return summary


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder',type=Path)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--locate',help='Print the original file paths matching a review screenshot hash')
    parser.add_argument('--utc-offset',help='Confirmed local clock offset for Capture Date and Ends At, e.g. -03:00')
    parser.add_argument('--vision-binary',type=Path)
    parser.add_argument('--workers',type=int,default=3)
    parser.add_argument('--corrections',type=Path)
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--retry-review',action='store_true',help='Retry unresolved screenshots with the current OCR, retaining successful extractions')
    parser.add_argument('--exclude-name',action='append',default=[],help='Explicitly exclude an image filename while retaining its audit entry')
    parser.add_argument('--verify-items-only',action='store_true',help='Revalidate selected items in an existing extraction without repeating offer OCR')
    args=parser.parse_args()
    if args.locate:
        for f in sorted(args.folder.rglob('*')):
            if f.suffix.lower() in IMAGE_TYPES:
                with f.open('rb') as stream: h=hashlib.file_digest(stream,'sha256').hexdigest()
                if h==args.locate:
                    print(f)
        return 0
    if not args.baseline or not args.output:
        parser.error('--baseline and --output are required for reprocessing')
    if args.utc_offset and not re.fullmatch(r'[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00',args.utc_offset):
        parser.error('--utc-offset must be a valid signed HH:MM offset')
    baseline=json.loads(args.baseline.read_text())
    captures={c['hash']:c for c in baseline}
    if len(captures)!=len(baseline):
        parser.error('Baseline contains duplicate capture hashes')
    if not 1<=args.workers<=8:
        parser.error('--workers must be between 1 and 8')
    args.output.mkdir(parents=True,exist_ok=True)
    if args.utc_offset:
        atomic_json(args.output/'backfill-metadata.json',{'captureClock':'local','endsAtClock':'local',
                    'utcOffset':args.utc_offset,'offsetSource':'explicit user confirmation','timestampRepresentation':'Displayed clock values preserved without conversion'})
    corrections={r['hash']:r for r in json.loads(args.corrections.read_text())} if args.corrections else {}
    results=json.loads((args.output/'backfill-results.json').read_text()) if args.resume and (args.output/'backfill-results.json').exists() else []
    previous={r['hash']:r for r in results}
    if args.verify_items_only and (not args.resume or not results or corrections):
        parser.error('--verify-items-only requires --resume with an existing batch and cannot apply corrections')
    missing={r['hash'] for r in results if any(i['reason']=='Original screenshot is absent from the supplied folder' for i in r['issues'])}
    completed={r['hash'] for r in results if r['hash'] not in corrections and r['hash'] not in missing
               and not (args.retry_review and r['status']=='needs_review')
               and not (r['hash'] in captures and (r.get('world'),r.get('capturedAt'))!=(captures[r['hash']].get('world'),captures[r['hash']].get('capturedAt')))
               and (r['status']=='excluded_automatic' or r.get('itemVerification',{}).get('status') in ('tibia_coins','other_item'))}
    if args.verify_items_only:
        completed={r['hash'] for r in results if r['status']=='excluded_automatic' or r.get('itemVerification',{}).get('status') in ('tibia_coins','other_item')}
    # Keep unresolved audits until their replacement is checkpointed. An
    # interrupted retry must not erase screenshots still waiting in the queue.
    files=sorted(f for f in args.folder.rglob('*') if f.suffix.lower() in IMAGE_TYPES)
    with tempfile.TemporaryDirectory(prefix='tibinance-vision-') as builddir:
        binary=args.vision_binary
        if binary is None and sys.platform=='darwin':
            binary=Path(builddir)/'vision_ocr'
            subprocess.run(['swiftc','-module-cache-path',str(Path(builddir)/'cache'),str(Path(__file__).with_name('vision_ocr.swift')),'-o',str(binary)],check=True)
        pending=[]
        source_files={}
        for f in files:
            with f.open('rb') as stream: h=hashlib.file_digest(stream,'sha256').hexdigest()
            source_files.setdefault(h,[]).append(str(f.resolve()))
            if f.name in args.exclude_name:
                results=[r for r in results if r['hash']!=h]
                results.append({'hash':h,'world':None,'capturedAt':None,'status':'excluded_manual','offers':[],
                                'issues':[{'side':None,'row':None,'field':'captureType','reason':'Explicitly excluded by the user: capture world cannot be established'}]})
                completed.add(h)
            if h not in completed:
                pending.append(f)
                completed.add(h)  # Process identical files only once, before launching OCR.
        for r in results:
            r['sourceFiles']=source_files.get(r['hash'],[])
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            if args.verify_items_only:
                futures=[pool.submit(verify_existing_item,f,previous[h],binary) if h in previous
                         else pool.submit(scan_file,f,captures,binary,corrections)
                         for f in pending for h in [hashlib.sha256(f.read_bytes()).hexdigest()]]
            else:
                futures=[]
                for f in pending:
                    h=hashlib.sha256(f.read_bytes()).hexdigest()
                    prior=previous.get(h)
                    context_only=prior and h in captures and h not in corrections and not args.retry_review and prior.get('offers') \
                        and prior.get('itemVerification',{}).get('status')=='tibia_coins' \
                        and prior.get('issues') and all(i.get('field')=='world' for i in prior['issues'])
                    futures.append(pool.submit(restore_capture_context,prior,captures[h]) if context_only
                                   else pool.submit(scan_file,f,captures,binary,corrections))
            result_index={r['hash']:i for i,r in enumerate(results)}
            for future in as_completed(futures):
                r=future.result()
                r['sourceFiles']=source_files.get(r['hash'],[])
                index=result_index.get(r['hash'])
                if index is None:
                    result_index[r['hash']]=len(results)
                    results.append(r)
                else:
                    old=results[index]
                    r['previousAttempts']=old.get('previousAttempts',[])+[{'status':old.get('status'),'issues':old.get('issues',[])}]
                    results[index]=r
                atomic_json(args.output/'backfill-results.json',results)
                if len(results)%20==0:
                    print(json.dumps({'processed':len(results),'images':len(files),'ready':sum(r['status']=='ready' for r in results),'review':sum(r['status']=='needs_review' for r in results)}),flush=True)
        # Every baseline capture is also reported when its original image is absent.
        observed={r['hash'] for r in results}
        for c in baseline:
            if c['hash'] not in observed:
                results.append({'hash':c['hash'],'world':c['world'],'capturedAt':c['capturedAt'],'status':'needs_review','offers':[],
                                'issues':[{'side':None,'row':None,'field':'screenshot','reason':'Original screenshot is absent from the supplied folder'}]})
        summary=write_outputs(args.output,baseline,results)
    print(json.dumps(summary),flush=True)
    return 0


if __name__=='__main__':
    raise SystemExit(main())
