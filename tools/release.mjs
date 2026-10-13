// The single release operation: the only way anything reaches production (GitHub Pages).
//
// Development checkpoints go to main continuously and are never deployed. Production serves one approved,
// immutable release revision: a commit tagged release/NNNN (annotated, never moved, never reused) and recorded in
// release/production.json and the append-only, hash-chained release/releases.jsonl on main. The Pages workflow
// deploys only that tag, and only when its exact artifact passes validation and matches the recorded digest.
//
//   node tools/release.mjs --full <commit> --approver "<who>"   release a main commit exactly (code, pages, data)
//   node tools/release.mjs --data <commit> --approver "<who>"   release only data paths from <commit>
//   node tools/release.mjs --status                             production vs main HEAD
//   node tools/release.mjs --verify                             chain, tags and digests of every release
// Exit codes: 0 released, 3 nothing to release, 1 any failure (nothing released).
// Options: --with <path> (also commit this working-tree file, e.g. PROGRESS.md; repeatable), --no-push,
//          --dispatch (start the Pages workflow; bots need it because GITHUB_TOKEN pushes trigger no workflows),
//          --remote <name> (default origin), --note "<text>".
//
// A full release is an explicit decision taken after verification: its revision is that main commit, unchanged.
// It also approves release/policy.json as found on main at that moment; the policy is embedded in the record.
// A data release starts from the current production tree and replaces only the paths the last full release's
// embedded policy allows, taking them from <commit>; its parent is the previous release commit, so no unreleased
// checkpoint code can ride along. Changing the policy therefore needs a full release.
//
// Every candidate is checked out in a temporary worktree and validated by tools/ci/validate_site.mjs before it is
// tagged. The tag and the manifest commit reach the remote in one atomic push built on the remote's main, so a
// concurrent release or checkpoint is never overwritten: a rejected push is rebuilt on the new main and retried.
// Nothing is ever force-pushed.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, manifestOfCommit, digestOf } from './ci/artifact.mjs';

const TOOL_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const MANIFEST = 'release/production.json';
export const CHAIN = 'release/releases.jsonl';
export const POLICY = 'release/policy.json';
const ZERO = '0'.repeat(64);
const sha256 = text => createHash('sha256').update(text).digest('hex');

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number in a release record');
  return JSON.stringify(value);
}

// The chain: each line is a canonical record with seq, prev (SHA-256 of the previous line) and hash (SHA-256 of the
// record without hash). Returns the records after checking every link.
export function readChain(text) {
  const records = [];
  let prev = ZERO;
  for (const line of (text ?? '').split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    const { hash, ...body } = record;
    if (record.seq !== records.length + 1 || record.prev !== prev || hash !== sha256(canonical(body)) || canonical(record) !== line) {
      throw new Error(`${CHAIN}: broken at line ${records.length + 1}`);
    }
    records.push(record);
    prev = sha256(line);
  }
  return { records, prev };
}

export function appendRecord(text, body) {
  const { records, prev } = readChain(text);
  const record = { seq: records.length + 1, prev, ...body };
  const line = canonical({ ...record, hash: sha256(canonical(record)) });
  return { text: `${text ?? ''}${line}\n`, record: JSON.parse(line) };
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function policyMatcher(policy) {
  if (!policy || !Array.isArray(policy.dataPaths) || !policy.dataPaths.length) throw new Error(`${POLICY}: dataPaths must be a non-empty list`);
  const patterns = policy.dataPaths.map(globToRegExp);
  return path => patterns.some(p => p.test(path));
}

const show = (rev, path, cwd) => { try { return git(['show', `${rev}:${path}`], { cwd }); } catch { return null; } };
const revParse = (rev, cwd) => git(['rev-parse', '--verify', `${rev}^{commit}`], { cwd }).trim();
const isAncestor = (a, b, cwd) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd }).status === 0;

// The tree of a data release: the base (production) tree with every policy path taken from the data commit.
export function composeDataTree(baseCommit, dataCommit, policy, cwd) {
  const allowed = policyMatcher(policy);
  const list = commit => git(['ls-tree', '-r', '-z', '--full-tree', commit], { cwd }).split('\0').filter(Boolean)
    .map(line => { const [meta, path] = line.split('\t'); const [mode, , blob] = meta.split(' '); return { path, mode, blob }; });
  const entries = [...list(baseCommit).filter(e => !allowed(e.path)), ...list(dataCommit).filter(e => allowed(e.path))];
  const index = join(mkdtempSync(join(tmpdir(), 'tibinance-release-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  execFileSync('git', ['read-tree', '--empty'], { cwd, env });
  execFileSync('git', ['update-index', '--add', '-z', '--index-info'], { cwd, env, input: entries.map(e => `${e.mode} ${e.blob}\t${e.path}\0`).join('') });
  const tree = execFileSync('git', ['write-tree'], { cwd, env, encoding: 'utf8' }).trim();
  rmSync(index, { force: true });
  const changed = entries.filter(e => allowed(e.path)).length;
  return { tree, changedCandidates: changed };
}

function validateCandidate(commit, cwd, validator) {
  const dir = mkdtempSync(join(tmpdir(), 'tibinance-candidate-'));
  git(['worktree', 'add', '--detach', dir, commit], { cwd });
  try {
    const [cmd, ...args] = validator ?? [process.execPath, join(TOOL_ROOT, 'tools/ci/validate_site.mjs'), '--json'];
    const r = spawnSync(cmd, [...args, '--root', dir], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
    const json = (r.stdout ?? '').split('\n').reverse().find(line => line.startsWith('{"ok"'));
    const checks = json ? JSON.parse(json).checks : [];
    if (r.status !== 0) throw new Error(`validation failed for ${commit}:\n${(r.stdout ?? '').slice(-3000)}${(r.stderr ?? '').slice(-2000)}`);
    return checks;
  } finally {
    git(['worktree', 'remove', '--force', dir], { cwd });
    rmSync(dir, { recursive: true, force: true });
  }
}

function lock(cwd) {
  const file = join(resolve(cwd, git(['rev-parse', '--git-common-dir'], { cwd }).trim()), 'tibinance-release.lock');
  let fd;
  try { fd = openSync(file, 'wx'); } catch { throw new Error(`another release is running (${file}); remove it only if no release process is alive`); }
  writeFileSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
  closeSync(fd);
  return () => { try { unlinkSync(file); } catch {} };
}

const tagsOf = (cwd, remote) => {
  const names = new Set(git(['tag', '--list', 'release/*'], { cwd }).split('\n').filter(Boolean));
  if (remote) {
    try { for (const line of git(['ls-remote', '--tags', remote, 'refs/tags/release/*'], { cwd }).split('\n')) { const m = line.match(/refs\/tags\/(release\/\d+)$/); if (m) names.add(m[1]); } } catch {}
  }
  return names;
};

// Builds the manifest commit (release files, plus any --with files) on top of base without touching the working
// tree or the index, so it can be rebuilt on a newer main after a rejected push.
function manifestCommit(base, record, chainText, withFiles, message, cwd) {
  const index = join(mkdtempSync(join(tmpdir(), 'tibinance-release-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  execFileSync('git', ['read-tree', base], { cwd, env });
  const put = (path, text) => {
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd, input: text, encoding: 'utf8' }).trim();
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { cwd, env });
  };
  const { seq, prev, hash, ...rest } = record;
  put(MANIFEST, JSON.stringify({ format: 1, note: 'The approved production release. Pages deploys exactly this tag; only tools/release.mjs changes it.', ...rest, record: { seq, hash } }, null, 1) + '\n');
  put(CHAIN, chainText);
  for (const [path, text] of withFiles) put(path, text);
  const tree = execFileSync('git', ['write-tree'], { cwd, env, encoding: 'utf8' }).trim();
  rmSync(index, { force: true });
  return execFileSync('git', ['commit-tree', tree, '-p', base, '-m', message], { cwd, encoding: 'utf8' }).trim();
}


// Moves the local branch onto the manifest commit. The --with files were committed with exactly their working-tree
// content, so they are first returned to HEAD's version (no content is lost: the commit holds it) and the
// fast-forward brings that same content back. Anything else that blocks the fast-forward is left untouched.
function followLocally(manifestSha, withFiles, cwd) {
  if (!isAncestor('HEAD', manifestSha, cwd)) return false;
  for (const [path, text] of withFiles) if (show(manifestSha, path, cwd) === text) git(['checkout', 'HEAD', '--', path], { cwd });
  const r = spawnSync('git', ['merge', '--ff-only', '--quiet', manifestSha], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    for (const [path, text] of withFiles) writeFileSync(join(cwd, path), text);
    console.error(`note: the local branch was not fast-forwarded to ${manifestSha}: ${r.stderr.trim()}`);
  }
  return r.status === 0;
}

export function release({ kind, commit, approver, note = '', withPaths = [], push = true, dispatch = false, remote = 'origin', cwd = process.cwd(), validator, now = () => new Date().toISOString() }) {
  if (!['full', 'data'].includes(kind)) throw new Error('kind must be full or data');
  if (!approver) throw new Error('--approver is required: say who approved this release');
  cwd = git(['rev-parse', '--show-toplevel'], { cwd }).trim();
  const unlock = lock(cwd);
  try {
    if (push) git(['fetch', '--quiet', remote, 'main', '--tags'], { cwd });
    const mainRef = push ? `${remote}/main` : 'HEAD';
    if (push && !isAncestor('HEAD', mainRef, cwd)) throw new Error(`HEAD has commits that are not on ${remote}/main: push your checkpoint first, then release`);
    const withFiles = withPaths.map(p => {
      const committed = show(mainRef, p, cwd), local = show('HEAD', p, cwd);
      if (committed !== local) throw new Error(`${p} changed on ${mainRef} since your checkout; update before releasing`);
      return [p, readFileSync(join(cwd, p), 'utf8')];
    });

    const { records } = readChain(show(mainRef, CHAIN, cwd) ?? '');
    const last = records.at(-1);
    const target = revParse(commit, cwd);
    if (!isAncestor(target, mainRef, cwd)) throw new Error(`${commit} is not on ${mainRef}: only commits on main can be released`);

    let candidate, policy, source;
    if (kind === 'full') {
      const text = show(mainRef, POLICY, cwd);
      if (!text) throw new Error(`${POLICY} is missing on ${mainRef}`);
      policy = JSON.parse(text);
      policyMatcher(policy);
      candidate = target;
      source = { commit: target };
    } else {
      if (!last) throw new Error('no release yet: the first release must be a full release');
      const full = [...records].reverse().find(r => r.kind === 'full');
      policy = full.policy;
      const { tree } = composeDataTree(last.commit, target, policy, cwd);
      if (tree === git(['rev-parse', `${last.commit}^{tree}`], { cwd }).trim()) throw new Error(`nothing to release: the data paths of ${target} equal production ${last.tag}`);
      candidate = execFileSync('git', ['commit-tree', tree, '-p', last.commit, '-m', `data release: data paths of ${target} on ${last.tag}`], { cwd, encoding: 'utf8' }).trim();
      source = { base: { tag: last.tag, commit: last.commit }, data: target, policyFrom: full.tag };
    }

    const checks = validateCandidate(candidate, cwd, validator);
    const manifest = manifestOfCommit(candidate, cwd);
    const used = tagsOf(cwd, push ? remote : null);
    const number = Math.max(0, ...[...used].map(t => Number(t.split('/')[1])), ...records.map(r => Number(r.tag.split('/')[1]))) + 1;
    const tag = `release/${String(number).padStart(4, '0')}`;
    const body = {
      tag, commit: candidate, tree: git(['rev-parse', `${candidate}^{tree}`], { cwd }).trim(), kind, source,
      policySha256: sha256(canonical(policy)), ...(kind === 'full' ? { policy } : {}),
      artifact: { digest: digestOf(manifest), files: manifest.length, bytes: manifest.reduce((s, f) => s + f[2], 0) },
      validation: { validator: { path: 'tools/ci/validate_site.mjs', commit: git(['rev-parse', 'HEAD'], { cwd: TOOL_ROOT }).trim() }, checks },
      approver, note, createdAt: now(),
    };
    git(['tag', '-a', tag, '-m', `${kind} release ${tag}\n\n${canonical({ commit: candidate, digest: body.artifact.digest, approver })}`, candidate], { cwd });

    for (let attempt = 1; ; attempt++) {
      const base = revParse(mainRef, cwd);
      const chainBefore = show(base, CHAIN, cwd) ?? '';
      const { text, record } = appendRecord(chainBefore, body);
      const message = `release: ${tag} (${kind}) of ${kind === 'full' ? target.slice(0, 7) : `data ${target.slice(0, 7)} on ${source.base.tag}`}\n\nApproved by ${approver}.${note ? ` ${note}` : ''}\nArtifact ${body.artifact.digest} (${body.artifact.files} files).`;
      const manifestSha = manifestCommit(base, record, text, withFiles, message, cwd);
      if (!push) {
        followLocally(manifestSha, withFiles, cwd);
        return { tag, record, manifestCommit: manifestSha, pushed: false };
      }
      const r = spawnSync('git', ['push', '--atomic', '--porcelain', remote, `refs/tags/${tag}:refs/tags/${tag}`, `${manifestSha}:refs/heads/main`], { cwd, encoding: 'utf8' });
      if (r.status === 0) {
        followLocally(manifestSha, withFiles, cwd);
        if (dispatch) execFileSync('gh', ['workflow', 'run', 'pages.yml', '--ref', 'main', '-f', `tag=${tag}`], { cwd, stdio: 'inherit' });
        return { tag, record, manifestCommit: manifestSha, pushed: true };
      }
      if (attempt >= 5) throw new Error(`push rejected ${attempt} times; ${tag} stays local and unpublished:\n${r.stdout}${r.stderr}`);
      git(['fetch', '--quiet', remote, 'main', '--tags'], { cwd });
      if (tagsOf(cwd, remote).has(tag) && show(`${remote}/main`, CHAIN, cwd)?.includes(`"tag":"${tag}"`)) throw new Error(`${tag} was published concurrently by another release`);
    }
  } finally {
    unlock();
  }
}

export function verifyReleases(cwd = process.cwd(), { digests = true } = {}) {
  const text = existsSync(join(cwd, CHAIN)) ? readFileSync(join(cwd, CHAIN), 'utf8') : '';
  const { records } = readChain(text);
  const problems = [];
  for (const r of records) {
    let tagged;
    try { tagged = revParse(r.tag, cwd); } catch { problems.push(`${r.tag}: tag missing`); continue; }
    if (tagged !== r.commit) problems.push(`${r.tag}: tag points to ${tagged}, record says ${r.commit}`);
    if (digests && digestOf(manifestOfCommit(r.commit, cwd)) !== r.artifact.digest) problems.push(`${r.tag}: artifact digest differs from the record`);
  }
  if (records.length) {
    const production = JSON.parse(readFileSync(join(cwd, MANIFEST), 'utf8'));
    const last = records.at(-1);
    if (production.tag !== last.tag || production.commit !== last.commit || production.record?.hash !== last.hash) problems.push(`${MANIFEST} is not the last record of ${CHAIN}`);
  }
  return { records, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const all = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
  try {
    if (args.includes('--verify')) {
      const { records, problems } = verifyReleases(process.cwd());
      problems.forEach(p => console.error(`FAIL ${p}`));
      console.log(problems.length ? `FAIL: ${problems.length} problems in ${records.length} releases` : `PASS: ${records.length} releases, chain, tags and digests consistent`);
      process.exit(problems.length ? 1 : 0);
    }
    if (args.includes('--status')) {
      const production = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
      if (!production) { console.log('no release yet'); process.exit(0); }
      const head = git(['rev-parse', 'HEAD']).trim();
      console.log(`production ${production.tag} ${production.kind} ${production.commit} (${production.createdAt}, approved by ${production.approver})`);
      const source = production.kind === 'full' ? production.source.commit : production.source.data;
      console.log(`main HEAD ${head}; ${git(['rev-list', '--count', `${source}..HEAD`]).trim()} commits since the released source`);
      process.exit(0);
    }
    const kind = args.includes('--full') ? 'full' : args.includes('--data') ? 'data' : null;
    if (!kind) throw new Error('use --full <commit>, --data <commit>, --status or --verify');
    const result = release({ kind, commit: value(`--${kind}`), approver: value('--approver'), note: value('--note') ?? '', withPaths: all('--with'), push: !args.includes('--no-push'), dispatch: args.includes('--dispatch'), remote: value('--remote') ?? 'origin' });
    console.log(`${result.tag}: ${result.record.kind} release of ${result.record.commit}, artifact ${result.record.artifact.digest} (${result.record.artifact.files} files)${result.pushed ? ', pushed' : ', local only'}`);
  } catch (error) {
    console.error(error.message);
    // 3: nothing to release (production already serves these data), which automation treats as success.
    process.exit(/^nothing to release/.test(error.message) ? 3 : 1);
  }
}
