#!/usr/bin/env node
/**
 * THE VENDORED ENGINE GUARD.
 *
 * The Suite vendors the Petrolord engines at packages/engines. Nothing in
 * this repository has ever recorded which canonical commit that tree
 * corresponds to, so "is the vendored copy current" has never had an answer
 * to check against, and the failure mode is silent: the build is clean, the
 * tests are green, and a repaired engine defect simply never reaches the
 * live apps.
 *
 * It has already cost this repo twice. A whole-tree `git subtree pull`
 * DELETED 24 Suite-only downstream files on 2026-09-14 without anybody
 * noticing at the time. And on 2026-09-16 the tree was found sitting at
 * canonical 709172f while canonical was at fa53f7f, so the Pipeline & Line
 * Sizing Studio was still marching a `gasOutletPressure` that returned the
 * inlet pressure with a zero drop for any climbing line it could carry:
 * 60 psi of real pressure drop reported as none.
 *
 * WHAT THIS CHECKS. Every tracked path under packages/engines/ is joined by
 * path against the canonical tree at the pinned commit and compared BY GIT
 * BLOB HASH, taken from the file ON DISK rather than from the git index, so
 * a hand edit that was never staged is caught too. A path that is absent, extra, or differing by one byte is a
 * finding. Nothing softer: a comparison that tolerates "close enough" is the
 * comparison that let a truncated barrel constant sit 5.94e-8 from the exact
 * one for months.
 *
 * WHY A LEDGER RATHER THAN A BARE CLEAN COMPARE. The Suite's tree IS clean
 * today and the ledger is empty, which is the state to defend. But a clean
 * compare with no way to record a deliberate exception is a gate that the
 * first legitimate exception deletes. So every KNOWN deviation may be
 * enumerated in VENDOR.json with a reason and a group, and each differing or
 * extra path is PINNED TO ITS CURRENT VENDORED BLOB HASH. That pin is what
 * stops the ledger becoming a blanket amnesty: if an engine file already on
 * the list drifts a SECOND time, its hash no longer matches the pin and the
 * guard still fails.
 *
 * Every row also states, in `burnDownWhen`, the condition under which it must
 * be removed. A bare reason goes stale on its own: in NextGen a row reading
 * "pull only with the recut in the same deploy window" became false the moment
 * the recut merged, and nothing in the file said so. A condition is something
 * a reader can check against the world.
 *
 * The ledger also refuses to go stale. An entry describing a deviation that
 * no longer exists is itself a failure. That bidirectional property is what
 * makes the list able only to shrink, and in NextGen it caught a real problem
 * within one turn of the equivalent guard merging.
 *
 * WHY THE MANIFEST IS COMMITTED. CI has no credentials for the private
 * engines repository, so the canonical blob hashes are committed beside
 * VENDOR.json in VENDOR.manifest. The check is then offline, needs no clone,
 * no install and no build, and runs in well under a second. Passing
 * --canonical <path to a real clone> re-derives the manifest from git and
 * verifies the committed copy against it, which is what a vendoring pass and
 * a nightly job should do; without it the manifest is trusted, and its own
 * integrity is covered by the pinned commit plus review of any diff to it.
 *
 * FAILING ON AN EMPTY SWEEP. A gate that reports success while examining
 * nothing is worse than no gate, because it also reports confidence. This one
 * asserts that the manifest, the vendored tree and the join are all non-empty
 * and at least the floor sizes recorded in VENDOR.json before it is allowed
 * to report success, and it prints how many paths it actually compared.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. NextGen pairs its guard with
 * tools/run-vendored-engine-tests.mjs, because NextGen runs vitest over src/
 * only and its 110 vendored jest suites ran nowhere. The Suite does not need
 * that half: jest.config.js uses testMatch '**\/__tests__/**\/*.test.(js|jsx|ts)'
 * with no testPathIgnorePatterns, so all 179 suites under
 * packages/engines/__tests__ already run in `npm test` alongside the Suite's
 * own. Porting a second runner here would only run them twice.
 *
 * Usage:
 *   node tools/check-vendored-engines.mjs [--canonical <dir>] [--ahead <dir>]
 *                                        [--ahead-ref <ref>] [--json] [--quiet]
 * Exit 0 clean, 1 on any finding, 2 on a usage or integrity error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(REPO, 'packages', 'engines');
const VENDOR_JSON = path.join(VENDOR_DIR, 'VENDOR.json');
const VENDOR_MANIFEST = path.join(VENDOR_DIR, 'VENDOR.manifest');
const PREFIX = 'packages/engines/';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const has = (name) => args.includes(name);
const QUIET = has('--quiet');
const AS_JSON = has('--json');

const die = (msg) => {
  process.stderr.write(`check-vendored-engines: ${msg}\n`);
  process.exit(2);
};

/* ---------------------------------------------------------------- inputs */

if (!fs.existsSync(VENDOR_JSON)) die(`missing ${path.relative(REPO, VENDOR_JSON)}`);
let vendor;
try {
  vendor = JSON.parse(fs.readFileSync(VENDOR_JSON, 'utf8'));
} catch (e) {
  die(`${path.relative(REPO, VENDOR_JSON)} is not valid JSON: ${e.message}`);
}

const commit = vendor?.canonical?.commit;
if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
  die('canonical.commit must be a full 40 character sha in VENDOR.json');
}
const floors = vendor.floors ?? {};
const MIN_MANIFEST = Number(floors.manifestPaths ?? 1);
const MIN_VENDORED = Number(floors.vendoredPaths ?? 1);

/** Canonical path -> blob sha, from the committed manifest. */
const readManifest = (text, whence) => {
  const map = new Map();
  let lineNo = 0;
  for (const raw of text.split('\n')) {
    lineNo += 1;
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const sp = line.indexOf(' ');
    if (sp === -1) die(`${whence}:${lineNo}: expected "<sha> <path>"`);
    const sha = line.slice(0, sp);
    const p = line.slice(sp + 1);
    if (!/^[0-9a-f]{40}$/.test(sha)) die(`${whence}:${lineNo}: bad blob sha`);
    if (map.has(p)) die(`${whence}:${lineNo}: duplicate path ${p}`);
    map.set(p, sha);
  }
  return map;
};

if (!fs.existsSync(VENDOR_MANIFEST)) die(`missing ${path.relative(REPO, VENDOR_MANIFEST)}`);
const canonical = readManifest(fs.readFileSync(VENDOR_MANIFEST, 'utf8'), 'VENDOR.manifest');

/* Optional: re-derive the manifest from a real canonical clone. */
const canonDir = opt('--canonical');
if (canonDir) {
  if (!fs.existsSync(path.join(canonDir, '.git'))) die(`--canonical ${canonDir} is not a git clone`);
  let out;
  try {
    out = execFileSync('git', ['-C', canonDir, 'ls-tree', '-r', commit, '--format=%(objectname) %(path)'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    die(`cannot list canonical ${commit} in ${canonDir}: ${e.message}`);
  }
  const live = readManifest(out, `${canonDir}@${commit}`);
  const drift = [];
  for (const [p, sha] of live) if (canonical.get(p) !== sha) drift.push(`manifest ${canonical.has(p) ? 'stale for' : 'is missing'} ${p}`);
  for (const p of canonical.keys()) if (!live.has(p)) drift.push(`manifest has ${p}, absent from canonical ${commit}`);
  if (drift.length) {
    for (const d of drift.slice(0, 40)) process.stderr.write(`  ${d}\n`);
    die(`VENDOR.manifest disagrees with ${canonDir} at ${commit} on ${drift.length} path(s); regenerate it`);
  }
  if (!QUIET) process.stdout.write(`manifest verified against ${canonDir} at ${commit.slice(0, 7)} (${live.size} paths)\n`);
}

/* ------------------------------------------------------- the advisory */

/**
 * OPTIONAL AND IT NEVER FAILS. How far canonical has moved past the pin.
 *
 * The guard above compares against the PINNED commit and its committed
 * manifest, never against engines HEAD. That is deliberate. A guard pointed
 * at HEAD goes red the moment canonical moves, which it does often, and from
 * then on it blocks every unrelated pull request in this repository until
 * somebody vendors. A gate that fails for reasons the author cannot act on
 * is a gate that gets switched off.
 *
 * "Canonical has moved ahead" is still worth knowing, so it is reported here
 * as an advisory and it never changes the exit code. It needs a real clone,
 * so it is for a person or a nightly rather than for pull-request CI, which
 * has no engines-repo credentials.
 */
const aheadDir = opt('--ahead');
if (aheadDir) {
  if (!fs.existsSync(path.join(aheadDir, '.git'))) die(`--ahead ${aheadDir} is not a git clone`);
  const ref = opt('--ahead-ref') || 'origin/main';
  let gap = null;
  let head = null;
  try {
    gap = execFileSync('git', ['-C', aheadDir, 'rev-list', '--count', `${commit}..${ref}`], { encoding: 'utf8' }).trim();
    head = execFileSync('git', ['-C', aheadDir, 'rev-parse', '--short', ref], { encoding: 'utf8' }).trim();
  } catch (e) {
    process.stdout.write(`ADVISORY: cannot measure the gap to ${ref} in ${aheadDir} (${e.message.split('\n')[0]})\n`);
  }
  if (gap !== null) {
    process.stdout.write(gap === '0'
      ? `ADVISORY: the pin is ${ref} (${head}). Nothing to vendor.\n`
      : `ADVISORY: canonical ${ref} is ${head}, ${gap} commit(s) ahead of the pinned ${commit.slice(0, 7)}. `
        + 'That is a vendoring pass to schedule, and it is NOT a failure of this check.\n');
  }
}

/* The vendored tree, as git sees it: tracked paths only, by blob hash. */
let lsFiles;
try {
  lsFiles = execFileSync('git', ['-C', REPO, 'ls-files', '-s', '--', 'packages/engines'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  die(`git ls-files failed: ${e.message}`);
}
// The vendoring contract itself lives inside the vendored directory so that
// it travels with the tree, but it is the Suite's own control data and has no
// canonical counterpart. It is not vendored content and is not compared.
const SELF = new Set(['VENDOR.json', 'VENDOR.manifest']);

const vendored = new Map();
for (const line of lsFiles.split('\n')) {
  if (!line.trim()) continue;
  // <mode> <sha> <stage>\t<path>
  const tab = line.indexOf('\t');
  if (tab === -1) die(`unparseable git ls-files line: ${line}`);
  const [, sha] = line.slice(0, tab).split(/\s+/);
  const p = line.slice(tab + 1);
  if (!p.startsWith(PREFIX)) continue;
  const rel = p.slice(PREFIX.length);
  if (SELF.has(rel)) continue;
  vendored.set(rel, sha);
}

/* ---------------------------------------- hashed from disk, not the index */

/**
 * `git ls-files -s` reports the INDEX entry for a path, so an edit that has
 * not been staged is invisible to it: `npm run check:engines` on a dirty
 * tree would report the vendored engines clean while the file the app
 * actually imports had been changed by hand. Editing the vendored copy in
 * place is precisely what this guard exists to stop, so the PATH LIST comes
 * from git (tracked files only) and the CONTENT is hashed from disk.
 *
 * `git hash-object` produces the same blob id git would store, so a clean
 * tree is unchanged by this and the comparison below is untouched. A tracked
 * path that has been deleted on disk drops out of the vendored map and is
 * reported MISSING against canonical, which is the honest reading.
 */
const onDisk = [];
const deleted = [];
for (const rel of vendored.keys()) {
  (fs.existsSync(path.join(VENDOR_DIR, rel)) ? onDisk : deleted).push(rel);
}
for (const rel of deleted) vendored.delete(rel);
if (onDisk.length) {
  let hashed;
  try {
    hashed = execFileSync('git', ['-C', REPO, 'hash-object', '--stdin-paths'], {
      input: `${onDisk.map((rel) => PREFIX + rel).join('\n')}\n`,
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    }).trim().split('\n');
  } catch (e) {
    die(`git hash-object failed over the vendored tree: ${e.message}`);
  }
  if (hashed.length !== onDisk.length) {
    die(`git hash-object returned ${hashed.length} hashes for ${onDisk.length} paths`);
  }
  onDisk.forEach((rel, i) => {
    if (!/^[0-9a-f]{40}$/.test(hashed[i])) die(`git hash-object gave a bad sha for ${rel}`);
    vendored.set(rel, hashed[i]);
  });
}

/* ------------------------------------------------- the empty-sweep guard */

const fatal = [];
if (canonical.size === 0) fatal.push('VENDOR.manifest lists no canonical paths');
if (vendored.size === 0) fatal.push('git ls-files found no tracked paths under packages/engines');
if (canonical.size < MIN_MANIFEST) fatal.push(`manifest has ${canonical.size} paths, below the floor of ${MIN_MANIFEST}`);
if (vendored.size < MIN_VENDORED) fatal.push(`vendored tree has ${vendored.size} tracked paths, below the floor of ${MIN_VENDORED}`);
if (fatal.length) {
  for (const f of fatal) process.stderr.write(`EMPTY SWEEP REFUSED: ${f}\n`);
  process.stderr.write('A gate that examines nothing must never report success.\n');
  process.exit(1);
}

/* ------------------------------------------------------------- the ledger */

const ledger = new Map();
const seenLedger = new Set();
for (const [i, entry] of (vendor.knownDeviations ?? []).entries()) {
  const where = `knownDeviations[${i}]`;
  if (!entry || typeof entry.path !== 'string') die(`${where}: needs a "path"`);
  if (!['missing', 'differing', 'extra'].includes(entry.kind)) die(`${where}: kind must be missing, differing or extra`);
  if (typeof entry.reason !== 'string' || entry.reason.trim().length < 8) die(`${where}: needs a real "reason"`);
  if (typeof entry.group !== 'string' || !entry.group) die(`${where}: needs a "group"`);
  // A reason goes stale on its own. In NextGen a row reading "pull only
  // with the recut in the same deploy window" became false the moment the
  // recut merged, and nothing in the file said so. Every row therefore
  // states the CONDITION under which it must be burned down, in words a
  // reader can check against the world rather than against intent.
  if (typeof entry.burnDownWhen !== 'string' || entry.burnDownWhen.trim().length < 8) {
    die(`${where}: needs a "burnDownWhen" saying the condition under which this row must be removed`);
  }
  if (entry.kind !== 'missing') {
    if (!/^[0-9a-f]{40}$/.test(entry.vendoredSha ?? '')) {
      die(`${where}: a ${entry.kind} path must pin "vendoredSha" to the blob currently vendored`);
    }
  }
  if (ledger.has(entry.path)) die(`${where}: ${entry.path} is listed twice`);
  ledger.set(entry.path, entry);
}

const findings = [];
const note = (kind, p, detail, entry) => findings.push({
  kind, path: p, detail, group: entry?.group ?? null, burnDownWhen: entry?.burnDownWhen ?? null,
});

let compared = 0;

for (const [p, canonSha] of canonical) {
  const vendSha = vendored.get(p);
  const entry = ledger.get(p);
  if (vendSha === undefined) {
    if (!entry) note('MISSING', p, 'in canonical, absent from the vendored tree, and not in the ledger');
    else if (entry.kind !== 'missing') note('LEDGER', p, `ledger calls this "${entry.kind}" but the path is absent`, entry);
    else seenLedger.add(p);
    continue;
  }
  compared += 1;
  if (vendSha === canonSha) {
    if (entry) note('STALE', p, `ledger still lists this as "${entry.kind}" but it now matches canonical; remove the entry`, entry);
    continue;
  }
  if (!entry) {
    note('DIFFERING', p, `vendored ${vendSha.slice(0, 12)} vs canonical ${canonSha.slice(0, 12)}, and not in the ledger`);
  } else if (entry.kind !== 'differing') {
    note('LEDGER', p, `ledger calls this "${entry.kind}" but the path is present and differs`, entry);
  } else if (entry.vendoredSha !== vendSha) {
    note('DRIFT', p, `known divergence, but the vendored blob moved: pinned ${entry.vendoredSha.slice(0, 12)}, now ${vendSha.slice(0, 12)}`, entry);
  } else {
    seenLedger.add(p);
  }
}

for (const [p, vendSha] of vendored) {
  if (canonical.has(p)) continue;
  const entry = ledger.get(p);
  if (!entry) {
    note('EXTRA', p, 'present in the vendored tree, absent from canonical, and not in the ledger');
  } else if (entry.kind !== 'extra') {
    note('LEDGER', p, `ledger calls this "${entry.kind}" but the path exists only in the vendored tree`, entry);
  } else if (entry.vendoredSha !== vendSha) {
    note('DRIFT', p, `known local-only file, but its blob moved: pinned ${entry.vendoredSha.slice(0, 12)}, now ${vendSha.slice(0, 12)}`, entry);
  } else {
    seenLedger.add(p);
  }
}

for (const p of ledger.keys()) {
  if (seenLedger.has(p)) continue;
  if (findings.some((f) => f.path === p)) continue;
  note('STALE', p, 'ledger entry matches no deviation in the tree; remove it', ledger.get(p));
}

if (compared === 0) {
  process.stderr.write('EMPTY SWEEP REFUSED: the join compared zero present paths.\n');
  process.exit(1);
}

/* -------------------------------------------------------------- reporting */

const byGroup = {};
for (const e of ledger.values()) byGroup[e.group] = (byGroup[e.group] ?? 0) + 1;

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify({
    commit, canonicalPaths: canonical.size, vendoredPaths: vendored.size,
    comparedPaths: compared, ledgerEntries: ledger.size, byGroup, findings,
  }, null, 2)}\n`);
} else if (findings.length) {
  const order = ['MISSING', 'DIFFERING', 'EXTRA', 'DRIFT', 'LEDGER', 'STALE'];
  process.stderr.write(`\nVENDORED ENGINE GUARD: ${findings.length} finding(s) against canonical ${commit.slice(0, 7)}\n\n`);
  for (const kind of order) {
    const rows = findings.filter((f) => f.kind === kind);
    if (!rows.length) continue;
    process.stderr.write(`${kind} (${rows.length}):\n`);
    for (const r of rows) {
      process.stderr.write(`  ${r.path}\n      ${r.detail}\n`);
      if (r.burnDownWhen) process.stderr.write(`      burn down when: ${r.burnDownWhen}\n`);
    }
    process.stderr.write('\n');
  }
  process.stderr.write(
    'Every deviation from canonical must be either reconciled or recorded in\n'
    + 'packages/engines/VENDOR.json with a reason, a group and a burnDownWhen saying\n'
    + 'when the row must be removed. Engine changes are made in\n'
    + 'Petrolord/petrolord-engines and vendored here, never edited in place.\n',
  );
} else if (!QUIET) {
  const groups = Object.entries(byGroup).sort().map(([g, n]) => `${g} ${n}`).join(', ');
  process.stdout.write(
    `vendored engines clean against canonical ${commit.slice(0, 7)}: `
    + `${compared} path(s) compared byte for byte, ${canonical.size} canonical, `
    + `${vendored.size} vendored, ${ledger.size} recorded deviation(s)`
    + `${groups ? ` (${groups})` : ''}.\n`,
  );
}

process.exit(findings.length ? 1 : 0);
