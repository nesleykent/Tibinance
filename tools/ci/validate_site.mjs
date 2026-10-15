// The required integrity checks of a Tibinance tree: one entry point for CI on main, for a release candidate
// (tools/release.mjs) and for the Pages workflow on the exact release revision.
//
//   node tools/ci/validate_site.mjs                 check this checkout
//   node tools/ci/validate_site.mjs --root <dir>    check another tree (a release candidate's worktree)
//   node tools/ci/validate_site.mjs --json          print the result as JSON as well
//
// A check runs only when the tree has what it checks, so the same validator can judge an older release (release
// 0001 predates the forecast archive) and every later one; what was checked is reported, never assumed:
// 1. the tree's own JavaScript unit tests (tests/*.test.mjs, which include the copy rules);
// 2. every builder's --check (the committed generated files are fresh builds of their inputs);
// 3. the forecast archive's integrity, once data/forecast-archive/ exists (hash chains, snapshots, and every
//    published representation backed by its archive record);
// 4. references: every local file a page, stylesheet or module loads exists in the tree.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILDER_CHECKS = ['build_market_history', 'build_market_projections', 'audit_market_chart', 'audit_rolling_activity', 'build_tibia_token', 'fetch_foreign_exchange', 'build_economy_overview'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'app', 'exports']);

const run = (cmd, args, cwd) => {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '' } });
  return { ok: r.status === 0, status: r.status, ms: Date.now() - started, output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` };
};

function walk(root, keep) {
  const out = [];
  const go = dir => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) go(full);
      else if (keep(name)) out.push(full);
    }
  };
  go(root);
  return out;
}

const LOCAL = ref => ref && !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith('//') && !ref.startsWith('#') && !ref.includes('${') && !ref.startsWith('{');

// Local references of one file: HTML src/href, CSS url(), and static or literal dynamic module imports.
export function referencesOf(file, text) {
  const refs = new Set();
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\s(?:src|href)\s*=\s*("([^"]*)"|'([^']*)')/gi)) refs.add(m[2] ?? m[3]);
    for (const m of text.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)) for (const r of moduleRefs(m[1])) refs.add(r);
  } else if (file.endsWith('.css')) {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.add(m[1]);
  } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
    for (const r of moduleRefs(text)) refs.add(r);
  }
  return [...refs].filter(LOCAL);
}

function moduleRefs(text) {
  const out = [];
  // Comments are dropped first, so an example import in a comment is not taken for a real one.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  for (const m of code.matchAll(/(?:^|[;\s}])(?:import|export)\s[^'"`;]*?from\s*(['"])([^'"]+)\1/g)) out.push(m[2]);
  for (const m of code.matchAll(/(?:^|[;\s}])import\s*(['"])([^'"]+)\1/g)) out.push(m[2]);
  for (const m of code.matchAll(/import\(\s*(['"])([^'"]+)\1\s*\)/g)) out.push(m[2]);
  return out.filter(r => r.startsWith('.') || r.startsWith('/'));
}

export function checkReferences(root) {
  const missing = [];
  const files = walk(root, n => /\.(html|css|m?js)$/.test(n)).filter(f => !relative(root, f).split(sep).includes('tests') && !relative(root, f).split(sep).includes('tools'));
  for (const file of files) {
    for (const ref of referencesOf(file, readFileSync(file, 'utf8'))) {
      let path = ref.split('#')[0].split('?')[0];
      if (!path) continue;
      const target = path.startsWith('/') ? join(root, path) : resolve(dirname(file), path);
      const full = path.endsWith('/') ? join(target, 'index.html') : target;
      const rel = relative(root, normalize(full));
      if (rel.startsWith('..')) { missing.push(`${relative(root, file)} -> ${ref} (outside the site)`); continue; }
      if (!existsSync(full) || statSync(full).isDirectory() && !existsSync(join(full, 'index.html'))) missing.push(`${relative(root, file)} -> ${ref}`);
    }
  }
  return { files: files.length, missing };
}

export function validateSite(root) {
  const checks = [];
  const add = (name, result, detail) => checks.push({ name, ok: result.ok, ms: result.ms ?? 0, detail: result.ok ? detail : (detail ?? '') + (result.output ? `\n${result.output.slice(-4000)}` : '') });

  const tests = existsSync(join(root, 'tests')) ? readdirSync(join(root, 'tests')).filter(n => n.endsWith('.test.mjs')).sort() : [];
  if (tests.length) {
    const r = run(process.execPath, ['--test', ...tests.map(t => `tests/${t}`)], root);
    const summary = r.output.match(/ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/);
    add('unit tests', r, summary ? `${summary[1]} passed, ${summary[2]} failed (${tests.length} files)` : `${tests.length} files`);
  } else add('unit tests', { ok: false, output: 'no tests/*.test.mjs in the tree' });

  for (const name of BUILDER_CHECKS) {
    if (!existsSync(join(root, 'tools', `${name}.mjs`))) continue;
    add(`${name} --check`, run(process.execPath, [`tools/${name}.mjs`, '--check'], root), 'fresh');
  }

  if (existsSync(join(root, 'data', 'forecast-archive')) || existsSync(join(root, 'tools', 'forecasts', 'archive.py'))) {
    if (!existsSync(join(root, 'tools', 'forecasts', 'archive.py'))) add('forecast archive', { ok: false, output: 'data/forecast-archive/ exists without tools/forecasts/archive.py' });
    else add('forecast archive', run(process.env.PYTHON ?? 'python3', ['tools/forecasts/archive.py', '--check'], root), 'chains, snapshots and representations consistent');
  }

  const refs = checkReferences(root);
  add('references', { ok: refs.missing.length === 0, output: refs.missing.join('\n') }, `${refs.files} pages, stylesheets and modules; every local reference exists`);

  return { root, ok: checks.every(c => c.ok), checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root');
  const root = resolve(at > 0 ? process.argv[at + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const result = validateSite(root);
  for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? `: ${c.detail}` : ''} (${c.ms} ms)`);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: result.ok, checks: result.checks.map(({ name, ok }) => ({ name, ok })) }));
  console.log(result.ok ? `PASS: ${result.checks.length} checks on ${root}` : `FAIL: ${result.checks.filter(c => !c.ok).length} of ${result.checks.length} checks on ${root}`);
  process.exit(result.ok ? 0 : 1);
}
