/**
 * AS2 — the module's first standing rule, as a test.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere. An empty
 * result is an empty result... a wave is not done while a MOCK_ constant
 * is reachable from a render path."
 *
 * The risk register was the honest app in this module and it still
 * printed three things that were not true of the risk on screen:
 *
 *   two tag badges, "Drilling" and "High Priority", as JSX literals on
 *   every risk in every organization;
 *   one linked risk, "RSK-1002 (Dependency)", the same way;
 *   a "Scoring History" that restated the current score as a creation
 *   event and reported "Pending mitigation validation" whether or not
 *   a residual assessment existed.
 *
 * This test is what stops them coming back, and it is the template for
 * AS4 to AS10, where the invented data is far worse.
 */
import fs from 'fs';
import path from 'path';

const APP = path.resolve(__dirname, '..');

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
const rel = (f) => path.relative(path.resolve(__dirname, '../../../../..'), f);
const read = (f) => fs.readFileSync(f, 'utf8');

/**
 * Scan code, not prose. Without this the guard reads its own
 * explanatory comments as offenders, and worse, it would let a real one
 * hide inside a commented-out block.
 */
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no invented data in the risk register', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no file declares mock or sample rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|mockReports|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file falls back to invented rows when a query fails or returns nothing', () => {
    // The shape that made Document Control and Peer Review Manager lie:
    // `if (!data || data.length === 0) throw` and then `catch { return MOCK }`.
    const offenders = files.filter((f) => {
      const src = code(f);
      return /length\s*===\s*0\s*\)\s*throw/.test(src)
        || /catch\s*\([^)]*\)\s*\{\s*return\s+(MOCK|mock|local)/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no hardcoded risk code appears in a rendered literal', () => {
    // 'RSK-1002 (Dependency)' was printed as this risk's link on every
    // risk. Placeholders in an input are fine; rendered text is not.
    const offenders = files.filter((f) => {
      const src = code(f).replace(/placeholder=\{?["'`][^"'`]*["'`]\}?/g, '');
      return />\s*RSK-\d+|RSK-\d+\s*\(/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no hardcoded tag badge', () => {
    const offenders = files.filter((f) => /<Tag [^>]*\/>\s*(Drilling|High Priority)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing in the app answers a click with a "not implemented" toast', () => {
    const offenders = files.filter((f) => /isn.t implemented yet|not implemented yet|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the register surfaces a load failure instead of showing an empty list', () => {
    const hook = read(path.join(APP, 'hooks/useRiskRegister.js'));
    expect(hook).toMatch(/setError\(/);
    const dashboard = read(path.join(APP, 'RiskRegisterDashboardPage.jsx'));
    expect(dashboard).toMatch(/error/);
  });

  it('a failed status change is reported', () => {
    const detail = read(path.join(APP, 'RiskDetailPage.jsx'));
    // handleStatusChange used to have no else branch at all.
    const fn = /handleStatusChange[\s\S]*?\n  \};/.exec(detail);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/destructive/);
  });

  // AS13: the classes removed in the help-guide pass.
  it('no invented export history', () => {
    // RiskReportingContext seeded "Export History" with "Q2 Board Pack"
    // and "HSE Monthly Review" for every organization.
    const offenders = files.filter((f) =>
      /Q2 Board Pack|HSE Monthly Review|setReportHistory|reportHistory/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no toast claims something happened that did not', () => {
    const offenders = files.filter((f) =>
      /recorded in audit log|would open here|coming soon|Contacting support|rendering engine initialized|Initialized`/i
        .test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no handler is named as a mock', () => {
    const offenders = files.filter((f) => /handleMockAction|Mock Report History/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file passes a .csv name to a helper that appends .csv', () => {
    const offenders = files.filter((f) => /exportTo(CSV|Csv)\([\s\S]{0,800}?\.csv[`'"]\s*,?\s*\)/.test(code(f))
      || /exportDataAsCSV\([^)]*\.csv/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the shell uses the app reporting provider, not a standalone hook', () => {
    expect(fs.existsSync(path.resolve(APP, '../../../hooks/useRiskReporting.js'))).toBe(false);
    const offenders = files.filter((f) => /@\/hooks\/useRiskReporting/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the old help drawer, with its dead search box and support button, is gone', () => {
    expect(fs.existsSync(path.join(APP, 'components/HelpGuide.jsx'))).toBe(false);
  });

  it('no builder column or template reports an owner that nothing records', () => {
    const offenders = files.filter((f) => /['"]owner_id['"]/.test(code(f))
      && !/riskPayload\.js$/.test(f));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the dashboard list is not titled for a band filter it does not apply', () => {
    const dashboard = code(path.join(APP, 'RiskRegisterDashboardPage.jsx'));
    expect(dashboard).not.toMatch(/Top Critical & High Risks/);
  });

  it('no component words an appetite answer of its own (AS13 hardening)', () => {
    // RiskForm read "Not assessed" with no appetite for a risk the
    // detail page judged Above appetite on its inherent score. Appetite
    // words come from getAppetiteStatus (or appetitePreview) only.
    const offenders = files.filter((f) => !/utils\/riskPayload\.js$/.test(f)
      && /`Appetite: \$\{/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('an empty register is probed for its columns, not assumed current', () => {
    const hook = code(path.join(APP, 'hooks/useRiskRegister.js'));
    expect(hook).toMatch(/from\('risk_register'\)\.select\('target_score'\)\.limit\(1\)/);
  });
});
