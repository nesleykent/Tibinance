import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clusterTextRows,numericTextBands,dateTextRight,integerToken,removeVerticalRules} from '../js/ocr-layout.js';

test('a tall OCR box cannot chain two adjacent offer rows together',()=>{
  const word=(t,cy,h=44)=>({t,cy,h,y:cy-h/2,b:cy+h/2});
  const rows=clusterTextRows([word('50',56,36),word('244,500',59,56),
    word('99',117,94),word('2,225',147,54),word('44,889',142,44),word('878,025',142,44)]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0].map(w=>w.t),['50','244,500']);
  assert.ok(rows[1].some(w=>w.t==='2,225'));
});

function image(width=240,height=90) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set([65,65,65,255],i);
  return {data,width,height};
}
function rect(im,left,top,right,bottom,color=[160,160,160,255]) {
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)im.data.set(color,(y*im.width+x)*4);
}

test('pixel bands retain dim and red rows, ignore borders, and do not invent intermediate rows',()=>{
  const im=image(),edges=[0,60,120,180];
  for(const top of [12,28,44])for(const left of [30,90,150])rect(im,left,top,left+12,top+7);
  for(const left of [30,150])rect(im,left,60,left+12,67,[220,70,70,255]);
  for(const x of [60,120,180])rect(im,x,0,x+1,80,[190,190,190,255]);
  rect(im,0,78,180,80,[170,170,170,255]);
  assert.deepEqual(numericTextBands(im,edges,0,85,8),[
    {top:12,bottom:19},{top:28,bottom:35},{top:44,bottom:51},{top:60,bottom:67}]);
});

test('no numerical ink returns no rows rather than fabricated empty offers',()=>{
  assert.deepEqual(numericTextBands(image(),[0,60,120,180],0,80,8),[]);
});

test('expiry bounds include the final digit and stop before unrelated sidebar text',()=>{
  const im=image();
  for(const left of [12,22,32,42,62,72,82])rect(im,left,20,left+6,27);
  rect(im,130,20,155,27);
  rect(im,95,18,96,30,[190,190,190,255]);
  assert.equal(dateTextRight(im,10,18,30,10),92);
  assert.equal(dateTextRight(im,10,40,47,10),null);
});

test('numeric cells require complete safe integers, without repairing or concatenating malformed punctuation',()=>{
  for(const [text,expected] of [['1',1],['64,000',64000],['2,528,769,625',2528769625],['0',0]])
    assert.equal(integerToken(text),expected);
  for(const text of ['', '43,99O','2,244,50099,878,025','2,24,500','1.0','-1','9007199254740992'])
    assert.equal(integerToken(text),null);
});

test('table rules are removed while short digit stems remain intact',()=>{
  const im=image(60,20);
  rect(im,20,0,21,20,[180,180,180,255]);
  rect(im,40,5,42,14,[170,170,170,255]);
  removeVerticalRules(im);
  assert.equal(im.data[(10*60+20)*4],65);
  assert.equal(im.data[(10*60+40)*4],170);
});
