"""Locate the classic Market panes using pixels before any text recognition.

OCR receives only the item sidebar, table headers and anonymous columns. The
offer-owner column, game viewport, chat and other panels are never copied.
Unknown layouts fail closed instead of falling back to full-screen OCR.
"""
from collections import defaultdict
import re

from PIL import Image


def _regions_at_scale(image, scale):
    small = image.resize((round(image.width / scale), round(image.height / scale)), Image.Resampling.NEAREST).convert('RGB')
    raw = small.tobytes()
    stride = small.width * 3
    pattern = re.compile(b'(?:\x41\x41\x41){60,}')
    candidates = defaultdict(list)
    for y in range(small.height):
        runs = [(m.start() // 3, m.end() // 3) for m in pattern.finditer(raw[y*stride:(y+1)*stride]) if m.start() % 3 == 0]
        for i in range(len(runs)-3):
            numeric = runs[i:i+4]
            widths = [b-a for a,b in numeric]
            if not all(1 <= numeric[j+1][0]-numeric[j][1] <= 4 for j in range(3)):
                continue
            if not (max(widths[:3])-min(widths[:3]) <= 8 and widths[0]*1.05 <= widths[3] <= widths[0]*2):
                continue
            # The numeric panes establish geometry without depending on any
            # owner-column pixels or the length of an owner's name.
            group = ((round(numeric[0][0]-widths[0]*1.9),numeric[0][0]-2),*numeric)
            candidates[tuple(group)].append(y)
    viable = []
    for group, ys in candidates.items():
        if len(ys) < 8:
            continue
        blocks = [[]]
        for y in ys:
            if blocks[-1] and y-blocks[-1][-1] > 50:
                blocks.append([])
            blocks[-1].append(y)
        if len(blocks) == 2 and all(len(b) >= 3 for b in blocks):
            viable.append((len(ys), group, blocks))
    if not viable:
        return None
    _, group, blocks = max(viable,key=lambda v:(v[1][0][1]-v[1][0][0],v[0]))
    unit = group[1][1]-group[1][0]
    name_left, numeric_left, right = group[0][0], group[1][0], group[-1][1]
    # Preserve geometry while erasing everything outside the permitted fields.
    rectangles = [(max(0, round(numeric_left-unit*3.3)), max(0, blocks[0][0]-70),
                   round(numeric_left-unit*2.1), min(small.height, blocks[-1][0]+280))]
    for block in blocks:
        rectangles.append((round(numeric_left-unit*2.1), max(0, block[0]-70),numeric_left,block[0]-18))
        rectangles.append((numeric_left, max(0,block[0]-70), right,min(small.height,block[-1]+14)))
    return [tuple(round(v*scale) for v in box) for box in rectangles]


def market_regions(image):
    regions = _regions_at_scale(image, max(1, image.width / 1710))
    # A large capture can contain an unscaled client window rather than a
    # Retina-scaled one. Both attempts inspect pixels only.
    if regions is None and image.width > 1710:
        regions = _regions_at_scale(image, 1)
    return regions


def masked_market(image):
    regions = market_regions(image)
    if regions is None:
        return None
    # Match the pane background. A white surround can make Tesseract invert
    # only the empty area and silently discard light text in the dark table.
    safe = Image.new('RGB', image.size, (65,65,65))
    for box in regions:
        safe.paste(image.crop(box), box)
    return safe
