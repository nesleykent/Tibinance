// The production artifact of a release: exactly the files of one git commit, minus what is never served.
//
// A release revision is a commit. Its artifact is that commit's tree, written out file by file, without the paths
// below; nothing else is added, generated or rewritten, so the artifact is the release. The digest is the SHA-256
// of the sorted "path<TAB>sha256" lines of every file, and is what release/production.json records and what the
// Pages workflow compares before it deploys.
//
// Excluded: .github/ (workflows), .cache/ (local and Actions processing caches) and every hidden path (a segment
// starting with "."). The Pages artifact action leaves hidden files out of what it uploads, so excluding them here
// keeps the recorded digest equal to what is served. No hidden file is referenced by any page.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const EXCLUDED = path => path.split('/').some(segment => segment.startsWith('.')) || path.startsWith('.github/') || path.startsWith('.cache/');

const sha256 = data => createHash('sha256').update(data).digest('hex');

// An explicitly authorized author correction changed commit IDs, never their trees. Frozen release and forecast
// records keep their original IDs; resolve only entries in the audited map, and verify their exact tree identity.
export function historicalRevision(revision, cwd = process.cwd()) {
  const match = revision.match(/^([a-f0-9]{40})(?=$|:|\^|~|\.\.)/i);
  const path = resolve(cwd, 'release/identity-rewrite.json');
  if (!match || !existsSync(path)) return revision;
  const mapping = JSON.parse(readFileSync(path, 'utf8'));
  if (mapping.format !== 1) throw new Error('unsupported identity-rewrite map');
  const entry = mapping.commits?.[match[1]];
  if (!entry) return revision;
  if (!/^[a-f0-9]{40}$/.test(entry.commit ?? '') || !/^[a-f0-9]{40}$/.test(entry.tree ?? '')) throw new Error('invalid identity-rewrite entry');
  const tree = execFileSync('git', ['rev-parse', `${entry.commit}^{tree}`], { cwd, encoding: 'utf8' }).trim();
  if (tree !== entry.tree) throw new Error(`identity rewrite changed the tree of ${match[1]}`);
  return entry.commit + revision.slice(match[1].length);
}

export function git(args, { cwd, input, encoding = 'utf8' } = {}) {
  return execFileSync('git', args.map(arg => historicalRevision(arg, cwd)), { cwd, input, encoding, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'] });
}

// Every file of a commit's tree: [{ path, mode, blob }]. Only regular files can be served; a symlink or submodule in
// a release would be a mistake, so it fails loudly.
export function treeFiles(commit, cwd) {
  const out = git(['ls-tree', '-r', '-z', '--full-tree', commit], { cwd });
  return out.split('\0').filter(Boolean).map(line => {
    const [meta, path] = line.split('\t');
    const [mode, type, blob] = meta.split(' ');
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) throw new Error(`${commit}: ${path} is ${type} ${mode}, not a regular file`);
    return { path, mode, blob };
  });
}

// Writes the artifact of a commit into outDir (which must not exist or be empty) and returns its manifest.
export function buildArtifact(commit, outDir, cwd) {
  mkdirSync(outDir, { recursive: true });
  if (readdirSync(outDir).length) throw new Error(`${outDir} is not empty`);
  const files = treeFiles(commit, cwd).filter(f => !EXCLUDED(f.path));
  // One cat-file process streams every blob, in order, as "<sha> blob <size>\n<bytes>\n".
  const batch = execFileSync('git', ['cat-file', '--batch'], { cwd, input: files.map(f => f.blob).join('\n') + '\n', maxBuffer: 2 ** 32 });
  let at = 0;
  for (const file of files) {
    const end = batch.indexOf(0x0a, at);
    const [blob, type, size] = batch.subarray(at, end).toString().split(' ');
    if (blob !== file.blob || type !== 'blob') throw new Error(`cat-file returned ${blob} ${type} for ${file.path}`);
    const data = batch.subarray(end + 1, end + 1 + Number(size));
    at = end + 1 + Number(size) + 1;
    const target = join(outDir, ...file.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  return manifestOf(outDir);
}

// The manifest of a directory as it will be served: sorted [path, sha256, bytes].
export function manifestOf(dir) {
  const files = [];
  const walk = d => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(dir, full).split(sep).join('/');
        if (EXCLUDED(path)) continue;
        const data = readFileSync(full);
        files.push([path, sha256(data), data.length]);
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export const digestOf = manifest => sha256(manifest.map(([path, hash]) => `${path}\t${hash}\n`).join(''));

// The manifest a commit's artifact will have, computed from git objects without writing files.
export function manifestOfCommit(commit, cwd) {
  const files = treeFiles(commit, cwd).filter(f => !EXCLUDED(f.path));
  const batch = execFileSync('git', ['cat-file', '--batch'], { cwd, input: files.map(f => f.blob).join('\n') + '\n', maxBuffer: 2 ** 32 });
  let at = 0;
  const out = files.map(file => {
    const end = batch.indexOf(0x0a, at);
    const size = Number(batch.subarray(at, end).toString().split(' ')[2]);
    const data = batch.subarray(end + 1, end + 1 + size);
    at = end + 1 + size + 1;
    return [file.path, sha256(data), size];
  });
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
