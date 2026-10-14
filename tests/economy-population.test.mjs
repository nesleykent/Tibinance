// Archived GuildStats series: Berlin labels to UTC across DST, day resolution walking back from the capture, the
// daily average labelled a day late, and original sampling intervals kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { berlinToUtc, parseOnlineCounter } from '../tools/economy/population/wayback_guildstats.mjs';

test('Berlin wall-clock labels convert to UTC through CET and CEST', () => {
  assert.equal(berlinToUtc(2025, 5, 18, 18, 30), '2025-05-18T16:30:00.000Z');
  assert.equal(berlinToUtc(2025, 1, 10, 10, 15), '2025-01-10T09:15:00.000Z');
  assert.equal(berlinToUtc(2025, 3, 30, 1, 45), '2025-03-30T00:45:00.000Z', 'before the switch, CET');
  assert.equal(berlinToUtc(2025, 3, 30, 3, 0), '2025-03-30T01:00:00.000Z', 'after the switch, CEST');
  assert.equal(berlinToUtc(2025, 10, 26, 3, 30), '2025-10-26T02:30:00.000Z', 'after the return, CET');
});

// The four series of a page archived 2025-05-18 16:34:32 UTC (18:34 Berlin), kept as a fixture (chart data only).
const html = readFileSync(new URL('./fixtures/guildstats-online-counter-20250518163432.txt', import.meta.url), 'utf8');
const rows = parseOnlineCounter(html, '2025-05-18T16:34:32Z');
const series = name => rows.filter(r => r.series === name);

test('each series keeps its sampling interval and resolves to instants before the capture', () => {
  assert.deepEqual([series('24-hour').length, series('7-day').length, series('hourly').length, series('daily-average').length], [95, 671, 729, 359]);
  assert.deepEqual([...new Set(series('24-hour').map(r => r.interval))], ['PT15M']);
  assert.deepEqual([...new Set(series('hourly').map(r => r.interval))], ['PT1H']);
  const last = series('24-hour').at(-1);
  assert.equal(last.at, '2025-05-18T16:30:00.000Z');
  assert.ok(rows.every(r => !r.at || r.at <= '2025-05-18T16:34:32Z'), 'nothing after the capture');
  assert.equal(series('24-hour')[0].at, '2025-05-17T16:45:00.000Z', 'the 24-hour window crosses midnight backwards');
  assert.equal(series('7-day')[0].at, '2025-05-11T16:45:00.000Z');
});

test('the server save dip falls at 10:15 Berlin (08:15 UTC in summer), confirming Berlin labels', () => {
  const day = series('7-day').filter(r => r.at.startsWith('2025-05-14'));
  const min = day.reduce((a, r) => (r.value < a.value ? r : a));
  assert.equal(min.at, '2025-05-14T08:15:00.000Z');
});

test('the daily average labelled D is stored as the average of D - 1, with its label kept', () => {
  const d = series('daily-average').find(r => r.label === '2025-05-16');
  assert.equal(d.day, '2025-05-15');
  const hourly = series('hourly').filter(r => r.at >= '2025-05-14T22:00:00.000Z' && r.at < '2025-05-15T22:00:00.000Z');
  const mean = hourly.reduce((s, r) => s + r.value, 0) / hourly.length;
  assert.ok(Math.abs(mean / d.value - 1) < 0.002, `${mean} vs ${d.value}`);
});

import { parseWorlds } from '../tools/economy/population/import_tibiavip_snapshot.mjs';
test('a TibiaVIP worlds page keeps its own meanings and every listed world', () => {
  const text = 'Name Online Total Guilds Location Pvp Type\n96 worlds found.\nAntica 1,013 319,190 113 Europe Open PvP\nGladibra 24 163,790 3 South America Retro Open PvP\nZunera 12 75,915 2 North America Hardcore PvP\n';
  const { rows, stated } = parseWorlds(text);
  assert.equal(stated, 96);
  assert.deepEqual(rows[1], { world: 'Gladibra', online: 24, knownCharacters: 163790, guilds: 3, location: 'South America', pvpType: 'Retro Open PvP' });
  assert.equal(rows.length, 3);
});
