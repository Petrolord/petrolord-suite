/**
 * AS3 — the module's first standing rule, as a test, for the second app.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere. An empty
 * result is an empty result... a wave is not done while a MOCK_
 * constant is reachable from a render path."
 *
 * AS2 wrote this guard for the risk register, where the invented data
 * was three badges and a fake history. Here it was worse, and it was on
 * the page people print:
 *
 *   Reports drew "Obligations by Authority" from a module-level
 *   constant — EPA 45, BSEE 32, OSHA 28, State Dept 15, Local Auth 22 —
 *   so every organization saw the same 142 obligations against four
 *   American regulators regardless of its own register;
 *   the dashboard's "Obligations Trend" was `total - 10, total - 7,
 *   total - 5, total - 2, total, total` over six hardcoded month names;
 *   "Recent Activity" said "<title> was updated" about rows nobody had
 *   updated;
 *   "Compliance Readiness Matrix" rendered the words "Matrix
 *   visualization loading..." forever;
 *   and twelve controls across the app answered a click with a toast
 *   reading "This feature isn't implemented yet, but don't worry! You
 *   can request it in your next prompt!", which names the prompt
 *   builder this app was generated in, to paying customers.
 *
 * This test is what stops them coming back.
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

/**
 * Scan code, not prose. Without this the guard reads its own
 * explanatory comments as offenders, and worse, it would let a real one
 * hide inside a commented-out block.
 */
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no invented data in Regulatory Compliance', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('no file declares mock or sample rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|mockReports|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file falls back to invented rows when a query fails or returns nothing', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /length\s*===\s*0\s*\)\s*throw/.test(src)
        || /catch\s*\([^)]*\)\s*\{\s*return\s+(MOCK|mock|local)/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing in the app answers a click with a "not implemented" toast', () => {
    const offenders = files.filter((f) => /isn.t implemented yet|not implemented yet|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart is drawn from a hardcoded array of counts', () => {
    // The exact shape of the Reports fiction: a literal array of
    // {name, count}-ish objects sitting at module scope, handed
    // straight to a chart.
    const offenders = files.filter((f) => {
      const src = code(f);
      return /(?:const|let)\s+\w*[Dd]ata\s*=\s*\[\s*\{\s*name:\s*['"][^'"]+['"]\s*,\s*(?:count|value)\s*:\s*\d/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no regulator is named in a rendered literal', () => {
    // EPA, BSEE, OSHA and "Local Auth" were printed as this
    // organization's regulators on every tenant's report.
    const offenders = files.filter((f) => {
      const src = code(f).replace(/placeholder=\{?["'`][^"'`]*["'`]\}?/g, '');
      return /\b(EPA|BSEE|OSHA)\b/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing pretends to be loading when it is not', () => {
    const offenders = files.filter((f) => /visualization loading|coming soon|will be implemented here/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('a failed load is surfaced, not rendered as an empty register', () => {
    const hook = read(path.join(APP, 'hooks/useRegulatoryCompliance.js'));
    expect(hook).toMatch(/setError\(/);
    ['Dashboard.jsx', 'Register.jsx', 'Directory.jsx', 'Reports.jsx'].forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/ErrorState/);
    });
  });

  it('every write path reports its failure to the user', () => {
    // Each of these used to be a toast that said "deleted successfully"
    // on the happy path and nothing at all on the sad one, or a service
    // call with no UI behind it whatsoever.
    ['Register.jsx', 'Directory.jsx', 'ComplianceDetail.jsx'].forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/variant: 'destructive'/);
    });
  });

  it('the obligation form exists and is wired to a create path', () => {
    // The whole app could be read and could not be filled: the form
    // file was a dashed box and addRecord() had no caller.
    const form = read(path.join(APP, 'components/ObligationForm.jsx'));
    expect(form).toMatch(/onSubmit/);
    expect(read(path.join(APP, 'NewCompliance.jsx'))).toMatch(/createObligation/);
    expect(read(path.join(APP, 'Directory.jsx'))).toMatch(/createAuthority/);
  });

  it('the org comes from the auth context, not from a second membership query', () => {
    // compliancePermissionsService read organization_members directly
    // and took the first active row, which could be a different
    // organization from the one the rest of the Suite is showing.
    const offenders = files.filter((f) => /from\(['"]organization_members['"]\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
    expect(read(path.join(APP, 'hooks/useRegulatoryCompliance.js'))).toMatch(/useAuth/);
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
    });
  });

  // AS13: the classes removed in the help-guide pass.
  it('no file passes a .csv name to exportToCSV, which appends .csv itself', () => {
    // Register and Reports downloaded compliance-register-<date>.csv.csv.
    const offenders = files.filter((f) =>
      /exportToCSV\([\s\S]{0,1500}?\.csv[`'"]\s*,?\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every delete asks for confirmation first', () => {
    ['ComplianceDetail.jsx', 'Register.jsx', 'Directory.jsx'].forEach((page) => {
      const src = code(path.join(APP, page));
      expect(`${page}: ${/<ConfirmDelete/.test(src)}`).toBe(`${page}: true`);
      // No button calls a delete handler directly.
      expect(src).not.toMatch(/onClick=\{\(?e?\)?\s*=>\s*handleDelete\(|onClick=\{handleDelete\}/);
    });
  });

  it('the evidence card does not explain a status the obligation does not have', () => {
    // It said "That is why it reads On track rather than Compliant" on
    // Overdue, Expired and Draft obligations alike.
    const src = code(path.join(APP, 'ComplianceDetail.jsx'));
    expect(src).toMatch(/status === STATUS\.ON_TRACK[\s\S]{0,120}rather than Compliant/);
    expect(src).not.toMatch(/hasAs3Schema \? 'On track rather than Compliant'/);
  });

  it('the form only offers What it requires where it can be saved', () => {
    const src = code(path.join(APP, 'components/ObligationForm.jsx'));
    expect(src).toMatch(/hasAs3Schema \? \(\s*<div className="md:col-span-2">\s*<Label htmlFor="description">/);
  });

  it('no toast claims something happened that did not', () => {
    const offenders = files.filter((f) =>
      /recorded in audit log|would open here|coming soon|Contacting support/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('an empty register is never read as proof of the new schema (AS13 hardening)', () => {
    // `if (rows.length && !('lifecycle' in rows[0])) as3 = false;` left
    // an empty register on the new schema by assumption.
    const hook = code(path.join(APP, 'hooks/useRegulatoryCompliance.js'));
    expect(hook).not.toMatch(/rows\.length\s*&&\s*!\('lifecycle' in rows\[0\]\)\)\s*as3\s*=\s*false/);
    expect(hook).toMatch(/from\('regulatory_obligations'\)\.select\('lifecycle'\)\.limit\(1\)/);
  });

  it('every page that saves reads the save\'s warning, so a dropped field is never a plain success', () => {
    const savers = files.filter((f) => /\.jsx$/.test(f)
      && /await\s+(createObligation|updateObligation|createAuthority|updateAuthority|recordSubmission)\(/.test(code(f)));
    expect(savers.length).toBeGreaterThan(1);
    const offenders = savers.filter((f) => !/\.warning\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the obligation form page shows the schema notice', () => {
    expect(code(path.join(APP, 'NewCompliance.jsx'))).toMatch(/!hasAs3Schema \? <SchemaNotice \/> : null/);
  });
});
