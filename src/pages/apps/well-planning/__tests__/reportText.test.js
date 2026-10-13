// The report pack prints only what jsPDF's standard fonts can draw
// (2026-10-13, video dry run: "uncertainty (2\u00c3)" and "\u00c3 projection-ahead"
// where a Greek sigma was meant), with angles rounded, and the saved-run
// labels without an em dash and with SF to 2 decimals.

jest.mock('jspdf-autotable', () => ({}));
jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => {
  const calls = {
    text: [], tableHeads: [], tableBodies: [], lines: 0, circles: 0, pages: 1, saveName: null,
  };
  const doc = {
    internal: { pageSize: { width: 210, height: 297 }, getNumberOfPages: () => calls.pages },
    lastAutoTable: { finalY: 60 },
    setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {}, setFont() {},
    setDrawColor() {}, setLineWidth() {}, setPage() {}, addImage() {},
    setLineDashPattern() {},
    line() { calls.lines += 1; },
    circle() { calls.circles += 1; },
    text(t) { if (typeof t === 'string') calls.text.push(t); },
    autoTable(opts) {
      calls.tableHeads.push((opts.head?.[0] || []).join('|'));
      calls.tableBodies.push(opts.body || []);
      this.lastAutoTable = { finalY: (this.lastAutoTable.finalY || 45) + 30 };
    },
    addPage() { calls.pages += 1; },
    save(name) { calls.saveName = name; },
    __calls: calls,
  };
    global.__lastDoc = doc;
    return doc;
  }),
}));

import {
  generateWallPlot, generateSurveyListing, generateAcReport,
} from '../services/reportPack';
import { buildTrajectoryContract } from '../services/trajectoryContract';
import { fmtSf, runOptionLabel } from '../services/acUtils';

const WELLBORE = {
  name: 'Ekene-11', uwi: null, head_x: 401705, head_y: 521600, kb_elev_m: 24.9936,
  depth_unit: 'ft', azimuth_reference: 'grid', grid_convergence_deg: 0.07291183644136559,
  mag_declination_deg: -0.46271234567,
};
const stations = [];
for (let i = 0; i <= 30; i++) stations.push({ md: i * 66, inc: Math.min(19, i * 1.5), azi: 74.61 });
const contract = buildTrajectoryContract({
  site: { name: 'Ekene Alpha', crs: 'EPSG:32632', xy_unit: 'm' }, wellbore: WELLBORE,
  design: { name: 'Plan 1', revision: 1, status: 'draft' }, stations, generatedAt: '2026-10-13T12:00:00Z',
});
const run = {
  reference: 'plan', created_at: '2026-10-13T15:53:21Z',
  params: { k: 3.5, sigmaPa: 0.5, Sm: 0.3, refRadius: 0.4572, offRadius: 0.3048, noGo: 1.0, review: 1.5 },
  summary: { status: 'clear', overallMinSf: 1.8465, offsetCount: 4 },
  results: ['Ekene-9 (registry)', 'Ekene-8 (registry)', 'Ekene-12 (actual survey to 6,234 ft MD)', 'Ekene-10 (actual survey to 7,382 ft MD)'].map((label, i) => ({
    id: `o${i}`, label, kind: i < 2 ? 'geo' : 'wp-actual', status: 'clear', minSf: 1.85 + i, minSfMd: 152,
    md: [0, 152, 400, 2000], sf: [5 + i, 1.85 + i, 9, 20], distanceCC: [5, 5, 30, 300],
  })),
};

/** Every string a generator wrote: text calls, table heads and cells. */
const written = () => {
  const c = global.__lastDoc.__calls;
  return [...c.text, ...c.tableHeads, ...c.tableBodies.flat(2).map((v) => String(v))];
};
/** Characters outside Latin-1 (what the standard PDF fonts cannot draw). */
export const nonLatin1 = (strings) => strings.filter((s) => /[^\u0000-\u00ff]/.test(s));

describe('report text is drawable', () => {
  test('negative control: the gate catches a Greek sigma', () => {
    expect(nonLatin1(['ISCWSA MWD Rev4 uncertainty (2\u03c3)', 'plain'])).toEqual(['ISCWSA MWD Rev4 uncertainty (2\u03c3)']);
  });
  test('wall plot', async () => {
    await generateWallPlot({ contract, targets: [{ name: 'T1 Oboro Sand', n: 150, e: 545, tvdss: 1885.36, radius: null }], magRef: { bTotalNT: 32952, dipDeg: -17.67 }, generatedAt: '2026-10-13 16:53' });
    const w = written();
    expect(nonLatin1(w)).toEqual([]);
    expect(w.join('\n')).toMatch(/2 sigma/);
    // angles to 4 decimals, as the app shows them
    expect(w).toContain('0.0729 deg');
    expect(w).toContain('-0.4627 deg');
    expect(w.join('\n')).not.toMatch(/0\.072911/);
  });
  test('survey listing', async () => {
    await generateSurveyListing({ contract, generatedAt: '2026-10-13 16:53' });
    expect(nonLatin1(written())).toEqual([]);
  });
  test('anti-collision report: sigma in words, legend below the ladder', async () => {
    await generateAcReport({ run, wellName: 'Ekene-11', designLabel: 'Plan 1 r1', generatedAt: '2026-10-13 16:53', depthUnit: 'ft' });
    const w = written();
    expect(nonLatin1(w)).toEqual([]);
    expect(w).toContain('sigma pa (projection ahead)');
    expect(w).toContain('Ekene-10 (actual survey to 7,382 ft MD)');
  });
});

describe('saved-run labels', () => {
  test('SF to 2 decimals, no em dash', () => {
    expect(fmtSf(1.8465)).toBe('1.85');
    expect(fmtSf(null)).toBe('--');
    const label = runOptionLabel(run, { locale: 'en-GB' });
    expect(label).toMatch(/, CLEAR, min SF 1\.85 \(4 offsets\)$/);
    expect(label).not.toMatch(/\u2014/);
  });
});
