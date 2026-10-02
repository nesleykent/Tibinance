#!/usr/bin/env python3
"""Read checkpointed Market review cases locally; emit explicit row corrections.

Apple Vision is diagnostic evidence, not an alternative ingestion policy. Feed
the corrections back through reprocess_market.py so all website gates, clocks,
world resolution, validation and offer matching still run unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path

from native_market_ocr import read_market, FIELDS
from private_market import masked_market
from PIL import Image
from reprocess_market import atomic_json, IMAGE_TYPES, capture_order


def correction(hash_value, reading):
    """Never accept uncertain cells, partial books or unverified selections."""
    if reading.get('issues') or reading.get('itemVerification', {}).get('status') != 'tibia_coins':
        return None
    if 'apple-vision' not in reading.get('engines', []):
        return None
    rows = reading.get('offers', [])
    if not rows or any(not any(r['side'] == side for r in rows) for side in ('sell', 'buy')):
        return None
    return {'hash': hash_value, 'offers': [
        {k: r[k] for k in (*FIELDS, 'side', 'rowIndex')} for r in rows]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('checkpoint', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--vision-binary', type=Path, required=True)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--retry-incomplete', action='store_true')
    args = parser.parse_args()
    audit = json.loads(args.checkpoint.read_text())
    cases = sorted((r for r in audit if r['status'] != 'ready'),
                   key=lambda r: capture_order(r.get('capturedAt')))
    wanted = {r['hash'] for r in cases}
    paths = {}
    for p in args.archive.rglob('*'):
        if p.is_file() and p.suffix.lower() in IMAGE_TYPES:
            h = hashlib.sha256(p.read_bytes()).hexdigest()
            if h in wanted:
                paths[h] = p
    if wanted != paths.keys():
        raise RuntimeError('Review source bytes missing from the archive')
    args.output.mkdir(parents=True, exist_ok=True)
    for i, case in enumerate(cases):
        h = case['hash']
        directory = args.output / 'cases' / h
        directory.mkdir(parents=True, exist_ok=True)
        cache = directory / 'reading.json'
        reading = json.loads(cache.read_text()) if args.resume and cache.exists() else None
        retryable = (case['status'] in ('needs_review', 'unclassifiable')
                     or (reading or {}).get('itemVerification', {}).get('status') == 'tibia_coins')
        if reading is not None and not (args.retry_incomplete and retryable and correction(h, reading) is None):
            pass
        else:
            try:
                # Numeric pane pixels locate the Market and mask unrelated UI.
                # Retrying an incomplete read never removes its original evidence.
                if reading is not None:
                    if not (directory / 'initial-reading.json').exists():
                        atomic_json(directory / 'initial-reading.json', reading)
                masked = masked_market(Image.open(paths[h]).convert('RGB'))
                source = paths[h]
                if masked is not None:
                    source = directory / 'masked-market.png'
                    masked.save(source)
                reading = read_market(source, directory, args.vision_binary, verify_vision=True)
            except Exception:
                reading = {'offers': [], 'issues': [{'field': 'reader', 'reason': 'Local diagnostic read failed'}]}
            # Raw diagnostic evidence/crops stay in the ignored local work area.
            atomic_json(cache, reading)
        value = correction(h, reading)
        print(json.dumps({'completed': i + 1, 'total': len(cases), 'hash': h,
                          'world': case.get('world'), 'completeReading': value is not None,
                          'issues': len(reading.get('issues', []))}), flush=True)
    corrections, summary = [], []
    for case in cases:
        h = case['hash']
        reading = json.loads((args.output / 'cases' / h / 'reading.json').read_text())
        value = correction(h, reading)
        if value:
            corrections.append(value)
        summary.append({'hash': h, 'world': case.get('world'), 'capturedAt': case.get('capturedAt'),
                        'completeReading': value is not None,
                        'engines': reading.get('engines', []),
                        'unresolvedFields': sorted({i.get('field', 'reader') for i in reading.get('issues', [])})})
    atomic_json(args.output / 'vision-corrections.json', corrections)
    atomic_json(args.output / 'vision-review-summary.json', summary)
    print(json.dumps({'reviewed': len(cases), 'completeReadings': len(corrections)}), flush=True)


if __name__ == '__main__':
    main()
