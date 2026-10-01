"""Confirm the selected Market item, rather than a search term or visible item.

The list is located from Market labels. A brighter, flat background band proves
selection; only text inside that band can establish the displayed order book.
"""
from collections import Counter
from pathlib import Path
from statistics import median
import re
import subprocess

from PIL import Image


def _label(text):
    return re.sub(r'[^a-z]', '', text.lower())


def item_list_bounds(words, width, height, sidebar=False):
    from native_market_ocr import lines
    offers = []
    for line in lines(words):
        for index, word in enumerate(line):
            if _label(word['t']) == 'offers' and index and _label(line[index-1]['t']) in ('sell', 'buy'):
                offers.append(line[index-1])
    if len(offers) != 2 or {_label(w['t']) for w in offers} != {'sell', 'buy'}:
        raise ValueError('Market Sell/Buy labels do not establish the item-list location')
    offer_x = median(w['x'] for w in offers)
    glyph = median(w['h'] for w in offers)
    buy_y = next(w['y'] for w in offers if _label(w['t']) == 'buy')
    candidates = [w for w in words if _label(w['t']) == 'items'
                  and 0 <= w['x'] < offer_x
                  and abs(w['y']-buy_y) < glyph*6]
    if len(candidates) != 1:
        raise ValueError('Market Items label is missing or ambiguous')
    items = candidates[0]
    searches = [w for w in words if _label(w['t']) == 'search'
                and items['x'] <= w['x'] < offer_x and w['y'] > items['b']]
    if len(searches) != 1 and not (sidebar and not searches):
        raise ValueError('Market Search label is missing or ambiguous')
    # The scrollbar lies between the list's interior and the offer table.
    # Exclude it and the search row, including its selected-item preview icon.
    bounds = (round(items['x']), round(items['b']+glyph*.5),
              round(offer_x-glyph*2.5), round(searches[0]['y']-glyph*1.4) if searches else height)
    left, top, right, bottom = bounds
    if not (0 <= left < right <= width and 0 <= top < bottom <= height
            and right-left >= glyph*6 and bottom-top >= glyph*3):
        raise ValueError('Market item-list bounds are not plausible')
    return bounds, glyph


def selected_band(image, bounds, glyph):
    """Find one full-width selection background; return absolute top/bottom."""
    left, top, right, bottom = bounds
    # Skip item icons and list edges. Median sampling tolerates text glyphs;
    # the gray band must also cover most of the remaining row width.
    sample_left = round(left+glyph*3.4)
    sample_right = round(right-glyph*.5)
    if sample_right-sample_left < glyph*2:
        raise ValueError('Item list is too narrow to verify selection')
    levels = []
    pixels = image.load()
    for y in range(top, bottom):
        samples = [pixels[x, y] for x in range(sample_left, sample_right)]
        grays = [sum(p)/3 for p in samples]
        level = median(grays)
        flat = sum(max(p)-min(p) <= 6 and abs(g-level) <= 6
                   for p, g in zip(samples, grays))/len(samples)
        levels.append((y, round(level), flat))
    stable = [level for _, level, flat in levels if flat >= .7]
    if not stable:
        raise ValueError('Item-list background could not be measured')
    background = Counter(stable).most_common(1)[0][0]
    bands, start = [], None
    for y, level, flat in levels:
        selected = flat >= .7 and level >= background+12
        if selected and start is None:
            start = y
        elif not selected and start is not None:
            bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, bottom))
    # Text pixels can briefly interrupt a flat background measurement. Join
    # holes no taller than a text glyph, keeping the whole selected item row.
    joined = []
    for start, stop in bands:
        if joined and start-joined[-1][1] <= glyph*1.2:
            joined[-1] = (joined[-1][0], stop)
        else:
            joined.append((start, stop))
    bands = joined
    bands = [(a, b) for a, b in bands if glyph*1.5 <= b-a <= glyph*5]
    if len(bands) != 1:
        raise ValueError('Exactly one highlighted item row could not be established')
    return bands[0]


def _read_label(words):
    from native_market_ocr import lines
    # Icons/counts are excluded by the crop. One readable line establishes the
    # item name; require exact words rather than substring or punctuation fixes.
    recognized = lines(words)
    if len(recognized) != 1:
        return None
    row = recognized[0]
    if not row or min(w['conf'] for w in row) < 70:
        return None
    text = ' '.join(w['t'] for w in row).strip()
    if not re.fullmatch(r"[A-Za-z][A-Za-z '\-]*", text):
        return None
    # A clipped/misread coin label cannot prove another selected item.
    if text.casefold()!='tibia coins' and len(text.split())<=2 and (re.search(r'\bcoins?\b',text,re.I) or text.casefold().startswith('tibia')):
        return None
    return text


def read_selected_item(path, workdir, vision_binary, anchors=None):
    # Lazy imports allow native_market_ocr to invoke this helper itself.
    from native_market_ocr import tesseract_words, vision_words
    result = {'status':'unconfirmed', 'text':None, 'source':None, 'reason':None}
    image = Image.open(path).convert('RGB')
    failures = []
    words = anchors
    bounds, glyph = None, None
    if words is None:
        try:
            words = tesseract_words(path)
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            failures.append(str(error))
    if words is not None:
        try:
            bounds, glyph = item_list_bounds(words, image.width, image.height)
        except ValueError as error:
            failures.append(str(error))
    if bounds is None and words:
        # A small sidebar crop can recover a Search label lost in whole-screen
        # segmentation. The broad crop is only an OCR aid, never selection proof.
        try:
            broad, g = item_list_bounds(words,image.width,image.height,sidebar=True)
            scale=max(2,min(6,42/max(1,g)))
            crop=image.crop(broad)
            crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
            crop_path=Path(workdir)/'item-sidebar.png';crop.save(crop_path)
            recovered=tesseract_words(crop_path,11)
            for w in recovered:
                for k in ('x','r','cx'):w[k]=broad[0]+w[k]/scale
                for k in ('y','b','cy'):w[k]=broad[1]+w[k]/scale
                w['h']/=scale
            merged=list(words)
            for w in recovered:
                if not any(_label(p['t'])==_label(w['t']) and abs(p['cx']-w['cx'])<=max(p['h'],w['h'])*1.5
                           and abs(p['cy']-w['cy'])<=max(p['h'],w['h'])*1.5 for p in merged):merged.append(w)
            bounds,glyph=item_list_bounds(merged,image.width,image.height)
        except (ValueError,RuntimeError,subprocess.TimeoutExpired):
            pass
    if bounds is None:
        try:
            scaled = image.resize((image.width*2, image.height*2), Image.Resampling.LANCZOS)
            anchor_path = Path(workdir)/'item-anchors.png'
            scaled.save(anchor_path)
            vision = vision_words(anchor_path, vision_binary)
            for word in vision:
                for key in ('x','r','y','b','h','cx','cy'):
                    word[key] /= 2
            try:
                bounds, glyph = item_list_bounds(vision, image.width, image.height)
            except ValueError:
                # One engine may read Search while the other reads Sell/Buy.
                # Combine directly observed anchors, deduplicating shared words.
                merged=list(words or [])
                for word in vision:
                    if not any(_label(w['t'])==_label(word['t'])
                               and abs(w['cx']-word['cx'])<=max(w['h'],word['h'])*1.5
                               and abs(w['cy']-word['cy'])<=max(w['h'],word['h'])*1.5 for w in merged):
                        merged.append(word)
                bounds, glyph = item_list_bounds(merged, image.width, image.height)
        except (ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
            failures.append(str(error))
            result['reason'] = '; '.join(failures)
            return result
    try:
        top, bottom = selected_band(image, bounds, glyph)
    except ValueError as error:
        result['reason'] = str(error)
        return result
    # Crop the selected row's name, leaving both icon and search text outside.
    # The row contains a square item icon. Its measured height is a more stable
    # horizontal offset than header glyph height, which differs between OCRs.
    crop = image.crop((round(bounds[0]+(bottom-top)*1.05), top+1, bounds[2]-2, bottom-1))
    scale = max(2, min(6, 42/max(1, glyph)))
    crop = crop.resize((round(crop.width*scale), round(crop.height*scale)), Image.Resampling.LANCZOS)
    crop_path = Path(workdir)/'selected-item.png'
    crop.save(crop_path)
    for source, reader in (('tesseract', lambda: tesseract_words(crop_path, 6)),
                           ('apple-vision', lambda: vision_words(crop_path, vision_binary))):
        try:
            text = _read_label(reader())
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            failures.append(str(error))
            continue
        if text is None:
            failures.append(source+' could not confidently read the highlighted item name')
            continue
        result.update(status='tibia_coins' if text.casefold() == 'tibia coins' else 'other_item',
                      text=text, source=source,
                      reason='Exact item name read within the highlighted Items-list row')
        return result
    result['reason'] = '; '.join(failures)
    return result
