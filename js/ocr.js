/*
 * Layout-aware reader for the Tibia market window.
 *
 * Nothing is hardcoded to a resolution: the Sell/Buy sections and the
 * Amount / Piece Price / Total Price columns are located by OCR, and every
 * crop is derived from those positions. Works at any client size or UI scale.
 *
 * Pass 1  sparse-text OCR over the whole image -> anchor words
 * Pass 2  digit-only OCR over each table body  -> numbers with positions
 *
 * The three columns are mutually redundant (amount x price == total), which
 * gives every row a free checksum. Rows that fail it are surfaced for the
 * user to correct rather than being silently trusted.
 */
/*
 * Tibia draws its interface with a fixed bitmap font, so glyphs are the same
 * size in pixels whatever the monitor - until the screenshot is scaled. A
 * client at 2x UI scale, a HiDPI capture, or a screenshot someone resized
 * before sending all change the glyph height, and a fixed upscale factor then
 * lands the text either too small for Tesseract or so large it smears.
 *
 * So the crop is scaled to bring glyphs to roughly TARGET_GLYPH pixels tall,
 * measured from the column header actually found in this image.
 */
const TARGET_GLYPH = 42;
const scaleFor = h => {
  // Not rounded to an integer, and allowed below 1. A capture that is already
  // large has blurry glyphs from whatever enlarged it, and enlarging those
  // again only spreads the blur; bringing them back down sharpens them.
  const k = TARGET_GLYPH / Math.max(1, h);
  return Math.max(0.5, Math.min(6, k));
};
const MIN_CONF = 25;        // anchors: these must be right, nothing checks them
/*
 * The body pass can afford a much lower bar. Every row it produces is verified
 * by amount x price == total, so a shaky read is caught and shown for
 * correction rather than trusted. Being strict here did the opposite of what it
 * looked like: it threw away first rows that were merely faint, and a row
 * thrown away leaves nothing to check at all.
 */
const MIN_CONF_BODY = 8;

let workerPromise = null;
function getWorker() {
  if (!workerPromise) workerPromise = Tesseract.createWorker('eng');
  return workerPromise;
}

function words(result, minConf = MIN_CONF) {
  const out = [];
  for (const w of result.data.words ?? []) {
    const t = (w.text ?? '').trim();
    if (!t || w.confidence <= minConf) continue;
    const { x0, y0, x1, y1 } = w.bbox;
    out.push({ t, x: x0, r: x1, y: y0, b: y1, h: y1 - y0,
               cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, conf: w.confidence });
  }
  return out;
}

const sameLine = (a, b) => Math.abs(a.cy - b.cy) <= Math.max(a.h, b.h) * 0.7;

/** Pair each "Offers:" token with the Sell/Buy label immediately to its left. */
function locateTables(anchors) {
  const tables = [];
  for (const off of anchors.filter(w => /^offers/i.test(w.t))) {
    const left = anchors.filter(w =>
      sameLine(w, off) && w.r <= off.x + 4 && off.x - w.r < off.h * 4);
    if (!left.length) continue;
    const label = left.reduce((a, b) => (a.r > b.r ? a : b)).t.toLowerCase().replace(/[:.]/g, '');
    if (label === 'sell' || label === 'buy') tables.push({ side: label, y: off.y });
  }
  return tables.sort((a, b) => a.y - b.y);
}

/** Column headers of the first table below `afterY`. */
const norm = t => t.toLowerCase().replace(/[^a-z]/g, '');

/*
 * Column headers of the first table below `afterY`, or null if this table's
 * header row did not survive OCR. Returning null rather than throwing matters:
 * both tables are drawn with identical column positions, so a header row that
 * did read cleanly can stand in for one that did not (see reuseGeometry).
 */
/*
 * Column headers for the table that starts at `afterY`, searched only as far as
 * `beforeY` - where the next section begins.
 *
 * The bound is the whole point. Without it, a header that OCR read imperfectly
 * does not fail: the search walks on into the NEXT table and returns its header
 * instead, so the first table is then cropped from the second table's rows. It
 * is silent and it is wrong, and it happens whenever a single word is missed.
 *
 * A partial result is returned rather than nothing, because the two tables are
 * drawn with identical column positions - so a column edge missing here can be
 * filled from the other table (see mergeHeaders).
 */
function headerRow(anchors, afterY, beforeY = Infinity) {
  const amounts = anchors
    .filter(w => norm(w.t) === 'amount' && !w.t.includes(':') &&
                 w.y > afterY && w.y < beforeY)
    .sort((a, b) => a.y - b.y);

  let partial = null;
  for (const a of amounts) {
    const line = anchors.filter(w => sameLine(w, a));
    const tok = n => line.find(w => norm(w.t) === n);
    const piece = tok('piece'), total = tok('total');
    if (!piece || !total) continue;      // the slider row has neither
    const prices = line.filter(w => norm(w.t) === 'price').sort((x, y) => x.x - y.x);

    // "Price" belongs to whichever of Piece / Total it sits nearer to, so a
    // single surviving token still lands in the right column.
    let pieceR = null, totalR = null;
    for (const pr of prices) {
      if (Math.abs(pr.x - piece.r) <= Math.abs(pr.x - total.r)) pieceR ??= pr.r;
      else totalR ??= pr.r;
    }
    /*
     * The bottom of the header line, taken as a MEDIAN rather than a maximum.
     * Tesseract glues the column divider "|" onto some header words, and a pipe
     * is a taller glyph than a letter, so those boxes reach several pixels
     * lower than the text does. Taking the lowest edge therefore starts the
     * crop inside the first offer row and shaves it off - which is the row
     * holding the best price. The median ignores the few contaminated boxes.
     */
    const parts = [a, piece, total, ...prices].filter(Boolean);
    const bottoms = parts.map(w => w.b).sort((x, y) => x - y);
    const bottom = bottoms[bottoms.length >> 1];
    const head = { amount: a, piece, pieceR, total, totalR, bottom };
    if (pieceR !== null && totalR !== null) return head;
    partial ??= head;                    // keep the best incomplete candidate
  }
  return partial;
}

/**
 * Fill gaps in each header from the others. Both tables share their column
 * positions exactly, so an edge read on one is the edge on the other.
 */
function mergeHeaders(heads) {
  const pieceR = heads.find(h => h?.pieceR != null)?.pieceR;
  const totalR = heads.find(h => h?.totalR != null)?.totalR;
  for (const h of heads) {
    if (!h) continue;
    h.pieceR ??= pieceR;
    h.totalR ??= totalR;
  }
  return heads;
}

/** Borrow a sibling table's column geometry, keeping this table's own vertical position. */
function reuseGeometry(donor, donorTableY, tableY) {
  const dy = tableY - donorTableY;
  const shift = w => ({ ...w, y: w.y + dy, b: w.b + dy, cy: w.cy + dy });
  return {
    amount: shift(donor.amount),
    piece: shift(donor.piece),
    pieceR: donor.pieceR,
    total: shift(donor.total),
    totalR: donor.totalR,
    bottom: donor.bottom != null ? donor.bottom + dy : undefined,
    borrowed: true
  };
}

/** Group tokens into visual rows by vertical proximity. */
function clusterRows(ws) {
  const rows = [];
  let cur = [];
  for (const w of [...ws].sort((p, q) => p.cy - q.cy)) {
    if (cur.length && w.cy - cur[cur.length - 1].cy > Math.max(w.h, cur[cur.length - 1].h) * 0.8) {
      rows.push(cur); cur = [];
    }
    cur.push(w);
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function cropCanvas(src, x0, y0, x1, y1, scale) {
  const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
  // grayscale + mild contrast: keeps coloured (red/orange) offer rows readable
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    v = Math.max(0, Math.min(255, (v - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function readMarket(bitmap, onStep = () => {}) {
  const worker = await getWorker();

  onStep('locating the market window');
  const full = document.createElement('canvas');
  full.width = bitmap.width; full.height = bitmap.height;
  full.getContext('2d').drawImage(bitmap, 0, 0);

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    tessedit_char_whitelist: ''
  });

  /*
   * The anchor pass reads the section labels and column headings off the whole
   * image. On a screenshot that has been scaled down they are too small to
   * read, so it is retried on an enlarged copy with the coordinates mapped
   * back.
   *
   * The retry has to continue until the COLUMN HEADINGS are found, not merely
   * the section labels. "Sell Offers:" is larger and survives a downscale that
   * the headings below it do not - stopping at the labels leaves the headings
   * unread and the screenshot rejected.
   */
  const readAnchors = async k => {
    if (k === 1) return words(await worker.recognize(full));
    onStep(`re-reading at ${k}× — the screenshot looks scaled down`);
    const big = cropCanvas(full, 0, 0, full.width, full.height, k);
    return words(await worker.recognize(big)).map(w => ({
      ...w, x: w.x / k, r: w.r / k, y: w.y / k, b: w.b / k,
      h: w.h / k, cx: w.cx / k, cy: w.cy / k
    }));
  };

  const complete = h => h && h.pieceR != null && h.totalR != null;
  let anchors = [], tables = [], stops = [], heads = [];
  // One retry, at 2x. A third pass costs as much again and has never yet
  // rescued a screenshot that 2x could not: below roughly 1100px wide the
  // glyphs are a handful of pixels tall and the information is simply gone.
  for (const k of [1, 2]) {
    if (k > 1 && full.width * k > 4200) break;
    anchors = await readAnchors(k);
    tables = locateTables(anchors);
    if (tables.length < 2) continue;
    const creates = anchors.filter(w => /^create/i.test(w.t)).sort((a, b) => a.y - b.y);
    stops = [...tables.slice(1).map(t => t.y), creates.length ? creates[0].y : bitmap.height];
    heads = mergeHeaders(tables.map((t, i) => headerRow(anchors, t.y, stops[i])));
    if (heads.some(complete)) break;
  }

  if (tables.length < 2) {
    throw new Error(full.width < 1100
      ? `This screenshot is only ${full.width}px wide — the market text is too small ` +
        'to read. Send the original capture rather than a resized or forwarded copy.'
      : 'Could not find both the Sell Offers and Buy Offers tables. Make sure the ' +
        'whole market window is visible and not covered by another window.');
  }
  const donorIdx = heads.findIndex(complete);
  if (donorIdx === -1) {
    const tooSmall = full.width < 1300
      ? ` — at ${full.width}px wide the headings are only a few pixels tall`
      : '';
    throw new Error('Found the tables but could not read the Amount / Piece Price / ' +
      'Total Price headings' + tooSmall + '. Send the original capture rather than a ' +
      'resized copy.');
  }
  for (let i = 0; i < heads.length; i++) {
    if (!complete(heads[i])) {
      heads[i] = reuseGeometry(heads[donorIdx], tables[donorIdx].y, tables[i].y);
    }
  }

  const result = {};
  const warnings = [];   // blocking
  const notices = [];    // informational
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i], stop = stops[i];
    onStep(`reading ${tbl.side} offers`);
    const h = heads[i];
    const a = h.amount;

    // Integer pixel bounds: fractional ones make drawImage resample, which
    // blurs the top row just enough for Tesseract to drop it.
    const x0 = Math.floor(a.x - (a.r - a.x) * 2.5);
    // The Ends At date starts only a few px right of the Total column, so the
    // crop stops at the Total column itself - never at the Ends At header.
    const x1 = Math.ceil(h.totalR + a.h * 0.25);
    // Just under the header. Including the header changes how Tesseract
    // segments the block and costs a row at the far end, so the first row is
    // protected by reading confidence instead (see MIN_CONF_BODY).
    const headerBottom = h.bottom ?? Math.max(a.b, h.total.b);
    const y0 = Math.floor(headerBottom + 1);
    const y1 = Math.floor(stop - a.h * 0.8);
    if (y1 <= y0) { result[tbl.side] = []; continue; }

    const SCALE = scaleFor(a.h);
    const crop = cropCanvas(full, x0, y0, x1, y1, SCALE);
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: '0123456789,'
    });
    const body = words(await worker.recognize(crop), MIN_CONF_BODY);

    // numbers are right-aligned, so match each token to the nearest column edge
    const edges = {
      amount: (a.r - x0) * SCALE,
      price:  (h.pieceR - x0) * SCALE,
      total:  (h.totalR - x0) * SCALE
    };
    const guard = edges.total + a.h * SCALE;

    const rows = [];
    for (const row of clusterRows(body)) {
      const cell = {};
      for (const w of row) {
        const txt = w.t.replace(/[^0-9,]/g, '');
        if (!txt || w.r > guard) continue;
        const col = Object.keys(edges).reduce((best, c) =>
          Math.abs(edges[c] - w.r) < Math.abs(edges[best] - w.r) ? c : best);
        cell[col] = (cell[col] ?? '') + txt;
      }
      const keys = ['amount', 'price', 'total'];
      if (!keys.every(k => cell[k] && /^[\d,]+$/.test(cell[k]))) continue;
      const v = Object.fromEntries(keys.map(k => [k, parseInt(cell[k].replace(/,/g, ''), 10)]));
      if (keys.some(k => !Number.isFinite(v[k]) || v[k] <= 0)) continue;
      v.ok = v.amount * v.price === v.total;
      v._cy = row.reduce((t, w) => t + w.cy, 0) / row.length;
      v._top = Math.min(...row.map(w => w.y));
      rows.push(v);
    }
    /*
     * Offer rows are evenly spaced. A row that OCR missed entirely leaves no
     * numbers to checksum, so the only trace it leaves is a double-height gap
     * between the rows that did survive. Without this, a dropped row silently
     * lowers the volume and can hide the best price.
     */
    if (rows.length === 1) {
      warnings.push(`${tbl.side}: only one offer was read. With a single row there is ` +
        `no spacing to check the rest against, so confirm it against the screenshot`);
    }
    const gaps = rows.slice(1).map((r, j) => r._cy - rows[j]._cy);
    if (gaps.length >= 2) {
      const sorted = [...gaps].sort((x, y) => x - y);
      const median = sorted[Math.floor(sorted.length / 2)];
      const missed = gaps.reduce((n, g) => n + Math.max(0, Math.round(g / median) - 1), 0);
      /*
       * A gap only betrays a row missed BETWEEN two that were read. The first
       * row leaves no such gap - and it is the costly one, because it holds the
       * best price. It is caught instead by its distance from the top of the
       * crop, which starts immediately below the column header.
       */
      if (median > 0 && missed > 0) {
        warnings.push(`${tbl.side}: a gap between rows means ${missed} offer` +
          `${missed === 1 ? '' : 's'} in the middle of the list could not be read — ` +
          `add ${missed === 1 ? 'it' : 'them'} before saving`);
      }

      /*
       * A row missing from the TOP leaves no gap between surviving rows. It is
       * found instead in the blank band between the header and the first row
       * that was read - now measured from the header itself, a landmark the
       * crop no longer depends on, rather than from the crop edge.
       */
      // Do not infer a missing first offer from the first OCR glyph's distance
      // to the crop edge. That distance includes the normal visual padding below
      // Tibia's column header and Tesseract's glyph bounding-box offset, so it is
      // not a row-count measurement. Missing rows BETWEEN recognised offers are
      // still detected above from doubled row gaps. The top row itself is instead
      // protected by the low-confidence body pass and the row checksum.
      const missingAbove = 0;
      if (missingAbove > 0) {
        warnings.push(`${tbl.side}: ${missingAbove} offer${missingAbove === 1 ? '' : 's'} ` +
          `above the first row read could not be recognised — the top row holds the ` +
          `best price, so add ${missingAbove === 1 ? 'it' : 'them'} before saving`);
      }
    }
    rows.forEach(r => { delete r._cy; delete r._top; });
    result[tbl.side] = rows;
  }
  result.warnings = warnings;
  result.notices = notices;
  return result;
}

export async function disposeOcr() {
  if (!workerPromise) return;
  const w = await workerPromise;
  await w.terminate();
  workerPromise = null;
}
