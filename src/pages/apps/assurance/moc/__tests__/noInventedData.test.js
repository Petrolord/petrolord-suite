/**
 * AS6 — the module's standing rule, as a test, for the app that had no
 * data at all.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere."
 *
 * Management of Change had nothing to fail open from. Seven moc_*
 * tables existed and not one page issued a query. The register was five
 * literals, the dashboard's tiles were 42 / 12 / 5 / 128, the approval
 * queue was two literals, the detail page defaulted its own id, and the
 * create form had no state: no `value`, no `onChange`, no `useState`
 * for any field. Submitting ran setTimeout(800) and toasted "Record
 * MOC-2026-090 has been created successfully".
 *
 * Three of those literal sets were exportable to CSV, Excel and PDF —
 * including the temporary-change expiry report, which is the one
 * document in this app that says which deviations a facility is running
 * on and for how much longer.
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

const PAGES = ['Dashboard.jsx', 'Register.jsx', 'NewMOC.jsx', 'Approvals.jsx',
  'Reports.jsx', 'MOCDetail.jsx'];

describe('no invented data in Management of Change', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('no file declares mock rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|mockReports|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('NO HARDCODED MOC NUMBER APPEARS ANYWHERE', () => {
    // MOC-2026-089 down to -077 in the register, MOC-2026-090 in the
    // create toast, MOC-2026-089 as the detail page's default id,
    // MOC-2026-015 and -033 in the dashboard's expiry warning, and
    // MOC-012/044/088/091 in the reports expiry chart.
    const offenders = files.filter((f) => /MOC-\d{3,}/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the detail page does not default its own id', () => {
    // `const { id = 'MOC-2026-089' } = useParams()` rendered one
    // hardcoded record whatever the URL said.
    const detail = code(path.join(APP, 'MOCDetail.jsx'));
    expect(detail).toMatch(/const \{ id \} = useParams\(\)/);
    expect(detail).not.toMatch(/useParams\(\)[\s\S]{0,80}=\s*['"]MOC/);
  });

  it('every page queries through the hook', () => {
    PAGES.forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/useManagementOfChange/);
    });
  });

  it('the create form is a controlled form', () => {
    // Not one input carried a value or an onChange, and there was no
    // useState for any field, so nothing the user typed was even read.
    const form = read(path.join(APP, 'NewMOC.jsx'));
    expect(form).toMatch(/useState/);
    expect(form).toMatch(/value=\{form\./);
    expect(form).toMatch(/onChange=\{set\(/);
    expect(form).toMatch(/createMoc/);
  });

  it('nothing fakes a delay to look like a save', () => {
    // setTimeout(() => { toast('...created successfully') }, 800)
    const offenders = files.filter((f) => /setTimeout\([^)]*,\s*\d{3,}\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart or table is drawn from a hardcoded array', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /(?:const|let)\s+\w*[Dd]ata\s*=\s*\[\s*\{\s*(?:name|id):\s*['"]/.test(src)
        || /(?:const|let)\s+(queue|metrics|recentActivity)\s*=\s*\[\s*\{/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no count is a literal standing in for a query', () => {
    const offenders = files.filter((f) =>
      /\b(value|count|daysLeft):\s*\d+\s*[,}]/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing in the app answers a click with a "not implemented" toast', () => {
    const offenders = files.filter((f) =>
      /isn.t implemented yet|not implemented yet|would open here|dialog would open|Moving to next stage|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every export is built from rows the hook fetched', () => {
    const register = read(path.join(APP, 'Register.jsx'));
    expect(register).toMatch(/exportToCSV\(filtered\.map/);
    const reports = read(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/exportToCSV\(records\.map/);
    expect(reports).toMatch(/exportToCSV\(expiryRows\.map/);
  });

  it('nothing exports to PDF or Excel from this app any more', () => {
    // Three pages offered CSV, Excel AND PDF of hardcoded rows. A PDF
    // of an invented change register is the kind of file that ends up
    // in an audit pack.
    const offenders = files.filter((f) => /exportToPDF|exportToExcel|printElement/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/useManagementOfChange.js'));
    expect(hook).toMatch(/setError\(/);
    PAGES.forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    ['NewMOC.jsx', 'MOCDetail.jsx', 'Approvals.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      const reports = /variant: 'destructive'/.test(src) || /setFailure\(result\.error\)/.test(src);
      expect(`${page} reports write failures: ${reports}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    const hook = read(path.join(APP, 'hooks/useManagementOfChange.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  it('an approval decision is written, not toasted', () => {
    // Clicking Approve toasted "Approval recorded for MOC-2026-088" and
    // recorded nothing. An MOC approval is a named person authorising a
    // change to a facility.
    const hook = read(path.join(APP, 'hooks/useManagementOfChange.js'));
    expect(hook).toMatch(/from\('moc_approvals'\)[\s\S]{0,120}\.update\(/);
    expect(read(path.join(APP, 'Approvals.jsx'))).toMatch(/decideApproval/);
  });

  it('every stage move goes through the gate', () => {
    const hook = read(path.join(APP, 'hooks/useManagementOfChange.js'));
    expect(hook).toMatch(/canAdvance/);
    expect(read(path.join(APP, 'MOCDetail.jsx'))).toMatch(/canAdvance/);
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
      'apps/assurance/management-of-change');
    expect(declared.length).toBeGreaterThan(4);
    const targets = baseTargets(files.map((f) => ({ file: rel(f), src: code(f) })));
    expect(targets.length).toBeGreaterThan(10);
    expect(unresolved(declared, targets)).toEqual([]);
  });

  it('no button in the shell is dead', () => {
    // AS13: "Support Guide" had no onClick.
    const shell = code(path.join(APP, 'components/MOCPageShell.jsx'));
    expect(shell).not.toMatch(/Support Guide/);
    expect(read(path.join(APP, 'components/MOCPageShell.jsx')))
      .toMatch(/<AssuranceHelp appKey="moc" \/>/);
  });

  it('the header search is a real search that reaches the register', () => {
    // It was uncontrolled and only navigated on focus, discarding the text.
    const shell = code(path.join(APP, 'components/MOCPageShell.jsx'));
    expect(shell).toMatch(/value=\{query\}/);
    expect(shell).toMatch(/register\?q=/);
    expect(shell).not.toMatch(/onFocus=\{\(\) => navigate/);
    expect(code(path.join(APP, 'Register.jsx'))).toMatch(/params\.get\('q'\)/);
  });

  it('the phone footer reaches every section', () => {
    // slice(0, 4) dropped Reports.
    expect(code(path.join(APP, 'components/MOCPageShell.jsx'))).not.toMatch(/navItems\.slice\(/);
  });

  it('no copy claims the risk level sets the approval gates', () => {
    // Nothing reads risk_level to add or require a gate.
    files.forEach((f) => {
      expect(`${rel(f)}: ${/risk level is what decides/i.test(code(f))}`)
        .toBe(`${rel(f)}: false`);
    });
  });

  it('what the dashboard says appears in Recent activity is logged', () => {
    const hook = code(path.join(APP, 'hooks/useManagementOfChange.js'));
    ['addActions', 'updateAction', 'addImpacts'].forEach((fn) => {
      const start = hook.indexOf(`const ${fn} = async`);
      const body = hook.slice(start, hook.indexOf('\n  };', start));
      expect(`${fn}: ${/logActivity\(/.test(body)}`).toBe(`${fn}: true`);
    });
  });

  it('a temporary draft cannot be saved without the expiry date, and a stuck one can gain it', () => {
    expect(code(path.join(APP, 'utils/mocPayload.js'))).not.toMatch(/form\.stage !== 'Draft'/);
    expect(code(path.join(APP, 'MOCDetail.jsx'))).toMatch(/setExpiry\(/);
  });

  it('a final change is locked on the page and in the hook', () => {
    expect(code(path.join(APP, 'MOCDetail.jsx'))).toMatch(/mocLockReason\(moc\)/);
    const hook = code(path.join(APP, 'hooks/useManagementOfChange.js'));
    ['addApprover', 'decideApproval', 'addActions', 'updateAction', 'addImpacts'].forEach((fn) => {
      const start = hook.indexOf(`const ${fn} = async`);
      expect(hook.slice(start, start + 300)).toMatch(/lockedMoc\(/);
    });
  });

  it('deleting a change asks first', () => {
    const detail = code(path.join(APP, 'MOCDetail.jsx'));
    expect(detail).toMatch(/<ConfirmDelete/);
    expect(detail).not.toMatch(/onClick=\{handleDelete\}/);
  });

  it('no badge prints the rule state "No expiry" beside a date', () => {
    const badges = code(path.join(APP, 'components/MOCBadges.jsx'));
    expect(badges).toMatch(/expiryDisplay\(/);
    expect(badges).not.toMatch(/\{state\}/);
  });
});
