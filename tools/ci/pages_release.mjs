// What the Pages workflow runs, and how anyone verifies the live site against the approved release.
//
//   node tools/ci/pages_release.mjs resolve [--tag release/NNNN]   the approved release (fails if --tag differs)
//   node tools/ci/pages_release.mjs build --out _site               validate the release revision, write its exact
//                                                                    artifact, and fail unless its digest is the
//                                                                    recorded one
//   node tools/ci/pages_release.mjs verify-live [--all] [--base URL] compare the served files with the release
//   node tools/ci/pages_release.mjs parity --dir <artifact dir>     compare a downloaded artifact with the release
//
// The workflow checks out main (the release tooling and release/production.json) and reads the release revision
// from its tag; it never builds from main's own files.
import { appendFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, historicalRevision, buildArtifact, manifestOf, manifestOfCommit, digestOf } from './artifact.mjs';
import { readChain, MANIFEST, CHAIN } from '../release.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE = 'https://nesleykent.github.io/Tibinance/';
const KEY_FILES = ['index.html', 'markets.html', 'trade.html', 'reports/tc-cycle/index.html', 'reports/tc-cycle/pt-br.html',
  'data/market-history/tibia-coin/index.json', 'data/market-projections/tibia-coin.json', 'data/observations.json', 'js/markets.js', 'css/markets.css'];

export function resolveRelease(root = ROOT, wanted) {
  const production = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  const { records } = readChain(readFileSync(join(root, CHAIN), 'utf8'));
  const last = records.at(-1);
  if (!last || last.tag !== production.tag || last.commit !== production.commit || last.hash !== production.record?.hash) throw new Error(`${MANIFEST} is not the last record of ${CHAIN}`);
  if (wanted && wanted !== production.tag) throw new Error(`asked to deploy ${wanted}, but the approved release is ${production.tag}`);
  const tagged = git(['rev-parse', '--verify', `${production.tag}^{commit}`], { cwd: root }).trim();
  if (tagged !== historicalRevision(production.commit, root)) throw new Error(`${production.tag} points to ${tagged}, the manifest says ${production.commit}`);
  return { ...production, commit: tagged };
}

export function buildRelease(production, out, root = ROOT, validator = [process.execPath, join(ROOT, 'tools/ci/validate_site.mjs')]) {
  const dir = mkdtempSync(join(tmpdir(), 'tibinance-release-src-'));
  git(['worktree', 'add', '--detach', dir, production.commit], { cwd: root });
  try {
    const r = spawnSync(validator[0], [...validator.slice(1), '--root', dir], { encoding: 'utf8', stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${production.tag} failed validation; nothing is deployed`);
  } finally {
    git(['worktree', 'remove', '--force', dir], { cwd: root });
    rmSync(dir, { recursive: true, force: true });
  }
  const manifest = buildArtifact(production.commit, out, root);
  const digest = digestOf(manifest);
  if (digest !== production.artifact.digest) throw new Error(`artifact digest ${digest} differs from the recorded ${production.artifact.digest}; nothing is deployed`);
  return { files: manifest.length, digest };
}

export function compareManifests(expected, actual) {
  const want = new Map(expected.map(([p, h]) => [p, h])), got = new Map(actual.map(([p, h]) => [p, h]));
  const missing = [...want.keys()].filter(p => !got.has(p));
  const extra = [...got.keys()].filter(p => !want.has(p));
  const differ = [...want.keys()].filter(p => got.has(p) && got.get(p) !== want.get(p));
  return { ok: !missing.length && !extra.length && !differ.length, missing, extra, differ };
}

async function verifyLive(production, { all = false, base = LIVE, root = ROOT } = {}) {
  const manifest = manifestOfCommit(production.commit, root);
  const files = all ? manifest : manifest.filter(([p]) => KEY_FILES.includes(p));
  const bad = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const [path, hash] = files[next++];
      const response = await fetch(new URL(path.split('/').map(encodeURIComponent).join('/'), base), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      const got = response.ok ? createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') : `HTTP ${response.status}`;
      if (got !== hash) bad.push(`${path}: ${got === `HTTP ${response.status}` ? got : 'content differs'}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { checked: files.length, bad };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const output = (key, val) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${val}\n`); };
  try {
    if (command === 'resolve') {
      const p = resolveRelease(ROOT, value('--tag') || undefined);
      output('tag', p.tag); output('commit', p.commit); output('digest', p.artifact.digest);
      console.log(`${p.tag}: ${p.kind} release of ${p.commit}, ${p.artifact.files} files, digest ${p.artifact.digest}`);
    } else if (command === 'build') {
      const p = resolveRelease(ROOT, value('--tag') || undefined);
      const r = buildRelease(p, resolve(value('--out') ?? '_site'));
      console.log(`${p.tag}: artifact of ${r.files} files matches digest ${r.digest}`);
    } else if (command === 'verify-live') {
      const p = resolveRelease(ROOT, value('--tag') || undefined);
      const r = await verifyLive(p, { all: args.includes('--all'), base: value('--base') ?? LIVE });
      r.bad.forEach(b => console.error(`DIFF ${b}`));
      console.log(r.bad.length ? `FAIL: ${r.bad.length} of ${r.checked} live files differ from ${p.tag}` : `PASS: ${r.checked} live files equal ${p.tag}`);
      process.exit(r.bad.length ? 1 : 0);
    } else if (command === 'parity') {
      const p = resolveRelease(ROOT, value('--tag') || undefined);
      const r = compareManifests(manifestOfCommit(p.commit, ROOT), manifestOf(resolve(value('--dir'))));
      for (const k of ['missing', 'extra', 'differ']) r[k].slice(0, 20).forEach(x => console.error(`${k.toUpperCase()} ${x}`));
      console.log(r.ok ? `PASS: the artifact equals ${p.tag} file for file` : `FAIL: ${r.missing.length} missing, ${r.extra.length} extra, ${r.differ.length} different`);
      process.exit(r.ok ? 0 : 1);
    } else throw new Error('use resolve, build, verify-live or parity');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
