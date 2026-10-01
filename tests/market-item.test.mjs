import {test} from 'node:test';
import assert from 'node:assert/strict';
import {itemRegion, selectedItem} from '../js/market-item.js';
const word=(t,x,y,conf=95)=>({t,x,r:x+t.length*5,y,b:y+8,h:8,cy:y+4,conf});
const anchors=[word('Items:',20,90),word('Search:',55,300),word('Tibia',60,120),word('Coins',90,120)];
const tables=[{side:'sell',x:180,y:20},{side:'buy',x:180,y:80}];
const region={x:20,r:160,y:102,b:288.8,glyph:8};
const pixel=(_x,y)=>y>=112&&y<=140?90:64;
test('missing Search permits an OCR crop but never selection proof',()=>{
 const missing=anchors.filter(w=>w.t!=='Search:');
 assert.equal(itemRegion(missing,tables),null);
 assert.equal(itemRegion(missing,tables,{allowMissingSearch:true,height:400}).b,400);
 assert.deepEqual(itemRegion([...missing,word('Search:',55,300)],tables),region);
});
test('accepts Tibia Coins only in the selected Items row',()=>{
 assert.deepEqual(itemRegion(anchors,tables),region);
 assert.equal(selectedItem(anchors,region,pixel).status,'tibia_coins');
});
test('Tibia Coins in search or an unselected row does not qualify',()=>{
 const a=[...anchors,word('Mana',60,160),word('Potion',90,160),word('Tibia',60,310),word('Coins',90,310)];
 assert.equal(selectedItem(a,region,(_x,y)=>y>=152&&y<=180?90:64).status,'other_item');
 assert.equal(selectedItem(anchors,region,()=>64).status,'unconfirmed');
});
test('missing anchors, faint text and multiple highlighted rows require review',()=>{
 assert.equal(itemRegion([],tables),null);
 assert.equal(selectedItem(anchors.map(w=>({...w,conf:20})),region,pixel).status,'unconfirmed');
 const a=[...anchors,word('Mana',60,160),word('Potion',90,160)];
 assert.equal(selectedItem(a,region,(_x,y)=>(y>=112&&y<=140)||(y>=152&&y<=180)?90:64).status,'unconfirmed');
});
test('clipped coin label is uncertain rather than a different confirmed item',()=>{
 const a=anchors.map(w=>w.t==='Tibia'?{...w,t:'ia'}:w);
 assert.equal(selectedItem(a,region,pixel).status,'unconfirmed');
});
