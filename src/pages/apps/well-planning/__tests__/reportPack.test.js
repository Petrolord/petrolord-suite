// WD6 report pack: assert which sections each PDF emits against a
// mocked jsPDF (the house pattern from ReservoirCalcPro's
// reportGenerator.test). Real geometry comes from the validated
// engines via buildTrajectoryContract; here we pin the report
// structure — header blocks, chart frames, tables, footers.

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

const WELLBORE = {
  name: 'HAR-1', uwi: null, head_x: 500000, head_y: 6800000, kb_elev_m: 30,
  depth_unit: 'm', azimuth_reference: 'grid', grid_convergence_deg: -1.2,
  mag_declination_deg: -4,
};
const SITE = { name: 'Pad A', crs: 'EPSG:32631', xy_unit: 'm' };
const DESIGN = { name: 'Base plan', revision: 2, status: 'definitive' };

const stations = [];
for (let i = 0; i <= 30; i++) stations.push({ md: i * 100, inc: Math.min(60, i * 3), azi: 45 });
const contract = buildTrajectoryContract({
  site: SITE, wellbore: WELLBORE, design: DESIGN, stations, generatedAt: '2026-08-25T12:00:00Z',
});

const texts = () => global.__lastDoc.__calls.text.join('\n');
const heads = () => global.__lastDoc.__calls.tableHeads;

describe('generateWallPlot', () => {
  test('emits title block, both chart frames, key stations and targets', async () => {
    await generateWallPlot({
      contract,
      targets: [{ name: 'Amber', n: 1000, e: 800, tvdss: 2400, radius: 120 }],
      uncertainty: {
        ellipses: [{ e: 100, n: 100, semiMajor: 20, semiMinor: 10, azimuthDeg: 30 }],
        band: {
          up: contract.stations.map((s) => ({ vs: s.vs, tvd: s.tvd - 5 })),
          down: contract.stations.map((s) => ({ vs: s.vs, tvd: s.tvd + 5 })),
        },
      },
      magRef: { bTotalNT: 50000, dipDeg: 72, declinationDeg: -4 },
      generatedAt: '2026-08-25 12:00',
    });
    const t = texts();
    expect(t).toMatch(/Wall plot: HAR-1/);
    expect(t).toMatch(/Plan view \(N vs E, m\)/);
    expect(t).toMatch(/Section view \(TVD vs VS, m\)/);
    // both wall-plot views are true scale and say so on the plot
    expect(t).toMatch(/True scale \(1:1\)/);
    expect(t).toMatch(/Amber/);
    expect(t).toMatch(/ISCWSA MWD Rev4 uncertainty/);
    expect(heads()).toEqual(expect.arrayContaining([
      expect.stringContaining('Well header'),
      'MD|Inc|Azi|TVD|N|E',
      'Target|TVDSS|N|E',
    ]));
    // vector charts actually drew lines (path + band + ellipse)
    expect(global.__lastDoc.__calls.lines).toBeGreaterThan(stations.length);
    expect(global.__lastDoc.__calls.text).toContain('Page 1 of 1');
  });
});

describe('generateSurveyListing', () => {
  test('emits the full station table and the TD/QC line', async () => {
    await generateSurveyListing({ contract, generatedAt: '2026-08-25 12:00' });
    const t = texts();
    expect(t).toMatch(/Survey listing: HAR-1/);
    expect(t).toMatch(/TD: 3000\.0 m MD/);
    expect(t).toMatch(/max DLS/);
    expect(heads()).toEqual(expect.arrayContaining([
      'MD (m)|Inc (deg)|Azi grid (deg)|TVD (m)|TVDSS (m)|N (m)|E (m)|DLS (deg/30m)|VS (m)',
    ]));
  });
});

describe('generateAcReport', () => {
  const run = {
    reference: 'plan',
    created_at: '2026-08-25T10:00:00Z',
    params: { k: 3.5, sigmaPa: 0.5, Sm: 0.3, refRadius: 0.4572, offRadius: 0.3048, noGo: 1.0, review: 1.5 },
    summary: { status: 'review', overallMinSf: 1.21, offsetCount: 2 },
    results: [
      {
        id: 'a', label: 'OFF-1', kind: 'wp-plan', status: 'review', minSf: 1.21, minSfMd: 900,
        md: [0, 500, 900, 1200], sf: [8, 2.1, 1.21, 1.8], distanceCC: [50, 30, 12, 20],
      },
      {
        id: 'b', label: 'OFF-2', kind: 'geo', status: 'clear', minSf: 3.4, minSfMd: 1200,
        md: [0, 500, 900, 1200], sf: [9, 5, 3.4, 4], distanceCC: [200, 150, 90, 110],
      },
    ],
  };

  test('emits rule params, per-offset summary, ladder and violations', async () => {
    await generateAcReport({
      run, wellName: 'HAR-1', designLabel: 'Base plan r2', generatedAt: '2026-08-25 12:00',
    });
    const t = texts();
    expect(t).toMatch(/Anti-collision report: HAR-1/);
    expect(t).toMatch(/Separation factor vs reference MD/);
    expect(t).toMatch(/OFF-1/);
    expect(t).toMatch(/SPE-187073/);
    expect(heads()).toEqual(expect.arrayContaining([
      expect.stringContaining('Separation rule'),
      'Offset well|Kind|Status|Min SF|At ref MD (m)|Min C-C (m)',
      'Offset|Ref MD (m)|SF|C-C dist (m)|Level',
    ]));
  });

  test('clean scan reports no violations honestly', async () => {
    const cleanRun = {
      ...run,
      summary: { status: 'clear', overallMinSf: 3.4, offsetCount: 1 },
      results: [run.results[1]],
    };
    await generateAcReport({ run: cleanRun, wellName: 'HAR-1', designLabel: 'Base plan r2' });
    // the violations table body carries the explicit no-rows message via
    // autoTable body — assert the head is still emitted (structure intact)
    expect(heads()).toEqual(expect.arrayContaining([
      'Offset|Ref MD (m)|SF|C-C dist (m)|Level',
    ]));
  });
});

// 2026-10-13: a feet wellbore's report pack prints feet (the app shows
// feet); site coordinates stay in metres. The metre tests above are the
// negative control: the same generators print metres for a metre wellbore.
describe('report pack in a feet wellbore', () => {
  const FT_WELLBORE = { ...WELLBORE, name: 'Ekene-11', depth_unit: 'ft', kb_elev_m: 25 };
  // 3000 m of hole: a 2.5 deg/30 m build, then hold
  const ftStations = [{ md: 0, inc: 0, azi: 74.7 }, { md: 400, inc: 0, azi: 74.7 }, { md: 670.5, inc: 22.54, azi: 74.7 }, { md: 2020.4, inc: 22.54, azi: 74.7 }];
  const ftContract = buildTrajectoryContract({
    site: SITE, wellbore: FT_WELLBORE, design: DESIGN, stations: ftStations, generatedAt: '2026-10-13T12:00:00Z',
  });
  const bodies = () => global.__lastDoc.__calls.tableBodies;
  const cells = () => bodies().flat(2).map(String);

  test('the contract carries the wellbore depth unit', () => {
    expect(ftContract.wellbore.depthUnit).toBe('ft');
  });

  test('wall plot: feet headings, the target TVDSS 1885.36 m prints 6185.6 ft, KB 82.0 ft', async () => {
    await generateWallPlot({
      contract: ftContract,
      targets: [{ name: 'T1 Oboro Sand', n: 150, e: 550, tvdss: 1885.36, radius: 50 }],
      generatedAt: '2026-10-13 12:00',
    });
    const t = texts();
    expect(t).toMatch(/Plan view \(N vs E, ft\)/);
    expect(t).toMatch(/Section view \(TVD vs VS, ft\)/);
    expect(heads()).toEqual(expect.arrayContaining([
      'MD ft|Inc|Azi|TVD ft|N ft|E ft',
      'Target|TVDSS ft|N ft|E ft|Radius ft',
    ]));
    const c = cells();
    expect(c).toContain('6185.6');
    expect(c).toContain('164'); // 50 m radius
    expect(c).toContain('82.0 ft');
    expect(c).not.toContain('1885'); // the metre value is not printed
    expect(c).toContain('500000.0 E, 6800000.0 N'); // wellhead stays in CRS metres
    expect(t).not.toMatch(/—/);
  });

  test('survey listing: feet columns, DLS 2.5 deg/30 m prints 2.54 deg/100ft, TD in feet', async () => {
    await generateSurveyListing({ contract: ftContract, generatedAt: '2026-10-13 12:00' });
    expect(heads()).toEqual(expect.arrayContaining([
      'MD (ft)|Inc (deg)|Azi grid (deg)|TVD (ft)|TVDSS (ft)|N (ft)|E (ft)|DLS (deg/100ft)|VS (ft)',
    ]));
    const t = texts();
    expect(t).toMatch(/TD: 6628\.6 ft MD/); // 2020.4 m
    expect(t).toMatch(/max DLS 2\.54 deg\/100ft/);
    const listing = bodies().find((b) => b.length === ftContract.stations.length);
    const mds = listing.map((r) => r[0]);
    expect(mds).toContain('1312.34'); // the kickoff, 400 m
  });

  test('anti-collision report: distances, MDs and rule lengths in feet', async () => {
    const run = {
      reference: 'plan', created_at: '2026-10-13T10:00:00Z',
      params: { k: 3.5, sigmaPa: 0.5, Sm: 0.3, refRadius: 0.4572, offRadius: 0.3048, noGo: 1.0, review: 1.5 },
      summary: { status: 'review' },
      results: [{ id: 'a', label: 'Ekene-8 (registry)', kind: 'geo', status: 'review', minSf: 1.03, minSfMd: 400, md: [0, 400], sf: [2.2, 1.03], distanceCC: [5, 5] }],
    };
    await generateAcReport({ run, wellName: 'Ekene-11', designLabel: 'Plan 1 r1', depthUnit: 'ft' });
    expect(heads()).toEqual(expect.arrayContaining([
      'Offset well|Kind|Status|Min SF|At ref MD (ft)|Min C-C (ft)',
      'Offset|Ref MD (ft)|SF|C-C dist (ft)|Level',
    ]));
    const c = cells();
    expect(c).toContain('1312'); // min SF at 400 m
    expect(c).toContain('16.4'); // 5 m centre to centre
    expect(c).toContain('1.64 ft'); // sigma pa 0.5 m
    expect(c).toContain('1.50 / 1.00 ft'); // hole radii
    expect(texts()).toMatch(/reference MD \(ft\)/);
  });
});
