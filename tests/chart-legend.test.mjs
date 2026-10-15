import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutLegend,wrapLines} from '../js/chart-legend.js';
test('PNG legends wrap all labels without dropping series or overlapping rows',()=>{
 const entries=Array.from({length:12},(_,i)=>({label:`Series ${i} gold per day`,color:'#2962ff'}));
 const layout=layoutLegend(entries,s=>s.length*7,280);
 assert.equal(layout.items.length,12);assert.ok(layout.height>28);
 for(const item of layout.items){assert.ok(item.x+item.width<=280);assert.ok(item.y+item.height<=layout.height);assert.equal(item.lines.join(' '),item.label);}
 assert.deepEqual(layoutLegend([],s=>s.length,100),{items:[],height:0});
});

test('long export metadata wraps without clipping or dropping characters',()=>{
 const value='https://example.test/'+ 'x'.repeat(160),rows=wrapLines(value,s=>s.length*7,140);
 assert.equal(rows.join(''),value);assert.ok(rows.every(row=>row.length*7<=140));
});
