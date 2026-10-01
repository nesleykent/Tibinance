// Scope item recognition to the Items list and require visible row selection.
const norm = t => String(t).toLowerCase().replace(/[^a-z]/g, '');
const median = a => [...a].sort((x,y)=>x-y)[a.length>>1];
export function itemRegion(anchors, tables, {allowMissingSearch=false,height}={}) {
  if (!tables.length || tables.some(t=>!Number.isFinite(t.x))) return null;
  const right = Math.min(...tables.map(t=>t.x));
  const first = Math.min(...tables.map(t=>t.y));
  const buy = tables.find(t=>t.side==='buy');
  const glyphs=tables.map(t=>t.glyph).filter(Number.isFinite);
  const near=anchors.filter(w=>norm(w.t)==='items' && w.x<right && w.y>first
    && (!buy || Math.abs(w.y-buy.y)<(glyphs.length?median(glyphs):w.h)*6));
  if (near.length!==1) return null;
  const items=near[0];
  const search = anchors.filter(w=>norm(w.t)==='search' && w.x>=items.x && w.x<right && w.y>items.b)
    .sort((a,b)=>a.y-b.y)[0];
  if (!search && !allowMissingSearch) return null;
  const g = glyphs.length?median(glyphs):items.h;
  const region = {x:items.x,r:right-g*2.5,y:items.b+g*.5,b:search?search.y-g*1.4:height,glyph:g};
  return region.r>region.x && region.b>region.y ? region : null;
}
export function selectionBand(region, luminance) {
  if (!region) return null;
  const levels=[];
  const left=region.x+region.glyph*3.4, right=region.r-region.glyph*.5;
  if(right-left<region.glyph*2)return null;
  for(let y=Math.ceil(region.y);y<region.b;y++){
    const pixels=[];
    for(let x=left;x<right;x+=2)pixels.push(luminance(x,y));
    const level=median(pixels);
    levels.push({y,level:Math.round(level),flat:pixels.filter(p=>Math.abs(p-level)<=6).length/pixels.length>=.7});
  }
  const counts=new Map();
  for(const r of levels.filter(r=>r.flat))counts.set(r.level,(counts.get(r.level)??0)+1);
  if(!counts.size)return null;
  const base=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
  const bands=[];let start=null;
  for(const r of levels){
    if(r.flat && r.level>=base+12){if(start===null)start=r.y;}
    else if(start!==null){bands.push({top:start,bottom:r.y});start=null;}
  }
  if(start!==null)bands.push({top:start,bottom:Math.ceil(region.b)});
  const joined=[];
  for(const band of bands){
    const last=joined.at(-1);
    if(last && band.top-last.bottom<=region.glyph*1.2)last.bottom=band.bottom;
    else joined.push(band);
  }
  const valid=joined.filter(b=>b.bottom-b.top>=region.glyph*1.5 && b.bottom-b.top<=region.glyph*5);
  return valid.length===1?valid[0]:null;
}
export function selectedItem(anchors, region, luminance) {
  const unknown = {status:'unconfirmed',text:null};
  const band=selectionBand(region,luminance);
  if(!band)return unknown;
  // The item icon is square; row height is more stable than OCR glyph boxes.
  const left=region.x+(band.bottom-band.top)*1.05;
  const row=anchors.filter(w=>w.x>=left && w.r<=region.r && w.cy>=band.top && w.cy<band.bottom).sort((a,b)=>a.x-b.x);
  if(!row.length || row.some(w=>w.conf<70) || row.some(w=>Math.abs(w.cy-row[0].cy)>region.glyph*.7))return unknown;
  const text=row.map(w=>w.t).join(' ').trim();
  if(!/^[A-Za-z][A-Za-z '\-]*$/.test(text))return unknown;
  if(text.toLowerCase()!=='tibia coins' && text.split(/\s+/).length<=2 && (/\bcoins?\b/i.test(text) || /^tibia/i.test(text)))return unknown;
  return {status:text.toLowerCase()==='tibia coins'?'tibia_coins':'other_item',text};
}
