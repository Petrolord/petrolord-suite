/**
 * AS7 — the module's standing rule, as a test, for Quality Assurance
 * Plan & NCR.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere."
 *
 * There was nothing to fail open from. No page in this app issued a
 * query of any kind. The register was six plans written out by hand in
 * src/data/qa-plan/qaPlanSampleData.js, the ITP under them was two
 * checkpoints from checkpointSampleData.js, the NCR register was two
 * rows from ncrSampleData.js, and the dashboard's "Pending Checks"
 * tile was the literal 12. The detail page read `useParams().id`
 * against a route that declared `:qaPlanId`, so `id` was always
 * undefined and every row in the register opened the same invented
 * plan. The reports page rendered the strings "[Chart Visualization:
 * Active 60%, Draft 20%, Closed 20%]" and "[Chart Visualization:
 * Engineering 12, Drilling 5, Projects 8]" where its two charts should
 * have been, over an Export Dashboard button that toasted
 * "Downloading PDF..." and downloaded nothing.
 *
 * And the NCR lifecycle did not exist at all: the register's rows
 * navigated to a route the shell never declared, so there was nowhere
 * to agree a disposition, record a root cause, raise a corrective
 * action, check whether it worked, or close a non-conformance.
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

const PAGES = ['Dashboard.jsx', 'Register.jsx', 'NewQAPlan.jsx', 'QAPlanDetail.jsx',
  'NCRRegister.jsx', 'NCRDetail.jsx', 'Reports.jsx'];

describe('no invented data in Quality Assurance Plan', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('the sample data files the app was built on are gone', () => {
    ['qaPlanSampleData.js', 'checkpointSampleData.js', 'ncrSampleData.js',
      'capaSampleData.js'].forEach((f) => {
      expect(fs.existsSync(path.join(ROOT, 'src/data/qa-plan', f))).toBe(false);
    });
  });

  it('nothing in the app imports a data file', () => {
    const offenders = files.filter((f) => /from\s+['"]@?\/?[\w./@-]*data\//.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file declares mock rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|mockPlans|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('NO HARDCODED PLAN OR NCR NUMBER APPEARS ANYWHERE', () => {
    // QAP-2026-001 to -006 in the register and as the detail page's
    // fallback, NCR-2026-001 and -002 in the NCR register.
    const offenders = files.filter((f) => /\b(QAP|NCR|ITP)-\d{3,}/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the detail page reads the parameter the route declares', () => {
    // `useParams().id` against a `:qaPlanId` route meant every row
    // opened the first invented plan.
    const shell = code(path.join(APP, 'QAPlanPageShell.jsx'));
    const detail = code(path.join(APP, 'QAPlanDetail.jsx'));
    expect(shell).toMatch(/path=":planId"/);
    expect(detail).toMatch(/const \{ planId \} = useParams\(\)/);
    expect(detail).not.toMatch(/useParams\(\)[\s\S]{0,80}=\s*['"]QAP/);
  });

  it('a non-conformance has a page to be worked on', () => {
    // The register navigated to ncr/:id and the shell declared no such
    // route, so every click fell through onto the dashboard.
    const shell = code(path.join(APP, 'QAPlanPageShell.jsx'));
    expect(shell).toMatch(/path="ncr\/:ncrId"/);
    const detail = code(path.join(APP, 'NCRDetail.jsx'));
    expect(detail).toMatch(/const \{ ncrId \} = useParams\(\)/);
  });

  it('every page queries through the hook', () => {
    PAGES.forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/useQualityAssurance/);
    });
  });

  it('every create form is a controlled form that writes', () => {
    const plan = read(path.join(APP, 'NewQAPlan.jsx'));
    expect(plan).toMatch(/useState/);
    expect(plan).toMatch(/value=\{form\./);
    expect(plan).toMatch(/createPlan/);
    const ncr = read(path.join(APP, 'NCRRegister.jsx'));
    expect(ncr).toMatch(/value=\{form\./);
    expect(ncr).toMatch(/createNcr/);
  });

  it('nothing fakes a delay to look like a save', () => {
    const offenders = files.filter((f) => /setTimeout\([^)]*,\s*\d{3,}\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart is a sentence describing a chart', () => {
    // "[Chart Visualization: Active 60%, Draft 20%, Closed 20%]"
    const offenders = files.filter((f) => /\[Chart Visualization/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart or table is drawn from a hardcoded array', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /(?:const|let)\s+\w*[Dd]ata\s*=\s*\[\s*\{\s*(?:name|id):\s*['"]/.test(src)
        || /(?:const|let)\s+(metrics|recentPlans|recentNcrs)\s*=\s*\[\s*\{/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no count is a literal standing in for a query', () => {
    // The dashboard's "Pending Checks" tile was the number 12.
    const offenders = files.filter((f) =>
      /\b(value|count|pending|progress):\s*\d+\s*[,}]/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing in the app answers a click with a "not implemented" toast', () => {
    const offenders = files.filter((f) =>
      /isn.t implemented yet|not implemented yet|will be implemented here|would open here|dialog would open|Downloading PDF|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every export is built from rows the hook fetched', () => {
    const register = read(path.join(APP, 'Register.jsx'));
    expect(register).toMatch(/exportToCSV\(/);
    const reports = read(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/exportToCSV\(plans\.map/);
    expect(reports).toMatch(/exportToCSV\(ncrs\.map/);
    expect(reports).toMatch(/exportToCSV\(outstanding\.map/);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/useQualityAssurance.js'));
    expect(hook).toMatch(/setError\(/);
    PAGES.forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    ['NewQAPlan.jsx', 'QAPlanDetail.jsx', 'NCRRegister.jsx', 'NCRDetail.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      const reports = /variant: 'destructive'/.test(src) || /setFailure\(result\.error\)/.test(src)
        || /setFailure\(result\.error\)/.test(src);
      expect(`${page} reports write failures: ${reports}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    const hook = read(path.join(APP, 'hooks/useQualityAssurance.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  /**
   * The gates. Every refusal in this app is one function in
   * src/lib/qualityAssurance.js, called by the page that offers the
   * button, so a user is told which condition is unmet rather than
   * being allowed through and corrected by a database constraint.
   */
  it('a checkpoint decision goes through the gate', () => {
    const hook = read(path.join(APP, 'hooks/useQualityAssurance.js'));
    expect(hook).toMatch(/canDecideCheckpoint/);
    expect(read(path.join(APP, 'QAPlanDetail.jsx'))).toMatch(/decideCheckpoint/);
  });

  it('a plan move goes through the gate', () => {
    expect(read(path.join(APP, 'QAPlanDetail.jsx'))).toMatch(/canAdvancePlan/);
  });

  it('closing a non-conformance goes through the gate', () => {
    const hook = read(path.join(APP, 'hooks/useQualityAssurance.js'));
    expect(hook).toMatch(/canCloseNcr/);
    const detail = read(path.join(APP, 'NCRDetail.jsx'));
    expect(detail).toMatch(/canCloseNcr/);
    expect(detail).toMatch(/closeNcr/);
  });

  it('the NCR lifecycle is reachable: disposition, cause, action, effectiveness', () => {
    const detail = read(path.join(APP, 'NCRDetail.jsx'));
    ['setDisposition', 'updateNcr', 'addCapas', 'updateCapa', 'recordEffectiveness',
      'voidNcr'].forEach((fn) => expect(detail).toMatch(new RegExp(`\\b${fn}\\b`)));
  });

  it('the scoring and gate vocabulary lives in one module', () => {
    // Two places that both know when an NCR may close is the defect
    // this module is most likely to grow.
    const offenders = files.filter((f) => {
      const src = code(f);
      return /NCR_EFFECTIVENESS_REQUIRED\s*=|const\s+DISPOSITIONS\s*=|const\s+POINT_TYPES\s*=/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
    files.filter((f) => /qualityAssurance/.test(code(f))).forEach((f) => {
      expect(code(f)).toMatch(/@\/lib\/qualityAssurance|\.\.\/utils\/qaPayload|\.\/utils\/qaPayload/);
    });
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
    });
  });
});
