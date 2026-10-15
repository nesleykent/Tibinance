import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodLayers } from '../js/economy-chart.js';
import { tokenPrice, TOKEN_PROFILE } from '../js/tibia-token.js';

const hidden = 'rgba(0,0,0,0)';
const rows = values => values.map((value, time) => ({ time: String(time), value }));

test('period layers preserve zero, gaps, adjacent segments, leading/trailing whitespace and input order', () => {
  const input = rows([null, 0, 2, null, null, 5, null]);
  const before = structuredClone(input);
  assert.deepEqual(periodLayers(input), {
    solid: [{time:'0'}, {time:'1',value:0}, {time:'2',value:2,color:hidden}, {time:'3'}, {time:'4'}, {time:'5',value:5,color:hidden}, {time:'6'}],
    dotted: [{time:'0'}, {time:'1',value:0,color:hidden}, {time:'2',value:2}, {time:'3'}, {time:'4'}, {time:'5',value:5,color:hidden}, {time:'6'}],
    points: [{time:'1',value:0}, {time:'2',value:2}, {time:'5',value:5}]
  });
  assert.deepEqual(input, before);
  assert.deepEqual(periodLayers([]), {solid:[],dotted:[],points:[]});
  assert.deepEqual(periodLayers(rows([null,null])).points, []);
  assert.deepEqual(periodLayers(rows([7])).dotted, [{time:'0',value:7,color:hidden}]);
});

test('period segmentation reads long histories in linear work without repeated suffix copies', () => {
  let reads = 0;
  const input = rows(Array.from({length:500}, (_, i) => i % 3 ? null : i));
  const observed = new Proxy(input, { get(target, key, receiver) {
    if (/^\d+$/.test(String(key))) reads++;
    return Reflect.get(target, key, receiver);
  } });
  const layers = periodLayers(observed);
  assert.equal(layers.points.length, 167);
  assert.ok(reads < input.length * 10, `expected linear work, got ${reads} row reads`);
});

test('token formatting and price movement agree for zero, tiny, rounded and negative values', () => {
  for (const [value, expected] of [[0,'$0.00000'],[0.00001,'$0.00001'],[0.0361,'$0.03610'],[-0.0361,'-$0.03610'],[1.234567,'$1.23457']]) {
    assert.equal(tokenPrice(value), expected);
  }
  assert.equal(TOKEN_PROFILE.priceFormat.minMove, 1 / 100000);
});
