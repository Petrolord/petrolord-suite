/**
 * AS5 — the module's standing rule, as a test, for the app that broke
 * it worst.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere."
 *
 * Peer Review Manager did not fail open. It never opened at all. Every
 * write in the app went to one of three module-level JavaScript arrays
 * seeded from MOCK_REVIEWS, MOCK_COMMENTS and MOCK_AUDIT, and the UI
 * reported success. Every review raised, every technical comment,
 * every disposition, every stage change and the entire audit trail
 * lived until the page reloaded.
 *
 * And its Reports page fabricated twelve reports procedurally and
 * offered each one as a dated CSV download, one of them titled "Full
 * System Audit" and described as a "Complete FDA CFR 21 Part 11
 * compliant extract of all system actions". A CSV outlives the app: it
 * gets emailed, attached to an audit response and filed as a record.
 * That file is the most dangerous artefact this programme has found,
 * and the last three tests here exist to stop anything like it coming
 * back.
 */
import fs from 'fs';
import path from 'path';
import { baseTargets, routesFromApp, unresolved } from '../../__tests__/routeTargets';

const APP = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../../../../..');

const walk = (dir, out = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') return;
      walk(full, out);
    } else if (/\.(js|jsx)$/.test(e.name)) {
      out.push(full);
    }
  });
  return out;
};

const files = walk(APP);
const rel = (f) => path.relative(ROOT, f);
const read = (f) => fs.readFileSync(f, 'utf8');
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no invented data in Peer Review Manager', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('the in-memory service and its mock data are gone', () => {
    ['services/PeerReviewService.js', 'services/mockData.js',
      'data/mockReportsData.js', 'utils/exportToCSV.js',
      'components/ReportDetailModal.jsx'].forEach((f) => {
      expect(fs.existsSync(path.join(APP, f))).toBe(false);
    });
    const offenders = files.filter((f) => /PeerReviewService|getMockReportData/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file declares mock or sample rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|mockReports|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing writes to a module-level array instead of the database', () => {
    // `let localReviews = [...MOCK_REVIEWS]` and two more like it. This
    // is the shape, not just the names: a module-scope mutable array
    // that a write path pushes onto.
    const offenders = files.filter((f) => {
      const src = code(f);
      return /^\s*let\s+local[A-Z]\w*\s*=/m.test(src)
        || /\blocal(Reviews|Comments|Audit)\b/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file falls back to invented rows when a query fails or returns nothing', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /length\s*===\s*0\s*\)\s*throw/.test(src)
        || /!data\s*\|\|\s*data\.length\s*===\s*0/.test(src)
        || /catch\s*\([^)]*\)\s*\{\s*return\s+(MOCK|mock|local)/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no invented person or project appears anywhere', () => {
    const offenders = files.filter((f) =>
      /Sarah Jenkins|Robert Chen|Michael Chang|Amanda Clarke|James Wilson|Tom Hardy|Elena Rostova|Alice Wong/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing claims a backend process that does not exist', () => {
    // "🚧 Action recorded. Backend process triggered."
    const offenders = files.filter((f) =>
      /Backend process triggered|isn.t implemented yet|not implemented yet|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing announces a download it does not perform', () => {
    // The shell toasted "Downloading complete peer review archive as
    // CSV" and downloaded nothing; the register toasted "CSV file is
    // being generated" and generated nothing.
    const offenders = files.filter((f) => {
      const src = code(f);
      return /Downloading complete|is being generated|Export Initiated/i.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('NO REPORT IS GENERATED RATHER THAN COUNTED', () => {
    // The shape of the fabricator: Array.from({length: n}).map over an
    // index, building rows. Twelve reports were built this way and
    // every one of them was downloadable as a dated CSV.
    const offenders = files.filter((f) =>
      /Array\.from\(\s*\{\s*length:\s*\d+\s*\}\s*\)\s*\.map/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no regulatory claim is attached to anything', () => {
    // "Complete FDA CFR 21 Part 11 compliant extract of all system
    // actions", on a file of invented rows. The same wording appeared
    // in Document Control, so it came from the generator rather than
    // from anyone's intent.
    const offenders = files.filter((f) => /CFR 21|Part 11|FDA/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every export is built from rows the hook fetched', () => {
    // Both exports take `reviews` / `comments` straight from the hook.
    const reports = read(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/usePeerReview/);
    expect(reports).toMatch(/exportToCSV\(comments\.map/);
    expect(reports).toMatch(/exportToCSV\(reviews\.map/);
    expect(read(path.join(APP, 'ReviewRegister.jsx'))).toMatch(/exportToCSV\(filtered\.map/);
  });

  it('nothing fakes a loading delay', () => {
    // `setTimeout(..., 600)  // Simulate API fetch delay`
    const offenders = files.filter((f) => /setTimeout\([^)]*,\s*\d{3,}\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/usePeerReview.js'));
    expect(hook).toMatch(/setError\(/);
    ['Dashboard.jsx', 'ReviewRegister.jsx', 'Reports.jsx', 'ReviewDetail.jsx', 'NewReview.jsx']
      .forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    ['NewReview.jsx', 'ReviewDetail.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      const reports = /variant: 'destructive'/.test(src) || /setFailure\(result\.error\)/.test(src);
      expect(`${page} reports write failures: ${reports}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    const hook = read(path.join(APP, 'hooks/usePeerReview.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  it('the close gate goes through the authority, not the page', () => {
    // A review could previously be moved to Closed from a dropdown with
    // Critical comments open against it.
    const hook = read(path.join(APP, 'hooks/usePeerReview.js'));
    expect(hook).toMatch(/canClose/);
    expect(read(path.join(APP, 'ReviewDetail.jsx'))).toMatch(/canClose/);
  });

  it('comment dispositions go through the authority', () => {
    const hook = read(path.join(APP, 'hooks/usePeerReview.js'));
    expect(hook).toMatch(/explainRefusal|canTransition/);
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
    });
  });

  it('no export passes a file name that already ends in .csv', () => {
    // AS13: exportToCSV (src/utils/exportUtils.js) appends the extension
    // itself, so a caller passing `...yyyy-MM-dd}.csv` downloaded
    // `name.csv.csv`.
    const offenders = files.filter((f) => /\.csv[`'"]\s*,?\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('EVERY LINK AND NAVIGATE TARGET RESOLVES TO A DECLARED ROUTE', () => {
    // AS13: the routes for this app are declared in App.jsx.
    const declared = routesFromApp(read(path.join(ROOT, 'src/App.jsx')),
      'apps/assurance/peer-review-manager');
    expect(declared.length).toBeGreaterThan(3);
    const targets = baseTargets(files.map((f) => ({ file: rel(f), src: code(f) })));
    expect(targets.length).toBeGreaterThan(5);
    expect(unresolved(declared, targets)).toEqual([]);
  });

  it('the comment form captures the discipline the Reports chart counts', () => {
    expect(code(path.join(APP, 'ReviewDetail.jsx'))).toMatch(/value=\{draft\.discipline\}/);
  });

  it('a final review is locked on the page and in the hook', () => {
    expect(code(path.join(APP, 'ReviewDetail.jsx'))).toMatch(/reviewLockReason\(review\)/);
    const hook = code(path.join(APP, 'hooks/usePeerReview.js'));
    ['addComment', 'disposeComment'].forEach((fn) => {
      const start = hook.indexOf(`const ${fn} = async`);
      expect(hook.slice(start, start + 200)).toMatch(/lockedReview\(/);
    });
    expect(hook).toMatch(/nextStages\(review\.stage\)\.includes\(stage\)/);
  });

  it('deleting a review asks first', () => {
    const detail = code(path.join(APP, 'ReviewDetail.jsx'));
    expect(detail).toMatch(/<ConfirmDelete/);
    expect(detail).not.toMatch(/onClick=\{handleDelete\}/);
  });

  it('the header carries the help marker', () => {
    expect(read(path.join(APP, 'components/PeerReviewShell.jsx')))
      .toMatch(/AS13: AssuranceHelp appKey="peerReview" goes here/);
  });
});
