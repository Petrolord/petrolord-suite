/**
 * AS8 — the module's standing rule, as a test, for ISO Compliance.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere."
 *
 * This app is the only one in the module whose invented data was not
 * even fixed. src/data/isoComplianceData.js GENERATED thirty clauses,
 * fifteen audits, twenty findings and fifteen actions at module load:
 *
 *   score: Math.floor(Math.random() * 20) + 80,
 *   dueDate: new Date(Date.now() + Math.random() * 5000000000)...
 *
 * so the audit scores, the finding due dates and the clause review
 * dates were different on every page load, and so was the dashboard's
 * "Overall Compliance" percentage. Clause titles read "Clause Title 1"
 * to "Clause Title 30" and owners were "User 1" to "User 10".
 *
 * The shell held the four arrays in useState and passed them down as
 * props, so no page could have queried anything. Its Add Clause modal
 * read fields out of the DOM, set `status: 'Compliant'` on every
 * clause, pushed onto state and toasted "successfully registered". The
 * reports page listed four report types and rendered one. Print and
 * Export PDF toasted a download that never came.
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

const PAGES = ['Dashboard.jsx', 'Standards.jsx', 'ClauseRegister.jsx', 'InternalAudits.jsx',
  'AuditDetail.jsx', 'FindingsRegister.jsx', 'FindingDetail.jsx', 'Reports.jsx'];

describe('no invented data in ISO Compliance', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('the generator the whole app was built on is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/data/isoComplianceData.js'))).toBe(false);
  });

  it('NOTHING IN THE APP CALLS Math.random()', () => {
    // The register's numbers changed on every reload because of this.
    const offenders = files.filter((f) => /Math\.random\(/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing in the app imports a data file', () => {
    const offenders = files.filter((f) => /from\s+['"]@?\/?[\w./@-]*data\//.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file declares mock rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|isoClausesData|isoAuditsData|isoFindingsData|isoActionsData|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/
        .test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('NO GENERATED IDENTIFIER APPEARS ANYWHERE', () => {
    // CLAUSE-1000.., AUDIT-202300.., FIND-500.., ACT-800.
    //
    // The generated names — "Clause Title 7", "User 3", "Auditor 2" —
    // are not swept for here: the empty state quotes them to tell the
    // user what the app used to show, and a regex cannot tell that
    // from a fixture. Math.random() and the data-file import are the
    // checks that would catch them coming back.
    const offenders = files.filter((f) => /['"`](CLAUSE|AUDIT|FIND|ACT)-\d{3,}/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the shell routes rather than holding the register in useState', () => {
    const shell = code(path.join(APP, 'ISOCompliancePageShell.jsx'));
    expect(shell).toMatch(/<Routes>/);
    expect(shell).not.toMatch(/useState\(/);
  });

  it('every page queries through the hook', () => {
    PAGES.forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/useIsoCompliance/);
    });
  });

  it('every detail page reads the parameter its route declares', () => {
    const shell = code(path.join(APP, 'ISOCompliancePageShell.jsx'));
    expect(shell).toMatch(/path="audits\/:auditId"/);
    expect(shell).toMatch(/path="findings\/:findingId"/);
    expect(code(path.join(APP, 'AuditDetail.jsx'))).toMatch(/const \{ auditId \} = useParams\(\)/);
    expect(code(path.join(APP, 'FindingDetail.jsx'))).toMatch(/const \{ findingId \} = useParams\(\)/);
  });

  it('no detail page hardcodes a status panel', () => {
    // The old one rendered Compliant / Current / Oct 12, 2023 for any
    // id it was given.
    const offenders = files.filter((f) => /Oct 12, 2023|>Compliant</.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every create form is a controlled form that writes', () => {
    const pairs = [
      ['Standards.jsx', 'createStandard'],
      ['ClauseRegister.jsx', 'createClause'],
      ['InternalAudits.jsx', 'createAudit'],
      ['FindingsRegister.jsx', 'createFinding'],
    ];
    pairs.forEach(([page, fn]) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/useState/);
      expect(src).toMatch(/value=\{(form|creating)\./);
      expect(src).toMatch(new RegExp(`\\b${fn}\\b`));
    });
  });

  it('nothing reads a form out of the DOM', () => {
    // `new FormData(e.target)` was the old Add Clause modal's whole
    // state management.
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
        || /(?:const|let)\s+(metrics|reportData|chartData)\s*=\s*\[\s*\{/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no count is a literal standing in for a query', () => {
    const offenders = files.filter((f) =>
      /\b(value|count|score|findingsCount):\s*\d+\s*[,}]/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('there is no audit score anywhere', () => {
    // Every audit in the old register scored 80 to 100, generated. The
    // schema has no such column; this catches one being reintroduced as
    // a field rather than described in prose.
    const offenders = files.filter((f) => /(^|[^a-z])score\s*[:.]/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing answers a click with a "not implemented" toast or a download that never comes', () => {
    const offenders = files.filter((f) =>
      /isn.t implemented yet|not implemented yet|will be implemented here|view placeholder|will download shortly|Export Started|🚧/i
        .test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every export is built from rows the hook fetched', () => {
    const reports = read(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/exportToCSV\(coverage\.map/);
    expect(reports).toMatch(/exportToCSV\(findings\.map/);
    expect(read(path.join(APP, 'ClauseRegister.jsx'))).toMatch(/exportToCSV\(filtered\.map/);
  });

  it('nothing exports to PDF from this app any more', () => {
    const offenders = files.filter((f) => /exportToPDF|exportToExcel|printElement/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/useIsoCompliance.js'));
    expect(hook).toMatch(/setError\(/);
    PAGES.forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    ['Standards.jsx', 'ClauseRegister.jsx', 'InternalAudits.jsx', 'AuditDetail.jsx',
      'FindingsRegister.jsx', 'FindingDetail.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      const reports = /setFailure\(result\.error\)/.test(src) || /setFailure\(r\.error\)/.test(src);
      expect(`${page} reports write failures: ${reports}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    const hook = read(path.join(APP, 'hooks/useIsoCompliance.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  /* The gates. Each is one function in src/lib/isoCompliance.js,
     called by the page that offers the button. */

  it('a conformity claim goes through the gate', () => {
    expect(read(path.join(APP, 'hooks/useIsoCompliance.js'))).toMatch(/canSetClauseStatus/);
    expect(read(path.join(APP, 'ClauseRegister.jsx'))).toMatch(/canSetClauseStatus/);
  });

  it('the independence rule is checked where the scope is built', () => {
    expect(read(path.join(APP, 'AuditDetail.jsx'))).toMatch(/auditIndependence/);
    expect(read(path.join(APP, 'hooks/useIsoCompliance.js'))).toMatch(/auditIndependence/);
  });

  it('an audit move goes through the gate', () => {
    expect(read(path.join(APP, 'AuditDetail.jsx'))).toMatch(/canAdvanceAudit/);
    expect(read(path.join(APP, 'hooks/useIsoCompliance.js'))).toMatch(/canAdvanceAudit/);
  });

  it('closing a finding goes through the gate', () => {
    expect(read(path.join(APP, 'FindingDetail.jsx'))).toMatch(/canCloseFinding/);
    expect(read(path.join(APP, 'hooks/useIsoCompliance.js'))).toMatch(/canCloseFinding/);
  });

  it('every write method the hook exports has a caller in the app', () => {
    // AS7's lesson: a hook method with no caller is the same defect as
    // a create form with no state. Six correct, tested write paths sat
    // unreachable in that app until the page that calls them existed.
    const hook = read(path.join(APP, 'hooks/useIsoCompliance.js'));
    const returned = hook.slice(hook.lastIndexOf('return {'));
    const methods = [...returned.matchAll(/^\s{4}(\w+),$/gm)].map((m) => m[1])
      .filter((m) => /^(create|update|delete|add|remove|assess|advance|record|close|void)/.test(m));
    expect(methods.length).toBeGreaterThan(10);
    const pages = files.filter((f) => !/hooks\//.test(f)).map((f) => read(f)).join('\n');
    const orphans = methods.filter((m) => !new RegExp(`\\b${m}\\b`).test(pages));
    expect(orphans).toEqual([]);
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
      expect(src).not.toMatch(/hsl\(160, 84%/);
    });
  });

  it('the vocabulary lives in one module', () => {
    const offenders = files.filter((f) =>
      /const\s+(FINDING_TYPES|CLAUSE_STATUSES|AUDIT_STATUSES|ROOT_CAUSE_CATEGORIES)\s*=/
        .test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });
});
