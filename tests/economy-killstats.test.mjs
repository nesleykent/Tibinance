// Kill-statistics partitions are exact and compact; missing days are never filled except by exact recovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBody, decodeBody, packPartition, unpackPartition, missingDates, recoverDay, previousDay, addDays } from '../js/economy-killstats.js';

test('the body round-trips exactly, including large counts and empty days', () => {
  const days = [{ rows: [[5, 3, 0], [0, 2 ** 40, 7], [1599, 0, 2]] }, { rows: [] }, { rows: [[2, 1, 1]] }];
  const back = decodeBody(encodeBody(days), 3);
  assert.deepEqual(back, [[[0, 2 ** 40, 7], [5, 3, 0], [1599, 0, 2]], [], [[2, 1, 1]]]);
  assert.throws(() => encodeBody([{ rows: [[1, -1, 0]] }]), /non-negative integer/);
  assert.throws(() => decodeBody(Uint8Array.from([5]), 1), /truncated/);
  assert.throws(() => decodeBody(Uint8Array.from([0, 0]), 1), /trailing/);
});

test('a partition carries its header and rows', () => {
  const header = { format: 1, world: 'Antica', month: '2025-11', recovered: [], days: [{ date: '2025-11-01', sha256: 'a' }, { date: '2025-11-02', sha256: 'b' }] };
  const { header: h, days } = unpackPartition(packPartition(header, [{ rows: [[1, 2, 3]] }, { rows: [] }]));
  assert.deepEqual(h, header);
  assert.deepEqual(days.map(d => [d.date, d.rows]), [['2025-11-01', [[1, 2, 3]]], ['2025-11-02', []]]);
});

test('dates: the file of a date reports the day before; gaps are listed, never filled', () => {
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.deepEqual(missingDates(['2025-12-03', '2025-12-04', '2025-12-06', '2025-12-09']), ['2025-12-05', '2025-12-07', '2025-12-08']);
  assert.deepEqual(missingDates([]), []);
});

// Seven synthetic days of two races; the weekly counter of the last day is their sum, as upstream.
const day = (k, a, b) => [`2025-11-${String(k).padStart(2, '0')}`, [[1, a, 0], [4, b, 1]].filter(r => r[1] || r[2])];
const week = [day(1, 10, 3), day(2, 11, 0), day(3, 12, 5), day(4, 13, 6), day(5, 14, 7), day(6, 15, 8), day(7, 16, 9)];
const later = { date: '2025-11-07', dayRows: week[6][1], weekRows: [[1, 91, 0], [4, 38, 7]] };

test('one missing day in a week is recovered exactly from the weekly counter', () => {
  const others = new Map(week.filter(([d]) => d !== '2025-11-03'));
  assert.deepEqual(recoverDay('2025-11-03', later, others), [[1, 12, 0], [4, 5, 1]]);
});

test('recovery refuses what it cannot do exactly', () => {
  const others = new Map(week.filter(([d]) => d !== '2025-11-03' && d !== '2025-11-05'));
  assert.equal(recoverDay('2025-11-03', later, others), null, 'two days missing in the window');
  assert.equal(recoverDay('2025-10-20', later, new Map(week)), null, 'outside the window');
  const inconsistent = { ...later, weekRows: [[1, 50, 0], [4, 38, 7]] };
  assert.equal(recoverDay('2025-11-03', inconsistent, new Map(week.filter(([d]) => d !== '2025-11-03'))), null, 'a negative remainder');
});
