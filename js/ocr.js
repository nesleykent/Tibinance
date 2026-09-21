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
const SCALE = 3;          // upscale factor for the body crops
const MIN_CONF = 25;

let workerPromise = null;
function getWorker() {
  if (!workerPromise) workerPromise = Tesseract.createWorker('eng');
  return workerPromise;
}

function words(result) {
  const out = [];
  for (const w of result.data.words ?? []) {
    const t = (w.text ?? '').trim();
    if (!t || w.confidence <= MIN_CONF) continue;
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
function headerRow(anchors, afterY) {
  const amounts = anchors.filter(w => w.t === 'Amount' && w.y > afterY).sort((a, b) => a.y - b.y);
  if (!amounts.length) throw new Error('Could not find the "Amount" column header');
  const a = amounts[0];
  const line = anchors.filter(w => sameLine(w, a));
  const tok = n => line.find(w => w.t.toLowerCase() === n);
  const piece = tok('piece'), total = tok('total');
  const prices = line.filter(w => w.t.toLowerCase() === 'price').sort((x, y) => x.x - y.x);
  if (!piece || !total || prices.length < 2) {
    throw new Error('Could not identify the Piece Price / Total Price columns');
  }
  return { amount: a, piece, pieceR: prices[0].r, total, totalR: prices[1].r };
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
  const anchors = words(await worker.recognize(full));

  const tables = locateTables(anchors);
  if (tables.length < 2) {
    throw new Error('Could not find both the Sell Offers and Buy Offers tables. ' +
                    'Make sure the whole market window is visible in the screenshot.');
  }
  const creates = anchors.filter(w => /^create/i.test(w.t)).sort((a, b) => a.y - b.y);
  const stops = [...tables.slice(1).map(t => t.y), creates.length ? creates[0].y : bitmap.height];

  const result = {};
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i], stop = stops[i];
    onStep(`reading ${tbl.side} offers`);
    const h = headerRow(anchors, tbl.y);
    const a = h.amount;

    // Integer pixel bounds: fractional ones make drawImage resample, which
    // blurs the top row just enough for Tesseract to drop it.
    const x0 = Math.floor(a.x - (a.r - a.x) * 2.5);
    // The Ends At date starts only a few px right of the Total column, so the
    // crop stops at the Total column itself - never at the Ends At header.
    const x1 = Math.ceil(h.totalR + a.h * 0.25);
    // Start just below the header: the first offer row begins almost
    // immediately after it, so generous padding here clips that row away.
    const y0 = Math.floor(Math.max(a.b, h.total.b) + 1);
    const y1 = Math.floor(stop - a.h * 0.8);
    if (y1 <= y0) { result[tbl.side] = []; continue; }

    const crop = cropCanvas(full, x0, y0, x1, y1, SCALE);
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: '0123456789,'
    });
    const body = words(await worker.recognize(crop));

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
      rows.push(v);
    }
    result[tbl.side] = rows;
  }
  return result;
}

export async function disposeOcr() {
  if (!workerPromise) return;
  const w = await workerPromise;
  await w.terminate();
  workerPromise = null;
}
