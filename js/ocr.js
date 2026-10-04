import { parseStatisticsText } from './statistics.js';
import { clusterTextRows, numericTextBands, dateTextRight, integerToken, removeVerticalRules } from './ocr-layout.js';
import { extractEndsAt } from './offers.js';
import { itemRegion, selectedItem, selectionBand } from './market-item.js';
/*
 * Layout-aware reader for the Tibia market window.
 *
 * Nothing is hardcoded to a resolution: the Sell/Buy sections and the
 * Amount / Piece Price / Total Price columns are located by OCR, and every
 * crop is derived from those positions. Works at any client size or UI scale.
 *
 * Pass 1  sparse-text OCR over the whole image -> anchor words
 * Pass 2  detect physical numeric rows, then read each row and expiry twice
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
 * measured from the visible text bands and labels actually found in this image.
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
    const labelWord = left.reduce((a, b) => (a.r > b.r ? a : b));
    const label = labelWord.t.toLowerCase().replace(/[:.]/g, '');
    if (label === 'sell' || label === 'buy') tables.push({ side: label, x: labelWord.x, y: off.y, glyph: labelWord.h });
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
    const ends = tok('ends');
    const head = { amount: a, piece, pieceR, total, totalR, bottom, endsX: ends?.x };
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
  const endsX = heads.find(h => h?.endsX != null)?.endsX;
  for (const h of heads) {
    if (!h) continue;
    h.pieceR ??= pieceR;
    h.totalR ??= totalR;
    h.endsX ??= endsX;
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
    endsX: donor.endsX,
    bottom: donor.bottom != null ? donor.bottom + dy : undefined,
    borrowed: true
  };
}

/** Group tokens into visual rows by vertical proximity. */
const clusterRows = clusterTextRows;

function cropCanvas(src, x0, y0, x1, y1, scale, adjustContrast = true, smoothing = true) {
  const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.imageSmoothingEnabled = smoothing;
  ctx.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
  if (!adjustContrast && smoothing) return c;
  // grayscale + mild contrast: keeps coloured (red/orange) offer rows readable
  const img = ctx.getImageData(0, 0, c.width, c.height);
  if (!smoothing) removeVerticalRules(img);
  const d = img.data;
  for (let i = 0; adjustContrast && i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    v = Math.max(0, Math.min(255, (v - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function verifyMarket(bitmap, onStep = () => {}) {
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
    onStep(`re-reading at ${k}×; the screenshot looks scaled down`);
    const big = cropCanvas(full, 0, 0, full.width, full.height, k);
    return words(await worker.recognize(big)).map(w => ({
      ...w, x: w.x / k, r: w.r / k, y: w.y / k, b: w.b / k,
      h: w.h / k, cx: w.cx / k, cy: w.cy / k
    }));
  };

  const complete = h => h && h.pieceR != null && h.totalR != null;
  let anchors = [], tables = [], stops = [], heads = [], details = null;
  // One retry, at 2x. A third pass costs as much again and has never yet
  // rescued a screenshot that 2x could not: below roughly 1100px wide the
  // glyphs are a handful of pixels tall and the information is simply gone.
  for (const k of [1, 2]) {
    if (k > 1 && full.width * k > 4200) break;
    anchors = await readAnchors(k);
    tables = locateTables(anchors);
    const title = anchors.find(w => norm(w.t) === 'statistics');
    const detail = anchors.find(w => norm(w.t) === 'details' &&
      (!title || (w.x >= title.x-title.h*2 && w.y < title.y)) &&
      anchors.some(p => ['description','weight'].includes(norm(p.t)) && p.y>w.y && p.x>=w.x-w.h*2 && p.y<w.y+w.h*12));
    const market = anchors.find(w => norm(w.t) === 'market' && detail && w.y < detail.y && Math.abs(w.x-detail.x)<full.width/2);
    if (detail && market) {
      details = {title,detail};
      break;
    }
    if (tables.length !== 2 || new Set(tables.map(t => t.side)).size !== 2) continue;
    const creates = anchors.filter(w => /^create/i.test(w.t)).sort((a, b) => a.y - b.y);
    stops = [...tables.slice(1).map(t => t.y), creates.length ? creates[0].y : bitmap.height];
    heads = mergeHeaders(tables.map((t, i) => headerRow(anchors, t.y, stops[i])));
    if (heads.some(complete)) break;
  }

  if (details) {
    // Sidebar geometry shares the Details/Statistics pane's left edge. Item
    // selection still requires highlighted pixels and the exact coin label.
    return {full,worker,anchors,viewType:'statistics', tables:[{x:(details.title ?? details.detail).x,y:details.detail.y,glyph:details.detail.h}]};
  }
  if (tables.length !== 2 || new Set(tables.map(t => t.side)).size !== 2) {
    throw new Error(full.width < 1100
      ? `This screenshot is only ${full.width}px wide; the market text is too small ` +
        'to read. Send the original capture rather than a resized or forwarded copy.'
      : 'Could not find both the Sell Offers and Buy Offers tables. Make sure the ' +
        'whole market window is visible and not covered by another window.');
  }
  const donorIdx = heads.findIndex(complete);
  if (donorIdx === -1) {
    const tooSmall = full.width < 1300
      ? `; at ${full.width}px wide the headings are only a few pixels tall`
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

  return { full, worker, anchors, tables, stops, heads, viewType:'offers' };
}

export async function verifyTibiaCoins(context, onStep = () => {}) {
  const { full, worker, tables } = context;
  let { anchors } = context;
  onStep('checking the selected Market item');
  let region = itemRegion(anchors, tables);
  if (!region) {
    // If the whole-screen pass lost Items itself, still read the sidebar beside
    // the verified Market table. This is only an OCR aid: itemRegion below must
    // recover the actual Items/Search labels before selection can be proved.
    const glyphs = tables.map(t => t.glyph).filter(g => Number.isFinite(g) && g > 0);
    const g = glyphs.length ? Math.max(...glyphs) : null;
    const right = Math.min(...tables.map(t => t.x));
    const section = tables.find(t => t.side === 'buy') ?? tables[0];
    const broad = itemRegion(anchors, tables, { allowMissingSearch: true, height: full.height })
      ?? (g ? {x:Math.max(0,right-g*30), r:right-g*2.5,
        y:Math.max(0,section.y-g*8), b:full.height, glyph:g} : null);
    if (broad) {
      const scale = scaleFor(broad.glyph);
      // Include the Items heading itself and omit the unrelated chat below the
      // sidebar. A headerless tall crop can lose Search in sparse segmentation.
      const y = Math.max(0,broad.y-broad.glyph*3);
      const bottom = Math.min(broad.b,broad.y+broad.glyph*35);
      // Preserve original sidebar colors: contrast preprocessing can erase the
      // faint Search heading even while the item name survives.
      const sidebar = cropCanvas(full, broad.x, y, broad.r, bottom, scale, false);
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        tessedit_char_whitelist: '' });
      const recovered = words(await worker.recognize(sidebar), 0).map(w => ({ ...w,
        x: broad.x + w.x / scale, r: broad.x + w.r / scale,
        y: y + w.y / scale, b: y + w.b / scale,
        h: w.h / scale, cy: y + w.cy / scale, cx: broad.x + w.cx / scale }));
      anchors = [...anchors, ...recovered.filter(w => !anchors.some(p => norm(p.t) === norm(w.t)
        && Math.abs(p.cx - w.cx) <= Math.max(p.h, w.h) * 1.5
        && Math.abs(p.cy - w.cy) <= Math.max(p.h, w.h) * 1.5))];
      region = itemRegion(anchors, tables);
    }
  }
  const pixels = full.getContext('2d').getImageData(0, 0, full.width, full.height).data;
  const luminance = (x, y) => {
    const i = (Math.floor(y) * full.width + Math.floor(x)) * 4;
    return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
  };
  let item = selectedItem(anchors, region, luminance);
  const band = selectionBand(region, luminance);
  // Whole-screen OCR can confidently read only "Cains"/"coms" from the
  // faint Tibia Coins row. Confirm any nonmatching label in its selected-row
  // crop before rejecting it as another item; exact selection proof remains.
  if (item.status !== 'tibia_coins' && band) {
    const scale = scaleFor(region.glyph);
    const left = region.x + (band.bottom - band.top) * 1.05;
    const top = band.top + 1;
    const crop = cropCanvas(full, left, top, region.r - 2, band.bottom - 1, scale);
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      tessedit_char_whitelist: '' });
    const itemWords = words(await worker.recognize(crop), 0).map(w => ({ ...w,
      x: left + w.x / scale, r: left + w.r / scale,
      y: top + w.y / scale, b: top + w.b / scale,
      h: w.h / scale, cy: top + w.cy / scale }));
    item = selectedItem(itemWords, region, luminance);
  }
  if (item.status !== 'tibia_coins') {
    const error = new Error(item.status === 'other_item'
      ? 'Only Tibia Coins screenshots can be saved.'
      : 'Could not confirm Tibia Coins in the selected Items row. Review the screenshot and submit a capture showing the selected item clearly.');
    error.code = item.status === 'other_item' ? 'other_item' : 'unconfirmed_item';
    throw error;
  }
  context.anchors = anchors;
  return { status: 'tibia_coins' };
}

export async function extractMarketOffers(context, onStep = () => {}) {
  const {full,worker,tables,stops,heads}=context;
  const result={warnings:[],notices:[]};
  const pixels=full.getContext('2d',{willReadFrequently:true}).getImageData(0,0,full.width,full.height);
  const keys=['amount','price','total'];
  for(let i=0;i<tables.length;i++) {
    const table=tables[i],head=heads[i],a=head.amount;
    onStep(`reading ${table.side} offers`);
    const x0=Math.floor(a.x-(a.r-a.x)*2.5),x1=Math.ceil(head.totalR+a.h*0.25);
    const y0=Math.floor((head.bottom??Math.max(a.b,head.total.b))+1);
    const y1=Math.floor(stops[i]-a.h*0.8);
    const edges=[x0,a.r,head.pieceR,head.totalR];
    const bands=numericTextBands(pixels,edges,y0,y1,a.h);
    const rows=[];
    if(!bands.length)result.warnings.push(`${table.side}: visible numeric rows could not be located`);
    const recognize=async(canvas,psm,whitelist)=>{
      await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:whitelist});
      return worker.recognize(canvas);
    };
    const numericReading=async(top,bottom,glyph,target,contrast)=>{
      const scale=target/Math.max(1,glyph);
      const crop=cropCanvas(full,x0,top,x1,bottom,scale,contrast,false);
      const read=await recognize(crop,Tesseract.PSM.SINGLE_LINE,'0123456789,');
      const tokens=read.data.text.trim().split(/\s+/);
      if(tokens.length===3) {
        const values=Object.fromEntries(keys.map((k,j)=>[k,integerToken(tokens[j])]));
        if(keys.every(k=>values[k]>0) && values.amount*values.price===values.total)
          return {...values,ok:true};
      }
      const cell={};
      const right=Object.fromEntries(keys.map((k,j)=>[k,(edges[j+1]-x0)*scale]));
      for(const w of words(read,MIN_CONF_BODY).sort((a,b)=>a.x-b.x)) {
        if(w.r>right.total+glyph*scale)continue;
        const col=keys.reduce((best,k)=>Math.abs(right[k]-w.r)<Math.abs(right[best]-w.r)?k:best);
        cell[col]=(cell[col]??'')+w.t;
      }
      const values=Object.fromEntries(keys.map(k=>[k,integerToken(cell[k]??'')]));
      return {...values,ok:keys.every(k=>values[k]>0)&&values.amount*values.price===values.total};
    };
    for(let j=0;j<bands.length;j++) {
      const band=bands[j],glyph=band.bottom-band.top;
      const padding=Math.max(2,Math.ceil(glyph*0.3));
      const top=Math.max(y0,Math.floor(Math.max(band.top-padding,j?(bands[j-1].bottom+band.top)/2:y0)));
      const bottom=Math.min(y1,Math.ceil(Math.min(band.bottom+padding,j+1<bands.length?(band.bottom+bands[j+1].top)/2:y1)));
      // Each image band is a physical row. OCR cannot merge adjacent rows,
      // fabricate an intermediate row, or shift subsequent row indices.
      const reads=[await numericReading(top,bottom,glyph,42,true),
        await numericReading(top,bottom,glyph,56,false)];
      const valid=reads.filter(r=>r.ok);
      const fingerprints=new Set(valid.map(r=>JSON.stringify(keys.map(k=>r[k]))));
      let row=fingerprints.size===1?valid[0]:null;
      if(!row) {
        // Independently read the individual cells when a whole-row pass is
        // incomplete or checksum-valid readings disagree. No digit repairs.
        const cells={};
        for(let k=0;k<keys.length;k++) {
          const left=k===0?x0:edges[k]+glyph*0.25;
          const right=edges[k+1]+glyph*0.25;
          const crop=cropCanvas(full,left,top,right,bottom,56/Math.max(1,glyph),true,false);
          const read=await recognize(crop,Tesseract.PSM.SINGLE_LINE,'0123456789,');
          cells[keys[k]]=integerToken(read.data.text);
        }
        const ok=keys.every(k=>cells[k]>0)&&cells.amount*cells.price===cells.total;
        // A third reading must confirm a conflicting candidate; it cannot
        // overrule two complete, incompatible readings with a new guess.
        row=ok && (!valid.length || valid.some(r=>keys.every(k=>r[k]===cells[k])))?{...cells,ok:true}:null;
      }
      if(!row) {
        row={...(reads.find(r=>keys.some(k=>r[k]!=null))??reads[0]),ok:false};
        result.warnings.push(`${table.side}: numeric values in row ${j+1} require review`);
      }
      const dateLeft=Math.ceil(head.totalR+a.h*0.5);
      const dateRight=dateTextRight(pixels,dateLeft,top,bottom,glyph);
      const dates=[];
      if(dateRight!==null) {
        for(const [target,contrast] of [[42,true],[56,false]]) {
          const crop=cropCanvas(full,dateLeft,top,dateRight,bottom,target/Math.max(1,glyph),contrast,false);
          const read=await recognize(crop,Tesseract.PSM.SINGLE_LINE,'0123456789-:, ');
          dates.push(extractEndsAt(read.data.text));
        }
        if(!dates[0] || dates[0]!==dates[1]) {
          const crop=cropCanvas(full,dateLeft,top,dateRight,bottom,48/Math.max(1,glyph),true,false);
          const read=await recognize(crop,Tesseract.PSM.SINGLE_BLOCK,'0123456789-:, ');
          dates.push(extractEndsAt(read.data.text));
        }
      }
      const agreed=dates.filter(v=>v && dates.filter(d=>d===v).length>=2);
      row.endsAt=agreed[0]??null;
      if(!row.endsAt)result.warnings.push(`${table.side}: expiry in row ${j+1} requires review`);
      rows.push(row);
    }
    result[table.side]=rows;
  }
  return result;
}

// Restrict OCR to the Statistics panel located by its visible heading. This
// Details flow supplies the same verified Market/item context as Offers;
// individual-offer tables are never required for this view.
export async function extractMarketStatistics(context, onStep = () => {}) {
  const { full, worker, anchors } = context;
  onStep('reading 30-day Statistics');
  const pane = context.tables[0];
  let titles = anchors.filter(w => norm(w.t) === 'statistics' &&
    Math.abs(w.x-pane.x)<pane.glyph*4 && w.y>pane.y);
  if (!titles.length) {
    // Details can be verified while the whole-image pass misses its Statistics
    // heading. Re-read the heading above the first labelled side in this pane.
    const firstSide = locateTables(anchors).filter(w => w.y>pane.y &&
      Math.abs(w.x-pane.x)<pane.glyph*4).sort((a,b)=>a.y-b.y)[0];
    if (firstSide) {
      const x0=Math.max(0,Math.floor(pane.x-pane.glyph));
      const y0=Math.max(pane.y,Math.floor(firstSide.y-pane.glyph*6));
      const scale=scaleFor(pane.glyph);
      const crop=cropCanvas(full,x0,y0,Math.min(full.width,pane.x+pane.glyph*24),firstSide.y,scale);
      await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,tessedit_char_whitelist:''});
      titles=words(await worker.recognize(crop)).filter(w=>norm(w.t)==='statistics').map(w=>({...w,
        x:x0+w.x/scale,r:x0+w.r/scale,y:y0+w.y/scale,b:y0+w.b/scale,h:w.h/scale}));
    }
  }
  if (titles.length !== 1) return null;
  const title = titles[0];
  // A divider attached to the heading can double its OCR box height. Measure
  // the font from nearby field/side labels, so the crop stays inside the pane.
  const labels=new Set(['buy','sell','offers','number','transactions','highest','average','lowest','price']);
  const heights=anchors.filter(w=>labels.has(norm(w.t)) && w.y>title.y &&
    w.y<title.y+pane.glyph*24 && w.x>=title.x-pane.glyph &&
    w.x<title.x+pane.glyph*24).map(w=>w.h).sort((a,b)=>a-b);
  const glyph=heights[Math.floor(heights.length/2)] ?? pane.glyph;
  const scale = scaleFor(glyph);
  const x0 = Math.floor(title.x), y0 = Math.floor(title.y);
  // The two stacked groups each have a heading and four fixed text rows.
  // Bounds scale with the measured font, never screenshot resolution.
  const x1 = Math.min(full.width, Math.ceil(x0 + glyph * 48));
  const y1 = Math.min(full.height, Math.ceil(y0 + glyph * 24));
  const panel = cropCanvas(full, x0, y0, x1, y1, scale);
  const readings = [];
  for (const psm of [Tesseract.PSM.SINGLE_BLOCK, Tesseract.PSM.SPARSE_TEXT]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: '' });
    const read = await worker.recognize(panel);
    // Geometry reconstructs labelled lines even when SPARSE_TEXT splits each
    // line into separate text paragraphs.
    const tokens = words(read, 0).map(w => /^\d[\d,]*$/.test(w.t) && w.conf < 70 ? {...w,t:'unreadable'} : w);
    const lines = clusterRows(tokens).map(line => line.sort((a,b) => a.x-b.x).map(w => w.t).join(' '));
    // The full-image pass already identified this Statistics pane. Requiring
    // its title again discards all eight readable values when WebKit's crop
    // resampling damages that heading. Field/side labels and numbers remain
    // mandatory; this does not accept unlabelled values or guessed digits.
    readings.push(parseStatisticsText(lines.join('\n'), {verifiedBlock:true}));
  }
  // No arithmetic checksum exists here. Conflicting passes require review;
  // one readable pass can fill an unread field, never overrule a disagreement.
  const value = {buy:{}, sell:{}};
  for (const side of ['buy','sell']) for (const key of ['transactions','highestPrice','averagePrice','lowestPrice']) {
    const candidates = readings.map(r => r?.[side]?.[key]).filter(v => Number.isSafeInteger(v));
    value[side][key] = candidates.length && new Set(candidates).size === 1 ? candidates[0] : null;
  }
  return value;
}

export async function disposeOcr() {
  const pending=workerPromise;
  workerPromise = null;
  if (!pending) return;
  const w = await pending;
  await w.terminate();
}
