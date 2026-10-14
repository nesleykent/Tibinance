// Production isolation (Stage A0): releases are the only way anything reaches the site, the artifact is exactly the
// release revision, data releases carry only policy paths on top of production, and nothing is ever overwritten.
// Every test works on throwaway repositories: a bare "origin" and its clones, with a stub validator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { release, readChain, appendRecord, globToRegExp, verifyReleases, composeDataTree, MANIFEST, CHAIN } from '../tools/release.mjs';
import { historicalRevision, manifestOfCommit, digestOf, buildArtifact, EXCLUDED } from '../tools/ci/artifact.mjs';
import { resolveRelease, buildRelease, compareManifests } from '../tools/ci/pages_release.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const write = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tibinance-release-test-'));
  const origin = join(dir, 'origin.git'), work = join(dir, 'work');
  sh(dir, 'init', '--quiet', '--bare', '-b', 'main', origin);
  sh(dir, 'clone', '--quiet', origin, work);
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.invalid'], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false']]) sh(work, 'config', k, v);
  write(work, 'index.html', '<script type="module" src="js/a.js"></script>v1');
  write(work, 'js/a.js', 'export const a = 1;\n');
  write(work, 'data/d.json', '{"v":1}\n');
  write(work, '.github/workflows/x.yml', 'name: x\n');
  write(work, '.nojekyll', '');
  write(work, 'release/policy.json', JSON.stringify({ dataPaths: ['data/**'] }));
  // The stub validator fails when the candidate tree contains data/FAIL.
  write(dir, 'validator.mjs', "const r=process.argv[process.argv.indexOf('--root')+1];const f=(await import('node:fs')).existsSync(r+'/data/FAIL');console.log(JSON.stringify({ok:!f,checks:[{name:'stub',ok:!f}]}));process.exit(f?1:0);\n");
  commit(work, 'c1');
  sh(work, 'push', '--quiet', 'origin', 'HEAD:main');
  return { dir, origin, work, validator: [process.execPath, join(dir, 'validator.mjs')] };
}

function commit(work, message) {
  sh(work, 'add', '-A');
  sh(work, 'commit', '--quiet', '-m', message);
  return sh(work, 'rev-parse', 'HEAD');
}

const opts = f => ({ cwd: f.work, validator: f.validator, approver: 'test', now: () => '2026-10-13T00:00:00Z' });

test('a full release is exactly the main commit, and its artifact is that tree minus hidden and workflow paths', () => {
  const f = fixture();
  const c1 = sh(f.work, 'rev-parse', 'HEAD');
  const r = release({ ...opts(f), kind: 'full', commit: c1 });
  assert.equal(r.tag, 'release/0001');
  assert.equal(r.record.commit, c1);
  assert.equal(sh(f.origin, 'rev-parse', 'release/0001^{commit}'), c1);
  const manifest = manifestOfCommit(c1, f.work);
  assert.deepEqual(manifest.map(m => m[0]), ['data/d.json', 'index.html', 'js/a.js', 'release/policy.json']);
  assert.equal(r.record.artifact.digest, digestOf(manifest));
  // The written artifact is byte-identical to the manifest computed from git objects.
  const out = join(f.dir, 'site');
  assert.deepEqual(buildArtifact(c1, out, f.work), manifest);
  // The manifest commit is on origin/main and the local branch followed it.
  const production = JSON.parse(sh(f.origin, 'show', `main:${MANIFEST}`));
  assert.equal(production.tag, 'release/0001');
  assert.deepEqual(production.policy, { dataPaths: ['data/**'] });
  assert.equal(sh(f.work, 'rev-parse', 'HEAD'), sh(f.origin, 'rev-parse', 'main'));
  assert.deepEqual(verifyReleases(f.work).problems, []);
});

test('a data release takes only policy paths, on top of production, so checkpoint edits to public files never ship', () => {
  const f = fixture();
  release({ ...opts(f), kind: 'full', commit: 'HEAD' });
  const c1 = sh(f.work, 'rev-parse', 'release/0001^{commit}');
  write(f.work, 'index.html', 'half-built checkpoint');
  write(f.work, 'data/d.json', '{"v":2}\n');
  write(f.work, 'data/new.json', '{"n":1}\n');
  const c2 = commit(f.work, 'checkpoint');
  sh(f.work, 'push', '--quiet', 'origin', 'HEAD:main');
  const r = release({ ...opts(f), kind: 'data', commit: c2 });
  assert.equal(r.tag, 'release/0002');
  assert.equal(sh(f.work, 'rev-parse', `${r.record.commit}^`), c1, 'parent is the previous release, not main');
  assert.equal(sh(f.work, 'show', `${r.record.commit}:index.html`), '<script type="module" src="js/a.js"></script>v1');
  assert.equal(sh(f.work, 'show', `${r.record.commit}:data/d.json`), '{"v":2}');
  assert.equal(sh(f.work, 'show', `${r.record.commit}:data/new.json`), '{"n":1}');
  assert.equal(r.record.source.base.tag, 'release/0001');
  // Releasing the same data again is refused.
  assert.throws(() => release({ ...opts(f), kind: 'data', commit: c2 }), /nothing to release/);
});

test('a candidate that fails validation gets no tag and no record', () => {
  const f = fixture();
  release({ ...opts(f), kind: 'full', commit: 'HEAD' });
  write(f.work, 'data/FAIL', 'x');
  const c = commit(f.work, 'bad data');
  sh(f.work, 'push', '--quiet', 'origin', 'HEAD:main');
  assert.throws(() => release({ ...opts(f), kind: 'data', commit: c }), /validation failed/);
  assert.equal(sh(f.work, 'tag', '--list', 'release/0002'), '');
  assert.equal(readChain(sh(f.origin, 'show', `main:${CHAIN}`) + '\n').records.length, 1);
});

test('the data-path policy is the one approved by the last full release', () => {
  const f = fixture();
  release({ ...opts(f), kind: 'full', commit: 'HEAD' });
  write(f.work, 'release/policy.json', JSON.stringify({ dataPaths: ['data/**', 'index.html'] }));
  write(f.work, 'index.html', 'smuggled');
  write(f.work, 'data/d.json', '{"v":3}\n');
  const c = commit(f.work, 'policy edit');
  sh(f.work, 'push', '--quiet', 'origin', 'HEAD:main');
  const r = release({ ...opts(f), kind: 'data', commit: c });
  assert.match(sh(f.work, 'show', `${r.record.commit}:index.html`), /v1$/);
  // Only a full release approves the new policy.
  const full = release({ ...opts(f), kind: 'full', commit: c });
  assert.deepEqual(full.record.policy.dataPaths, ['data/**', 'index.html']);
});

test('release numbers are never reused, even after a tag that never reached the manifest', () => {
  const f = fixture();
  release({ ...opts(f), kind: 'full', commit: 'HEAD' });
  sh(f.work, 'tag', '-a', 'release/0005', '-m', 'orphan', 'HEAD');
  sh(f.work, 'push', '--quiet', 'origin', 'refs/tags/release/0005');
  write(f.work, 'data/d.json', '{"v":9}\n');
  const c = commit(f.work, 'more data');
  sh(f.work, 'push', '--quiet', 'origin', 'HEAD:main');
  assert.equal(release({ ...opts(f), kind: 'data', commit: c }).tag, 'release/0006');
});

test('a release builds on the remote main, keeping a checkpoint another agent pushed meanwhile', () => {
  const f = fixture();
  const other = join(f.dir, 'other');
  sh(f.dir, 'clone', '--quiet', f.origin, other);
  for (const [k, v] of [['user.name', 'Other'], ['user.email', 'o@example.invalid'], ['commit.gpgsign', 'false']]) sh(other, 'config', k, v);
  write(other, 'notes.md', 'codex checkpoint');
  const theirs = commit(other, 'codex checkpoint');
  sh(other, 'push', '--quiet', 'origin', 'HEAD:main');
  const r = release({ ...opts(f), kind: 'full', commit: sh(f.work, 'rev-parse', 'HEAD') });
  assert.equal(sh(f.origin, 'rev-parse', 'main^'), theirs, 'the manifest commit sits on top of the other checkpoint');
  assert.ok(r.pushed);
  // A local checkpoint that was not pushed blocks a release instead of being skipped or overwritten.
  write(f.work, 'local.md', 'unpushed');
  commit(f.work, 'unpushed');
  assert.throws(() => release({ ...opts(f), kind: 'full', commit: 'HEAD' }), /not on origin\/main/);
});

test('the release log is an unbroken hash chain: any edited line is detected', () => {
  let text = '';
  text = appendRecord(text, { tag: 'release/0001', commit: 'a' }).text;
  text = appendRecord(text, { tag: 'release/0002', commit: 'b' }).text;
  assert.equal(readChain(text).records.length, 2);
  assert.throws(() => readChain(text.replace('"commit":"a"', '"commit":"c"')), /broken at line 1/);
  const lines = text.trim().split('\n');
  assert.throws(() => readChain(`${lines[1]}\n${lines[0]}\n`), /broken/);
});

test('the Pages build refuses a release whose artifact digest is not the recorded one, or another tag', () => {
  const f = fixture();
  release({ ...opts(f), kind: 'full', commit: 'HEAD' });
  sh(f.work, 'fetch', '--quiet', '--tags', 'origin');
  const production = resolveRelease(f.work);
  assert.throws(() => resolveRelease(f.work, 'release/0009'), /approved release is release\/0001/);
  assert.equal(buildRelease(production, join(f.dir, 'ok'), f.work, f.validator).digest, production.artifact.digest);
  assert.throws(() => buildRelease({ ...production, artifact: { digest: 'f'.repeat(64) } }, join(f.dir, 'bad'), f.work, f.validator), /nothing is deployed/);
});

test('artifact paths and comparisons: hidden and workflow paths are excluded, differences are named', () => {
  assert.ok(EXCLUDED('.github/workflows/pages.yml') && EXCLUDED('.nojekyll') && EXCLUDED('reports/tc-cycle/.gitignore') && EXCLUDED('.cache/k/x'));
  assert.ok(!EXCLUDED('data/market-history/tibia-coin/index.json'));
  const r = compareManifests([['a', '1'], ['b', '2'], ['c', '3']], [['a', '1'], ['b', 'x'], ['d', '4']]);
  assert.deepEqual([r.ok, r.missing, r.extra, r.differ], [false, ['c'], ['d'], ['b']]);
  assert.ok(globToRegExp('data/**').test('data/a/b.json') && !globToRegExp('data/*.json').test('data/a/b.json') && globToRegExp('reports/tc-cycle/*.json').test('reports/tc-cycle/results.json'));
});

test('composeDataTree keeps non-policy files of the base and replaces or removes policy files', () => {
  const f = fixture();
  const base = sh(f.work, 'rev-parse', 'HEAD');
  sh(f.work, 'rm', '--quiet', 'data/d.json');
  write(f.work, 'data/e.json', '{}');
  write(f.work, 'js/a.js', 'changed');
  const next = commit(f.work, 'swap');
  const { tree } = composeDataTree(base, next, { dataPaths: ['data/**'] }, f.work);
  const files = sh(f.work, 'ls-tree', '-r', '--name-only', tree).split('\n');
  assert.ok(files.includes('data/e.json') && !files.includes('data/d.json'));
  assert.equal(sh(f.work, 'cat-file', '-p', `${tree}:js/a.js`), 'export const a = 1;');
});

test('release tooling never force-pushes', () => {
  for (const file of ['tools/release.mjs', 'tools/ci/pages_release.mjs']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/['"]push['"][^\n]*(--force|['"]-f['"]|\+refs)/.test(text), `${file} must not force-push`);
  }
  assert.ok(existsSync(new URL('../release/policy.json', import.meta.url)), 'the repository has a data-release policy');
});

test('--with records a working-tree file in the release commit and the local branch follows it', () => {
  const f = fixture();
  write(f.work, 'PROGRESS.md', 'base\n');
  commit(f.work, 'progress');
  sh(f.work, 'push', '--quiet', 'origin', 'HEAD:main');
  write(f.work, 'PROGRESS.md', 'release 0001 recorded\n');
  const r = release({ ...opts(f), kind: 'full', commit: 'HEAD', withPaths: ['PROGRESS.md'] });
  assert.equal(sh(f.origin, 'show', 'main:PROGRESS.md'), 'release 0001 recorded');
  assert.equal(sh(f.work, 'rev-parse', 'HEAD'), r.manifestCommit);
  assert.equal(sh(f.work, 'status', '--porcelain'), '');
});

test('an authorized author rewrite preserves release records, exact artifacts and future data-release parents', () => {
  const f = fixture(), original = sh(f.work, 'rev-parse', 'HEAD');
  const r1 = release({ ...opts(f), kind: 'full', commit: original });
  const before = readFileSync(join(f.work, CHAIN), 'utf8');
  const originalTag = sh(f.work, 'rev-parse', r1.tag);
  const tree = sh(f.work, 'rev-parse', `${original}^{tree}`);
  const corrected = sh(f.work, 'commit-tree', tree, '-m', 'corrected identity');
  sh(f.work, 'tag', '-f', '-a', r1.tag, '-m', 'owner-authorized author correction', corrected);
  sh(f.work, 'push', `--force-with-lease=refs/tags/${r1.tag}:${originalTag}`, 'origin', `refs/tags/${r1.tag}`);
  write(f.work, 'release/identity-rewrite.json', JSON.stringify({ format: 1, commits: { [original]: { commit: corrected, tree } } }));
  assert.equal(historicalRevision(`${original}:index.html`, f.work), `${corrected}:index.html`);
  assert.equal(verifyReleases(f.work).problems.length, 0);
  assert.equal(resolveRelease(f.work).commit, corrected);
  assert.equal(readFileSync(join(f.work, CHAIN), 'utf8'), before, 'frozen release chain unchanged');
  assert.equal(digestOf(manifestOfCommit(original, f.work)), r1.record.artifact.digest);
  write(f.work, 'data/d.json', '{"v":2}\n');
  const target = commit(f.work, 'data and authorized identity map');
  sh(f.work, 'push', '--quiet', 'origin', 'HEAD:main');
  const r2 = release({ ...opts(f), kind: 'data', commit: target });
  assert.equal(sh(f.work, 'rev-parse', `${r2.record.commit}^`), corrected, 'data release uses the corrected production parent');
  const badTree = sh(f.work, 'rev-parse', `${target}^{tree}`);
  write(f.work, 'release/identity-rewrite.json', JSON.stringify({ format: 1, commits: { [original]: { commit: corrected, tree: badTree } } }));
  assert.throws(() => historicalRevision(original, f.work), /changed the tree/);
});
