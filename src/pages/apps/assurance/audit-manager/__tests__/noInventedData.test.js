/**
 * AS10 — the module's standing rule, as a test, for an app that is new.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere."
 *
 * There is no fiction to remove here, because there was no code: both
 * tiles this app comes from — `safety-audit-manager` and
 * `audit-trail-manager` — were Active and sellable with no route, no
 * page and no component behind either of them. So this suite exists to
 * stop the module's eight recorded defect classes being introduced
 * into a clean app, and to hold the reuse decision in place: the
 * finding rules are AS8's, imported, not a second copy.
 */
import fs from 'fs';
import path from 'path';

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

const PAGES = ['Dashboard.jsx', 'Programmes.jsx', 'Checklists.jsx', 'Audits.jsx',
  'AuditDetail.jsx', 'Findings.jsx', 'FindingDetail.jsx', 'Reports.jsx'];

describe('no invented data in the Audit & Findings Manager', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('the app is routed, which is the whole point of the wave', () => {
    // Both tiles it replaces were sellable with no route in App.jsx.
    const app = read(path.join(ROOT, 'src/App.jsx'));
    expect(app).toMatch(/apps\/assurance\/audit-manager\/\*/);
    expect(app).toMatch(/appId="audit-findings-manager"/);
  });

  it('and its tile is seeded Coming Soon, not Active', () => {
    // A tile must never go Active before its route is on the deploy
    // target (the F12 lesson).
    const seed = read(path.join(ROOT,
      'supabase/migrations/20260917810000_as10_seed_audit_findings_tile.sql'));
    expect(seed).toMatch(/v_slug text := 'audit-findings-manager'/);
    expect(seed).toMatch(/status = 'Coming Soon'/);
    // The only 'Active' in the file is the sibling-row lookup, not an
    // assignment: the tile itself is never seeded Active.
    expect(seed).not.toMatch(/tmpl\.status := 'Active'/);
    expect(seed).not.toMatch(/set status = 'Active'/);
  });

  it('nothing in the app calls Math.random() (the AS8 defect)', () => {
    const offenders = files.filter((f) => /Math\.random\(/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file declares mock rows or imports a data file', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /\b(MOCK_[A-Z_]+|mockData|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+|METRICS)\b/.test(src)
        || /from\s+['"]@?\/?[\w./@-]*data\//.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no hardcoded audit or finding number appears anywhere', () => {
    const offenders = files.filter((f) => /['"`](AUD|AF)-\d{3,}/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every page queries through the hook', () => {
    PAGES.forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/useAuditManagement/);
    });
  });

  it('every detail page reads the parameter its route declares (the AS7 defect)', () => {
    const shell = code(path.join(APP, 'AuditManagerPageShell.jsx'));
    expect(shell).toMatch(/path="audits\/:auditId"/);
    expect(shell).toMatch(/path="findings\/:findingId"/);
    expect(code(path.join(APP, 'AuditDetail.jsx'))).toMatch(/const \{ auditId \} = useParams\(\)/);
    expect(code(path.join(APP, 'FindingDetail.jsx')))
      .toMatch(/const \{ findingId \} = useParams\(\)/);
  });

  it('no page falls back to the first record when the id does not match (the AS4/AS9 defect)', () => {
    const offenders = files.filter((f) =>
      /\|\|\s*(audits|findings|programmes)\[0\]|fallback for demo/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every create form is a controlled form that writes (the AS6/AS7/AS9 defect)', () => {
    const pairs = [
      ['Programmes.jsx', 'createProgramme'],
      ['Checklists.jsx', 'createTemplate'],
      ['Audits.jsx', 'createAudit'],
      ['AuditDetail.jsx', 'createFinding'],
    ];
    pairs.forEach(([page, fn]) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/useState/);
      expect(src).toMatch(/value=\{(form|item|answer|raising|creating)[.[]/);
      expect(src).toMatch(new RegExp(`\\b${fn}\\b`));
    });
  });

  it('nothing reads a form out of the DOM', () => {
    const offenders = files.filter((f) => /new FormData\(/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing fakes a delay to look like a save', () => {
    const offenders = files.filter((f) => /setTimeout\([^)]*,\s*\d{3,}\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart or table is drawn from a hardcoded array', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /(?:const|let)\s+\w*[Dd]ata\s*=\s*\[\s*\{\s*(?:name|id):\s*['"]/.test(src)
        || /(?:const|let)\s+(trendData|metrics|chartData)\s*=\s*\[\s*\{/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no count is a literal standing in for a query, and no audit carries a score', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /\b(value|count|total):\s*\d+\s*[,}]/.test(src) || /(^|[^a-z])score\s*[:.]/i.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing answers a click with a "not implemented" toast (the AS3/AS9 defect)', () => {
    const offenders = files.filter((f) =>
      /next prompt|isn.t implemented yet|not implemented yet|will be implemented here|Action triggered|will download shortly|🚧/i
        .test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every export is built from rows the hook fetched', () => {
    expect(read(path.join(APP, 'Audits.jsx'))).toMatch(/exportToCSV\(rows\.map/);
    expect(read(path.join(APP, 'Findings.jsx'))).toMatch(/exportToCSV\(rows\.map/);
    const reports = read(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/exportToCSV\(programmes\.map/);
    expect(reports).toMatch(/exportToCSV\(notDelivered\.map/);
    expect(reports).toMatch(/exportToCSV\(findings\.map/);
  });

  it('nothing exports to PDF from this app', () => {
    const offenders = files.filter((f) => /exportToPDF|exportToExcel|printElement/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/useAuditManagement.js'));
    expect(hook).toMatch(/setError\(/);
    PAGES.forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    ['Programmes.jsx', 'Checklists.jsx', 'Audits.jsx', 'AuditDetail.jsx',
      'Findings.jsx', 'FindingDetail.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      const reports = /setFailure\(result\.error\)/.test(src) || /setFailure\(r\.error\)/.test(src);
      expect(`${page} reports write failures: ${reports}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    const hook = read(path.join(APP, 'hooks/useAuditManagement.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  /* The gates, each called by the page that offers the button. */

  it('planning an audit goes through the independence gate', () => {
    expect(read(path.join(APP, 'hooks/useAuditManagement.js'))).toMatch(/auditIndependence/);
  });

  it('an audit move goes through the gate', () => {
    expect(read(path.join(APP, 'hooks/useAuditManagement.js'))).toMatch(/canAdvanceAudit/);
    expect(read(path.join(APP, 'AuditDetail.jsx'))).toMatch(/canAdvanceAudit/);
  });

  it('the report gate names the unanswered items and the uncovered criticals', () => {
    const detail = read(path.join(APP, 'AuditDetail.jsx'));
    expect(detail).toMatch(/unansweredItems/);
    expect(detail).toMatch(/criticalAnswersWithoutFindings/);
  });

  it('a programme move goes through the gate', () => {
    expect(read(path.join(APP, 'hooks/useAuditManagement.js'))).toMatch(/canAdvanceProgramme/);
    expect(read(path.join(APP, 'Programmes.jsx'))).toMatch(/canAdvanceProgramme/);
  });

  it('raising and closing a finding both go through their gates', () => {
    const hook = read(path.join(APP, 'hooks/useAuditManagement.js'));
    expect(hook).toMatch(/canRaiseFinding/);
    expect(hook).toMatch(/canCloseFinding/);
    expect(read(path.join(APP, 'FindingDetail.jsx'))).toMatch(/canCloseFinding/);
  });

  it('every write method the hook exports has a caller in the app (the AS7 lesson)', () => {
    const hook = read(path.join(APP, 'hooks/useAuditManagement.js'));
    const returned = hook.slice(hook.lastIndexOf('return {'));
    const methods = [...returned.matchAll(/^\s{4}(\w+),$/gm)].map((m) => m[1])
      .filter((m) => /^(create|update|delete|add|open|record|advance|close|void)/.test(m));
    // There is no deleteAudit on purpose: an audit is cancelled with a
    // reason, never deleted, because that is what the programme rule
    // counts.
    expect(methods).not.toContain('deleteAudit');
    expect(methods.length).toBeGreaterThan(12);
    const pages = files.filter((f) => !/hooks\//.test(f)).map((f) => read(f)).join('\n');
    const orphans = methods.filter((m) => !new RegExp(`\\b${m}\\b`).test(pages));
    expect(orphans).toEqual([]);
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
    });
  });

  it('the vocabulary and the finding rules live in one module', () => {
    const offenders = files.filter((f) =>
      /const\s+(FINDING_TYPES|AUDIT_STATUSES|CRITICALITIES|RESPONSE_RESULTS|ROOT_CAUSE_CATEGORIES)\s*=/
        .test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
    // And the authority imports AS8 rather than restating it.
    const authority = read(path.join(ROOT, 'src/lib/auditManagement.js'));
    expect(authority).toMatch(/from '\.\/isoCompliance'/);
    expect(authority).not.toMatch(/export const canCloseFinding\s*=/);
  });
});
