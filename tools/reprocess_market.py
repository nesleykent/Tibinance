#!/usr/bin/env python3
"""Reprocess local screenshots through the website's canonical JavaScript pipeline."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys
from decimal import Decimal

from website_pipeline import WebsitePipeline

IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.webp', '.heic', '.tif', '.tiff'}
FIELDS = ('amount', 'price', 'total', 'endsAt', 'endsAtUtc')
CAPTURE_FIELDS = ('hash', 'world', 'capturedAt', 'type', 'battleye', 'sell', 'sellVolume',
                  'buy', 'buyVolume', 'goldDemand', 'goldSupply', 'sellTopAmount', 'buyTopAmount',
                  'processingVersion', 'statistics30d', 'captureDate', 'captureTimeZone', 'statisticsReferenceDate', 'capturedAtUtc', 'viewType')
STAGE_FIELDS = ('filename', 'deduplication', 'market', 'item', 'view', 'metadata', 'world', 'extraction', 'statistics', 'validation')
STATUSES = ('ready', 'needs_review', 'excluded_automatic', 'excluded_manual', 'excluded_market',
            'excluded_other_item', 'unclassifiable', 'duplicate')


def capture_order(value):
    """Compare the complete parsed filename clock, without float/microsecond truncation."""
    if value is None:
        return (9999, 99, 99, 99, 99, 99, Decimal(0))
    whole, _, fraction = value.partition('.')
    return (*map(int, re.split(r'[-T:]', whole)), Decimal('0.' + (fraction or '0')))


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normally echoes unknown arguments/type values, which can be
        # private source names. Keep CLI failures inside the same privacy boundary.
        self.print_usage(sys.stderr)
        self.exit(2, 'Invalid arguments or configuration; use --help. Private diagnostics suppressed.\n')


def safe_statistics(value):
    if not isinstance(value, dict):
        return None
    return {side: {key: v if type(v := (value.get(side) or {}).get(key)) is int else None
                   for key in ('transactions', 'highestPrice', 'averagePrice', 'lowestPrice', 'tcVolume')}
            for side in ('buy', 'sell') if isinstance(value.get(side), dict)}


def safe_capture(capture):
    result = {k: capture[k] for k in CAPTURE_FIELDS if k in capture}
    if 'statistics30d' in result:
        result['statistics30d'] = safe_statistics(result['statistics30d'])
    return result


def safe_result(entry):
    """A closed public schema; never retain source data or arbitrary diagnostics."""
    result = {k: entry.get(k) for k in ('hash', 'world', 'capturedAt')}
    result['status'] = entry.get('status') if entry.get('status') in STATUSES else 'needs_review'
    result['processingVersion'] = entry.get('processingVersion', 0)
    if entry.get('viewType') in ('offers','statistics'):
        result['viewType'] = entry['viewType']
    result['stages'] = {k: v for k, v in entry.get('stages', {}).items()
                        if k in STAGE_FIELDS and isinstance(v, bool)}
    result['attemptedStages'] = [s for s in entry.get('attemptedStages', []) if s in STAGE_FIELDS]
    result['statistics30d'] = safe_statistics(entry.get('statistics30d'))
    result['offers'] = [{k: row.get(k) for k in (*FIELDS, 'side', 'rowIndex')}
                        for row in entry.get('offers', [])]
    item = entry.get('itemVerification', {}).get('status')
    result['itemVerification'] = {'status': item if item in ('tibia_coins', 'other_item') else 'unconfirmed'}
    allowed_fields = {*FIELDS, *STAGE_FIELDS, 'row', 'selectedItem', 'capturedAt', 'statistics30d.buy', 'statistics30d.sell'}
    result['issues'] = [{'field': i.get('field') if i.get('field') in allowed_fields else 'row',
                         'reason': 'World resolution failed' if i.get('field') == 'world' else 'Validation requires review'}
                        for i in entry.get('issues', [])]
    if entry.get('runtimeFault') in ('browser_closed', 'browser_crash'):
        result['runtimeFault'] = entry['runtimeFault']
    if entry.get('capture') and result['status'] == 'ready' and result['stages'].get('validation'):
        result['capture'] = safe_capture(entry['capture'])
        if entry['capture'].get('viewType') != 'statistics':
            result['capture']['offers'] = result['offers']
    if entry.get('context') and result['stages'].get('world'):
        result['context'] = safe_capture(entry['context'])
    return result


def scan_file(file, contexts, pipeline, corrections):
    """Transport only. Every eligibility/extraction decision is made in website JS."""
    hash_value = hashlib.sha256(file.read_bytes()).hexdigest()
    context = safe_capture(contexts[hash_value]) if hash_value in contexts else None
    reading = pipeline.ingest(file, context, corrections.get(hash_value))
    world = reading.get('world') or {}
    entry = dict(reading, hash=hash_value, world=world.get('world'), processingVersion=pipeline.version)
    entry['offers'] = reading.get('offers') or [dict(row, side=side, rowIndex=index)
        for side in ('sell', 'buy') for index, row in enumerate(reading.get('rows', {}).get(side, []))]
    if (reading.get('stages', {}).get('world') and reading.get('capturedAt')
            and all(world.get(k) for k in ('world', 'type', 'battleye'))):
        entry['context'] = {'hash': hash_value, 'capturedAt': reading['capturedAt'],
                            'captureTimeZone': reading.get('captureTimeZone'),
                            'world': world['world'], 'type': world['type'], 'battleye': world['battleye']}
    return safe_result(entry)


def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


def write_outputs(output, baseline, results, rebuild=False, inventory=None):
    results = [safe_result(r) for r in results]
    atomic_json(output / 'backfill-results.json', results)
    captures = [r['capture'] for r in results if r['status'] == 'ready' and r.get('capture')]
    captures.sort(key=lambda c: (capture_order(c['capturedAt']), c['hash']))
    if len({c['hash'] for c in captures}) != len(captures):
        raise ValueError('Duplicate canonical capture hash')
    atomic_json(output / 'captures-extracted.json', captures)
    atomic_json(output / 'excluded-captures.json', [safe_capture(c) for c in baseline
        if any(r['hash'] == c['hash'] and r['status'].startswith('excluded_') for r in results)])
    review = [r for r in results if r['status'] == 'needs_review']
    atomic_json(output / 'review-corrections.json', [
        {'hash': r['hash'], 'world': r['world'], 'capturedAt': r['capturedAt'], 'offers': r['offers'], 'statistics30d': r['statistics30d']} for r in review])
    with (output / 'review-report.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=['hash', 'world', 'capturedAt', 'status', 'field', 'reason'])
        writer.writeheader()
        for r in results:
            for issue in r['issues']:
                writer.writerow({k: r.get(k) for k in ('hash', 'world', 'capturedAt', 'status')} | issue)
    summary = {status: sum(r['status'] == status for r in results) for status in STATUSES}
    summary.update(processed=len(results), baselineCaptures=len(baseline),
                   exportedCaptures=len(captures), worlds=len({c['world'] for c in captures}),
                   offerObservations=sum(len(c.get('offers', [])) for c in captures),
                   validTibiaCoinsCaptures=sum(r['itemVerification']['status'] == 'tibia_coins' for r in results),
                   runtimeFailures=sum(bool(r.get('runtimeFault')) for r in results),
                   pipeline='website JavaScript implementation')
    if inventory:
        summary.update(inventory)
        summary['excluded_automatic'] = inventory.get('filenameRejected', summary['excluded_automatic'])
    atomic_json(output / 'summary.json', summary)
    return summary


def main():
    parser = PrivateArgumentParser(prog='reprocess_market.py', description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--baseline', type=Path, help='Existing anonymous historical capture context (optional)')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--retry-review', action='store_true')
    parser.add_argument('--retry-runtime', action='store_true', help='Retry only checkpointed browser execution failures')
    parser.add_argument('--corrections', type=Path)
    parser.add_argument('--exclude-hash', action='append', default=[])
    parser.add_argument('--utc-offset')
    # Retain existing invocation compatibility; the website now owns these stages.
    parser.add_argument('--rebuild', action='store_true')
    parser.add_argument('--resolve-worlds', action='store_true', help='World resolution is always part of canonical ingestion')
    parser.add_argument('--workers', type=int, default=1, help='The shared website OCR worker processes captures sequentially')
    parser.add_argument('--isolate-browser', action='store_true', help='Use a fresh shared-pipeline browser per screenshot')
    parser.add_argument('--vision-binary', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not args.folder.is_dir():
        parser.error('A local screenshot directory is required')
    if args.baseline and args.baseline.name == 'observations-enriched.json':
        parser.error('Enriched observation exports cannot supply world resolution')
    if args.utc_offset and not re.fullmatch(r'[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00', args.utc_offset):
        parser.error('UTC offset must be a valid signed HH:MM offset')
    baseline = [safe_capture(c) for c in json.loads(args.baseline.read_text())] if args.baseline else []
    # A raw rebuild may retain trusted historical world identity, never old
    # extraction values or the old capture clock (which may omit fractions).
    contexts = {c['hash']: {k:c[k] for k in ('hash','world','type','battleye') if k in c}
                if args.rebuild else c for c in baseline}
    if len(contexts) != len(baseline):
        parser.error('Historical context contains duplicate capture hashes')
    corrections = {c['hash']: c for c in json.loads(args.corrections.read_text())} if args.corrections else {}
    all_files = [p for p in args.folder.rglob('*') if p.is_file()]
    images = [p for p in all_files if p.suffix.lower() in IMAGE_TYPES]
    args.output.mkdir(parents=True, exist_ok=True)
    prior_path = args.output / 'backfill-results.json'
    prior = json.loads(prior_path.read_text()) if args.resume and prior_path.exists() else []
    with WebsitePipeline() as pipeline:
        eligibility = pipeline.eligible(images)
        eligible = [p for p, keep in zip(images, eligibility) if keep]
        clocks = dict(zip(eligible, pipeline.capture_times(eligible)))
        eligible.sort(key=lambda p: capture_order(clocks[p]))
        # Invalidating old-version results also removes automatic captures from resumes.
        previous = {r['hash']: safe_result(r) for r in prior if r.get('processingVersion') == pipeline.version}
        results = {}; hashes = set(); resumed = 0; processing_order = []
        counts = {s: {'entered': 0, 'passed': 0} for s in pipeline.stages}
        counts['filename'] = {'entered': len(images), 'passed': len(eligible)}
        for file in eligible:
            h = hashlib.sha256(file.read_bytes()).hexdigest()
            processing_order.append({'hash':h,'capturedAt':clocks[file]})
            atomic_json(args.output / 'processing-order.json', processing_order)
            repeated = h in hashes
            hashes.add(h)
            old = previous.get(h)
            checked = None
            if repeated:
                entry = pipeline.ingest(file, results.get(h, {}).get('capture') or {'hash':h}, reprocess=False)
                if entry['status'] != 'duplicate': raise RuntimeError('Duplicate must stop at canonical preflight')
            elif h in args.exclude_hash:
                entry = {'hash': h, 'status': 'excluded_manual', 'processingVersion': pipeline.version,
                         'stages': {'filename': True}, 'attemptedStages': ['filename'], 'issues': [], 'offers': []}
            elif old and h not in corrections and not ((args.retry_review and old['status'] == 'needs_review')
                    or (args.retry_runtime and old.get('runtimeFault'))):
                checked = pipeline.ingest(file, old.get('capture') or old.get('context') or {'hash': h}, reprocess=False)
                if checked['status'] != 'duplicate':
                    raise RuntimeError('Checkpoint must pass canonical duplicate preflight')
                entry = old; resumed += 1
            else:
                if args.isolate_browser:
                    with WebsitePipeline() as reader:
                        try:
                            entry = scan_file(file, contexts, reader, corrections)
                        except RuntimeError as error:
                            phase = getattr(error,'phase',None)
                            entry = {'hash':h,'capturedAt':clocks[file],'status':'needs_review',
                                     'processingVersion':pipeline.version,'offers':[],
                                     'stages':{'filename':True},'attemptedStages':['filename'],
                                     'issues':[{'field':phase or 'validation','reason':'Validation requires review'}]}
                            if getattr(error,'fault',None) in ('browser_closed','browser_crash'):
                                entry['runtimeFault'] = error.fault
                else:
                    entry = scan_file(file, contexts, pipeline, corrections)
            executed = checked if checked is not None else entry
            for s in pipeline.stages[1:]:
                counts[s]['entered'] += s in executed.get('attemptedStages', [])
                counts[s]['passed'] += executed.get('stages', {}).get(s) is True
            if entry.get('context'):
                contexts[h] = entry['context']
            if entry['status'] != 'duplicate' or h not in results:
                results[h] = safe_result(entry)
            atomic_json(prior_path, list(results.values()))
            print(json.dumps({'completed':len(processing_order),'eligible':len(eligible),
                              'capturedAt':clocks[file],'status':entry['status']}), flush=True)
        initial_hashes = {c['hash'] for c in baseline}
        original_source = args.output / 'source-baseline.json'
        if original_source.exists(): initial_hashes = {c['hash'] for c in json.loads(original_source.read_text())}
        inventory = {'previouslyKnownEligibleCaptures': len(hashes & initial_hashes),
                     'previouslyUnseenEligibleCaptures': len(hashes - initial_hashes), 'totalFilesScanned': len(all_files), 'imageFilesConsidered': len(images),
                     'filenameEligible': len(eligible), 'filenameRejected': len(images) - len(eligible),
                     'duplicateScreenshots': len(eligible) - len(hashes), 'reusedCheckpoints': resumed,
                     'processingVersion': pipeline.version, 'stageCounts': counts}
        inventory['chronologicalRange'] = {'oldest':next((clocks[p] for p in eligible if clocks[p]),None),
                                          'newest':next((clocks[p] for p in reversed(eligible) if clocks[p]),None)}
        inventory['unresolvedFilenameTimes'] = sum(clocks[p] is None for p in eligible)
        inventory['captureTimeZone'] = pipeline.capture_time_zone
        atomic_json(args.output / 'inventory.json', inventory)
        atomic_json(args.output / 'capture-contexts.json', list(contexts.values()))
        source = args.output / 'source-baseline.json'
        if not source.exists(): atomic_json(source, baseline)
        if args.utc_offset:
            atomic_json(args.output / 'backfill-metadata.json', {'captureClock': 'local', 'endsAtClock': 'local',
                        'utcOffset': args.utc_offset, 'timestampRepresentation': 'Displayed clock values preserved'})
        summary = write_outputs(args.output, baseline, list(results.values()), True, inventory)
    # This is the same canonical offer matcher used by browser persistence.
    subprocess.run([__import__('os').environ.get('TIBINANCE_NODE', 'node'),
                    str(Path(__file__).with_name('finalize_backfill.mjs')), str(args.output)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(json.dumps(summary), flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Canonical reprocessing failed; private diagnostics suppressed.', file=sys.stderr)
        raise SystemExit(1)
