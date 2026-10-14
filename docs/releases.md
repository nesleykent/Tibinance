# Releases: how anything reaches the live site

Development checkpoints are committed and pushed to `main` continuously, by Claude Code, Codex or the owner, and
**none of them is deployed by being pushed**. The live site (GitHub Pages) serves one approved release revision at a
time:

- a commit tagged `release/NNNN` (annotated; tags are never moved, deleted or reused);
- recorded in `release/production.json` (the current release) and `release/releases.jsonl` (every release, an
  append-only SHA-256 hash chain);
- built into an artifact that is exactly that commit's files, minus `.github/`, `.cache/` and hidden paths
  (`tools/ci/artifact.mjs`), whose digest is recorded with the release.

The Pages workflow (`.github/workflows/pages.yml`) checks out `main` for the tooling and validates the tag's own
revision with `tools/ci/validate_site.mjs`. It writes the artifact and deploys only if the artifact digest equals the
recorded one. A failure at any step deploys nothing, and the previous deployment stays live.

## Two kinds of release

Both are made only by `tools/release.mjs`, which validates the candidate in a temporary worktree, tags it, and pushes
the tag and the manifest commit to `main` in one atomic push built on the remote `main`. It never force-pushes, and
it rebuilds and retries when `main` moved meanwhile.

| Kind | Command | Revision deployed | When |
| --- | --- | --- | --- |
| Full | `node tools/release.mjs --full <commit> --approver "<who>"` | That `main` commit, unchanged | After verifying the commit (tests, browser checks). The only way pages, scripts, styles or tooling reach production. It also approves `release/policy.json`. |
| Data | `node tools/release.mjs --data <commit> --approver "<who>"` | The current production tree with only the policy's data paths taken from `<commit>`; parent = previous release | After a validated data update (TibiaMarket sync, screenshot or manual update, forecast publication). Unreleased code on `main` cannot ride along. |

`release/policy.json` lists the data paths. A data release uses the policy embedded in the last **full** release,
so editing the policy on `main` has no effect until a full release approves it.

Useful commands:

```bash
node tools/release.mjs --status
```

```bash
node tools/release.mjs --verify
```

```bash
node tools/ci/pages_release.mjs verify-live --all
```

`--status` compares production with `main`. `--verify` checks the chain, tags and digests of every release.
`verify-live` compares every served file with the release. After a local release whose push succeeded, the push of
`release/production.json` starts the Pages workflow. Bots add `--dispatch`, because pushes made with the workflow
token start no workflows.

## Before releasing

1. Push your checkpoint first (`release.mjs` refuses when `HEAD` has commits that are not on `origin/main`).
2. Run `node tools/ci/validate_site.mjs` and the browser suites relevant to the change.
3. Release, naming yourself as approver (for example `--approver "Claude Code, verified browser suites"`). Use
   `--with PROGRESS.md` to record the release in the handoff ledger in the same commit.
4. Watch the Pages run, then `node tools/ci/pages_release.mjs verify-live`.

## Rollback

To return to an earlier state, make a new full release of the `main` commit that holds it (history is never
rewritten). If the Pages workflow itself is broken, an admin can switch the Pages source back to **Deploy from a
branch** (`main`, `/`) under Settings, then Pages, or with
`gh api -X PUT repos/nesleykent/Tibinance/pages -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"`.
The site then follows `main` again, without release isolation, until the workflow is fixed and the source is switched
back to GitHub Actions.

## Bootstrap (October 2026)

Pages served `main` directly ("Deploy from a branch"). The migration kept the live site unchanged throughout:

1. Release 0001 = `b7eb0e4`, the commit the site served before the migration.
2. The tooling and workflows were committed without touching any served file.
3. A dry run (Pages source still legacy) built release 0001. Its artifact was compared file for file with the commit
   and with the live site.
4. The Pages source was switched to GitHub Actions and release 0001 was deployed and verified live.
5. A test checkpoint edited a served file and was confirmed not deployed.

The outcome of each step is recorded in `PROGRESS.md`.


## Authorized author correction, 2026-10-14

The repository owner explicitly approved removal of the automated bot identity from published history. Seven
bot author/committer identities were reassigned to the owner's existing identity. Descendant parent hashes also
changed, but every original commit's tree and timestamps were preserved. This one authorized operation updated
release tags 0003 through 0005; it is not permission for ordinary releases to move tags or force-push.

The immutable release and forecast records retain their original commit IDs and hash chains. The audited
`release/identity-rewrite.json` maps those IDs to corrected commits with exactly the same tree. Release/artifact
and forecast-evidence readers verify the mapped tree before using it; an unknown ID is not silently substituted,
and a different tree is rejected. All five recorded release artifact digests remain unchanged. No website release
was created and the unreleased UI reconstruction stays unreleased.

For a historical code revision named in a frozen record, the corresponding `commits[oldId].commit` in the map
is its current Git ID. Source-file hashes and archived inputs continue to provide the original reproducibility
checks. Fresh clones should fetch all release tags. Existing local clones need their old branches/tags reconciled
with the authorized rewrite before publishing; do not merge or push the obsolete bot-authored ancestry back.
