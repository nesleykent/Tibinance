import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIDDLE_DOT = String.fromCodePoint(0xb7);

// Project-wide copy rule: Tibinance never uses the middle dot (U+00B7) as a separator, in pages,
// generated text, data labels, scripts or documentation. Items are separated by spacing, layout or
// ordinary punctuation instead. The detectors in tests name the character by escape only.
test('no file in the repository uses the middle dot', async () => {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {cwd: root}).toString().split('\0').filter(Boolean);
  const offenders = [];
  for (const file of files.filter(f => !/\.(gz|png|jpe?g|webp|gif|ico|pdf)$/i.test(f))) {   // text only
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8').catch(() => '');
    if (text.includes(MIDDLE_DOT) || (!file.startsWith('tests/') && /&middot;|&#183;|&#xb7;/i.test(text))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
