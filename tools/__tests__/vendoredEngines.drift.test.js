/**
 * THE DRIFT GUARD, RUN WHERE PEOPLE ALREADY RUN THINGS.
 *
 * tools/check-vendored-engines.mjs is wired into its own GitHub workflow,
 * but this repository had no CI at all until that workflow was added, and
 * the habit here is `npm test`. A gate that only runs somewhere nobody
 * looks is a gate that stops running, which is the same failure this guard
 * exists to catch: packages/engines sat three weeks behind canonical while
 * the build was clean and the tests were green.
 *
 * THE SECOND CASE IS THE POINT. A gate that has never failed is not a gate.
 * On this programme an engine's "strongest available check" turned out to be
 * an algebraic identity that could not fail, so this suite plants a real
 * deviation and requires the guard to go red naming the file, then restores
 * it byte for byte and requires green again.
 *
 * The planted byte goes in packages/engines/README.md, which is vendored and
 * tracked like every other path but is imported by nothing, so a suite
 * running in a parallel worker cannot read it half written. The restore is
 * in a finally block and writes back the exact buffer that was read.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..');
const GUARD = path.join(REPO, 'tools', 'check-vendored-engines.mjs');
const PROBE = path.join(REPO, 'packages', 'engines', 'README.md');
const LEDGER = path.join(REPO, 'packages', 'engines', 'VENDOR.json');

/** Run the guard, and return its exit code with everything it printed. */
const runGuard = () => {
  try {
    const stdout = execFileSync('node', [GUARD], { cwd: REPO, encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

describe('the vendored engines match canonical', () => {
  it('is clean, and says how many paths it actually compared', () => {
    const { code, out } = runGuard();
    expect(out).toMatch(/vendored engines clean against canonical/);
    // the empty-sweep guard's other half: a gate that examines nothing must
    // never report success, so the count is asserted, not just the word.
    const compared = Number(/(\d+) path\(s\) compared/.exec(out)?.[1]);
    expect(compared).toBeGreaterThan(700);
    expect(code).toBe(0);
  });

  it('refuses a ledger row that does not say when it should be burned down', () => {
    // A bare reason goes stale on its own. In NextGen a row reading "pull
    // only with the recut in the same deploy window" became false the moment
    // the recut merged and nothing in the file said so.
    const original = fs.readFileSync(LEDGER);
    try {
      const doc = JSON.parse(original.toString('utf8'));
      doc.knownDeviations = [{
        path: 'README.md',
        kind: 'differing',
        reason: 'a row with no burn-down condition',
        group: 'test',
        vendoredSha: '0'.repeat(40),
      }];
      fs.writeFileSync(LEDGER, `${JSON.stringify(doc, null, 2)}\n`);
      const { code, out } = runGuard();
      expect(code).toBe(2);
      expect(out).toMatch(/needs a "burnDownWhen"/);
    } finally {
      fs.writeFileSync(LEDGER, original);
    }
    expect(runGuard().code).toBe(0);
  });

  it('lets a complete ledger row stand, and still fails a SECOND drift on that path', () => {
    // The ledger has to be usable or it gets deleted at the first legitimate
    // exception, and it has to keep biting or it becomes a blanket amnesty.
    const ledger = fs.readFileSync(LEDGER);
    const probe = fs.readFileSync(PROBE);
    try {
      const once = Buffer.concat([probe, Buffer.from('\n')]);
      fs.writeFileSync(PROBE, once);
      const sha = execFileSync('git', ['hash-object', PROBE], { cwd: REPO, encoding: 'utf8' }).trim();
      const doc = JSON.parse(ledger.toString('utf8'));
      // APPENDED to the ledger in force rather than replacing it, so the case
      // holds whether or not the committed ledger carries rows of its own (a
      // re-vendor ahead of a canonical merge does, until the pin moves).
      const standing = doc.knownDeviations.length;
      doc.knownDeviations = [...doc.knownDeviations, {
        path: 'README.md',
        kind: 'differing',
        reason: 'a deviation planted by this suite to prove the ledger works',
        group: 'test',
        burnDownWhen: 'this test finishes, which it does in the finally block below',
        vendoredSha: sha,
      }];
      fs.writeFileSync(LEDGER, `${JSON.stringify(doc, null, 2)}\n`);

      const recorded = runGuard();
      expect(recorded.code).toBe(0);
      expect(recorded.out).toMatch(new RegExp(`${standing + 1} recorded deviation\\(s\\)`));

      // the pin is what stops the row becoming an amnesty
      fs.writeFileSync(PROBE, Buffer.concat([once, Buffer.from('\n')]));
      const drifted = runGuard();
      expect(drifted.code).toBe(1);
      expect(drifted.out).toMatch(/DRIFT \(1\)/);
      expect(drifted.out).toMatch(/burn down when: /);
    } finally {
      fs.writeFileSync(PROBE, probe);
      fs.writeFileSync(LEDGER, ledger);
    }
    expect(runGuard().code).toBe(0);
  });

  it('goes red on a planted deviation, naming the file, and green again once it is gone', () => {
    const original = fs.readFileSync(PROBE);
    try {
      fs.writeFileSync(PROBE, Buffer.concat([original, Buffer.from('\n')]));
      const red = runGuard();
      expect(red.code).toBe(1);
      expect(red.out).toMatch(/DIFFERING \(1\)/);
      expect(red.out).toMatch(/README\.md/);
    } finally {
      fs.writeFileSync(PROBE, original);
    }
    const green = runGuard();
    expect(green.code).toBe(0);
    expect(green.out).toMatch(/vendored engines clean against canonical/);
  });
});
