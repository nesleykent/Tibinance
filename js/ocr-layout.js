// Image geometry is independent of OCR's word segmentation and numeric values.
export function clusterTextRows(words) {
  const heights = words.map(w => w.h).filter(h => h > 0).sort((a,b) => a-b);
  const typical = heights[Math.floor(heights.length/2)] ?? 1;
  const rows = [];
  for (const word of [...words].sort((a,b) => a.cy-b.cy)) {
    // A tall missegmented token must not bridge two otherwise separate lines.
    const row = rows.at(-1);
    const center = row?.reduce((n,w) => n+w.cy,0) / (row?.length ?? 1);
    if (!row || Math.abs(word.cy-center) > typical*0.65) rows.push([word]);
    else row.push(word);
  }
  return rows;
}

const ink = (data, offset) => {
  const r=data[offset],g=data[offset+1],b=data[offset+2];
  return Math.max(r,g,b)>=125 || Math.max(r,g,b)-Math.min(r,g,b)>=40;
};

export function numericTextBands({data,width,height}, edges, top, bottom, glyph) {
  const columns = edges.slice(1).map((right,i) => [Math.ceil(edges[i]+3),Math.floor(right-3)]);
  const bands=[];let active=null;
  for (let y=Math.max(0,Math.floor(top));y<Math.min(height,Math.ceil(bottom));y++) {
    let cells=0;
    for (const [left,right] of columns) {
      let count=0;
      for (let x=Math.max(0,left);x<Math.min(width,right);x++) if(ink(data,(y*width+x)*4))count++;
      // Long horizontal borders and scrollbars are not glyphs.
      if(count>=2 && count<(right-left)*0.65)cells++;
    }
    if(cells>=2) {
      if(active && y-active.bottom<=2)active.bottom=y+1;
      else {active={top:y,bottom:y+1};bands.push(active);}
    }
  }
  return bands.filter(b=>b.bottom-b.top>=Math.max(2,glyph*0.35));
}

export function dateTextRight({data,width,height}, left, top, bottom, glyph) {
  const runs=[];let current=null;
  for(let x=Math.max(0,Math.floor(left));x<width;x++) {
    let count=0;
    for(let y=Math.max(0,Math.floor(top));y<Math.min(height,Math.ceil(bottom));y++) if(ink(data,(y*width+x)*4))count++;
    if(count>0 && count<(bottom-top)*0.9) {
      current??={left:x,right:x,peak:0};current.right=x;current.peak=Math.max(current.peak,count);
    } else if(current){runs.push(current);current=null;}
  }
  if(current)runs.push(current);
  // Isolated antialiased scrollbar/rule pixels can otherwise bridge the
  // whitespace between the date pane and neighbouring game UI.
  let last=null;
  for(const run of runs.filter(r=>r.right-r.left>=1 && r.peak>=2)) {
    if(last!==null && run.left-last>glyph*2.2)break;
    last=run.right;
  }
  return last===null?null:Math.min(width,last+Math.max(3,Math.ceil(glyph*0.5)));
}

export function integerToken(text) {
  const value=String(text).trim();
  if(!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(value))return null;
  const number=Number(value.replaceAll(',',''));
  return Number.isSafeInteger(number)?number:null;
}

export function removeVerticalRules({data,width,height}) {
  for(let x=0;x<width;x++) {
    let foreground=0;
    for(let y=0;y<height;y++)if(ink(data,(y*width+x)*4))foreground++;
    if(foreground<height*0.9)continue;
    const background=[];
    for(let y=0;y<height;y++)for(const nx of [x-2,x+2]) {
      if(nx<0 || nx>=width)continue;
      const offset=(y*width+nx)*4;
      if(!ink(data,offset))background.push(data[offset]);
    }
    background.sort((a,b)=>a-b);
    const value=background[Math.floor(background.length/2)]??65;
    for(let y=0;y<height;y++){const offset=(y*width+x)*4;data[offset]=data[offset+1]=data[offset+2]=value;}
  }
}
