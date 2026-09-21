/**
 * AS11 — the Assurance hub page, held to the module's standing rule.
 *
 * The page this replaces rendered "Active MOCs 12", "Pending Approval
 * 4", "MOC-2026-042 Review", "Subsea Tie-back Installation QA" and a
 * pie of 3/4/5/28 to every organization, beside three real panels, and
 * polled three tables every thirty seconds. The module's defect classes
 * (Assurance-ROADMAP.md §6 and the AS3-AS10 STATUS sections) are
 * checked across the page, its hook and its logic together, because
 * AS6 showed that reading page by page misses what a whole-tree regex
 * finds.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const FILES = [
  'src/pages/dashboard/AssuranceHub.jsx',
  'src/hooks/useAssuranceHub.js',
  'src/lib/assuranceHub.js',
];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const PAGE = 'src/pages/dashboard/AssuranceHub.jsx';

describe('the Assurance hub invents nothing', () => {
  it('the old page, hook and orphan dashboard are gone', () => {
    ['src/pages/dashboard/Assurance.jsx', 'src/hooks/useAssuranceAnalytics.js',
      'src/pages/dashboard/AssuranceAndCompliance.jsx']
      .forEach((f) => expect(fs.existsSync(path.join(ROOT, f))).toBe(false));
  });

  it('App.jsx routes the hub to this page', () => {
    const app = read('src/App.jsx');
    expect(app).toMatch(/import\('@\/pages\/dashboard\/AssuranceHub'\)/);
    expect(app).toMatch(/path="assurance" element=\{<AppRoute appName="assurance"><AssuranceHub \/>/);
  });

  it('no record number is written into any file', () => {
    const offenders = FILES.filter((f) =>
      /['"`>](MOC|QAP|NCR|RSK|REG|PR|LL|AUD|AF|IA|F)-\d/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('no metric is a string literal', () => {
    // The old page: renderMetric("Active MOCs", "12", ...).
    expect(code(PAGE)).not.toMatch(/,\s*["'`]\d+["'`]\s*[,\]]/);
    expect(code(PAGE)).not.toMatch(/value:\s*\d+\s*}/);
  });

  it('nothing is random, mocked or sampled', () => {
    FILES.forEach((f) => {
      const src = code(f);
      expect(src).not.toMatch(/Math\.random\(/);
      expect(src).not.toMatch(/\b(MOCK_[A-Z_]+|mockData|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/);
    });
  });

  it('no control tells a customer to ask the prompt builder, or does nothing', () => {
    const src = code(PAGE);
    expect(src).not.toMatch(/next prompt|isn't implemented|not implemented/i);
    // The dead "Share Workspace" and "Add Custom App" buttons other hubs carry.
    expect(src).not.toMatch(/Share Workspace|Add Custom App/);
    expect(src).not.toMatch(/Exporting MOC data/);
  });

  it('every navigate() takes a route from the hub logic, never a literal', () => {
    const src = code(PAGE);
    expect(src).not.toMatch(/navigate\(\s*['"`]/);
    expect(src).toMatch(/navigate\(i\.href\)/);
    expect(src).toMatch(/navigate\(a\.base\)/);
  });

  it('every panel is drawn for every one of the nine apps from HUB_APPS', () => {
    const src = code(PAGE);
    expect(src).toMatch(/HUB_APPS\.map\(\(a\) =>/);
    const keys = ['risk', 'regulatory', 'documents', 'peerReview', 'moc',
      'quality', 'iso', 'lessons', 'audits'];
    keys.forEach((k) => expect(src).toMatch(new RegExp(`\\b${k}: \\(s\\) =>`)));
  });

  it('charts follow the Suite standard: white theme and the watermark', () => {
    const src = code(PAGE);
    expect(src).toMatch(/from '@\/utils\/chartTheme'/);
    expect(src).toMatch(/<ChartLogo \/>/);
    expect(src).toMatch(/backgroundColor: CHART_COLORS\.background/);
    // The old page's own dark palette.
    expect(src).not.toMatch(/hsl\(0, 84%, 60%\)|hsl\(218, 23%, 23%\)/);
  });

  it('the CSV is built from the listed items, not from anything else', () => {
    expect(code(PAGE)).toMatch(/const rows = filtered\.map\(/);
  });

  it('an app that cannot be read is named, never shown as zero', () => {
    const src = code(PAGE);
    expect(src).toMatch(/Not set up in this environment yet/);
    expect(src).toMatch(/could not be read/);
  });
});
