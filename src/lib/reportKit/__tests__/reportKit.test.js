/**
 * Report Kit self-test (Step 0 of the Reservoir round): one synthetic
 * report that uses every element of the kit, built and then read back from
 * the PDF file through the kit's own test side (pdfinfo, pdftotext,
 * pdfimages, pdftoppm).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createReport, createLayout, drawPlot, headerPairs, pairRows, inputsBody, INPUTS_HEAD,
  pdfText, unprintable, isPrintable, assertPrintable,
  EMPTY_VALUE, sig, fixed, sci, plain, compact, thousands, percent, range, orNA, withUnit, timestampUtc,
  reportUnits, displayUnitsText, niceTicks, decadeTicks, tickText, SERIES_RGB, PAGE,
} from '@/lib/reportKit';
import {
  readPdf, chartLogo, flat, listCaptions, pointCounts, plotMarks, expectFigureDrawn, expectFigureStatement,
  checkGolden, pdfSha256,
} from '@/lib/reportKit/testKit';
import { sourceText, assumedDefaultText, inputRow } from '@/lib/inputProvenance';
import { resolveProfile } from '@/lib/units/profile';
import { makeProfile } from '@/lib/units/presets';

const AT = new Date('2026-10-02T09:00:00Z');
const logo = chartLogo();

// ---- the synthetic data -----------------------------------------------------
const N = 60;
const time = Array.from({ length: N }, (_, i) => 10 ** (-2 + (4 * i) / (N - 1))); // 0.01 .. 100 hr
const dp = time.map((t) => [t, 40 * t ** 0.25 + 5]);
const deriv = time.map((t) => [t, 12 + 30 / (1 + t)]);
const withZeros = [[0, 5], [-1, 5], [0.5, 0], ...dp]; // three points a log axis cannot hold
const horner = time.map((t) => [(36 + t) / t, 4800 - 55 * Math.log10((36 + t) / t)]);
const pressure = Array.from({ length: 80 }, (_, i) => [i * 0.5, 4500 + 250 * (1 - Math.exp(-i / 12))]);
const rate = [[0, 450], [12, 450], [12, 300], [24, 300], [24, 0], [40, 0]];
const depth = Array.from({ length: 40 }, (_, i) => [0.44 * (2000 + i * 50) + 30 * Math.sin(i / 4), 2000 + i * 50]);
const hydro = [[880, 2000], [1738, 3950]];
const LONG_ROWS = 120;

function buildSynthetic({ strictText = false, units = reportUnits() } = {}) {
  const r = createReport({ title: 'Report Kit Self-Test', appName: 'Petrolord Report Kit', logo, strictText });
  r.header({
    identification: [['Project', 'Synthetic'], ['Well', 'KIT-1'], ['Field', 'Obodo'], ['Analyst', ''], ['Zone', null]],
    displayUnits: units.displayUnits(['depth', 'pressure', 'temperature']),
    generatedAt: AT,
  });
  r.table('Headline results', ['Quantity', 'Value'], [
    [units.head('Permeability k', 'permeability'), sig(84.52)],
    ['kh (md-ft)', sig(3803.4)],
    [units.head('Reservoir pressure', 'pressure'), fixed(units.value('pressure', 33094.8), 1)],
    ['Skin', null],
    ['Flow efficiency', percent(0.553)],
    ['Confidence', range([81.2, 87.9])],
  ], { note: 'A blank cell prints as n/a. Symbols are spelled out: Δp, μ, φ, √t, 10³m³/d.' });

  // long table: breaks across pages, header row repeated on each
  r.table('Production history', ['Period', 'Date', 'Rate (STB/D)', 'Cumulative (STB)', 'Remark'],
    Array.from({ length: LONG_ROWS }, (_, i) => [String(i + 1), `2026-${String(1 + (i % 12)).padStart(2, '0')}-01`, fixed(450 - i, 1), thousands(13500 * (i + 1)), i % 10 === 0 ? 'Choke change' : '']),
    { note: 'One row per period; the header row repeats on every page.' });

  r.inputsTable([
    inputRow({ key: 'h', label: 'Net pay h', value: plain(45), unit: units.label('depth'), meta: { source: 'offset', note: 'KIT-0, same sand' } }),
    inputRow({ key: 'mu', label: 'Viscosity mu', value: plain(0.9), unit: 'cp', meta: { source: 'lab', note: 'Bottomhole sample 2' } }),
    inputRow({ key: 'B', label: 'Formation volume factor', value: plain(1.25), unit: 'RB/STB', meta: { source: 'correlation', correlation: 'Standing' } }),
    inputRow({ key: 'kvkh', label: 'kv/kh', value: plain(0.1), auto: assumedDefaultText(0.1) }),
    inputRow({ key: 'sw', label: 'Water saturation Sw', value: '', unit: 'fraction' }),
    { label: 'Porosity phi', value: plain(0.18), unit: 'fraction', source: sourceText(null) },
  ], { title: 'Reservoir and fluid inputs', note: 'Every input with its unit and its source.' });

  r.section('Flow regimes observed', 'No sustained flow regime was detected on the derivative.');
  r.section('Interpretation notes', 'Radial flow from 8 hr.', { need: 20, lead: 6, size: 9, gap: 8 });

  r.figures([
    {
      id: 'loglog',
      title: 'Log-log diagnostic plot',
      caption: 'Pressure change and derivative on log axes. The shaded band is the radial flow window. Points at or below zero cannot be drawn on a log axis and are left out.',
      panels: [{
        height: 88,
        spec: {
          xTitle: 'Elapsed time (hr)', yTitle: 'dp and derivative (psi)', xLog: true, yLog: true,
          bands: [{ x0: 8, x1: 60, label: 'Radial flow' }],
          notes: ['Slope 0 from 8 hr'],
          series: [
            { name: 'dp', type: 'scatter', rgb: SERIES_RGB.blue, pts: withZeros },
            { name: 'Derivative', type: 'both', marker: 'square', rgb: SERIES_RGB.red, pts: deriv },
          ],
        },
      }],
    },
    {
      id: 'horner',
      title: 'Horner plot',
      caption: 'Shut-in pressure against the Horner time ratio; the X axis is reversed so time runs to the right.',
      panels: [{
        height: 80,
        spec: {
          xTitle: 'Horner time ratio (tp + dt)/dt', yTitle: 'Pressure (psi)', xLog: true, xReversed: true,
          bands: [{ x0: 2, x1: 6, label: 'Fit window', rgb: SERIES_RGB.amber }],
          series: [{ name: 'pws', type: 'scatter', pts: horner }, { name: 'Straight line', type: 'line', rgb: SERIES_RGB.amber, pts: horner.slice(30), dash: [1.2, 0.8] }],
        },
      }],
    },
    {
      id: 'overview',
      title: 'Test overview',
      caption: 'Pressure on the left axis and rate on the secondary axis, two panels on one time axis.',
      panels: [
        {
          height: 60,
          spec: {
            xTitle: 'Test time (hr)', yTitle: 'Pressure (psi)', y2Title: 'Rate (STB/D)', xInclude: [0, 40],
            yBands: [{ y0: 4700, y1: 4760, label: 'Target' }],
            lines: [{ x: 24, label: 'Shut-in', dash: [1, 1] }, { y: 4600, label: 'Bubble point' }],
            series: [{ name: 'Gauge pressure', pts: pressure, rgb: SERIES_RGB.slate }, { name: 'Rate', pts: rate, axis: 'y2', rgb: SERIES_RGB.cyan, width: 0.6 }],
          },
        },
        { height: 40, spec: { xTitle: 'Test time (hr)', yTitle: 'Temperature (degF)', xInclude: [0, 40], series: [{ name: 'Gauge temperature', pts: pressure.map(([t], i) => [t, 211 + 0.02 * i]), rgb: SERIES_RGB.pink }] } },
      ],
    },
    {
      id: 'depth',
      title: 'Pressure against depth',
      caption: 'Depth increases downward: the Y axis is reversed.',
      panels: [{
        height: 90,
        spec: {
          xTitle: 'Pressure (psi)', yTitle: 'Depth (ft)', yReversed: true,
          series: [{ name: 'Formation pressure', type: 'both', pts: depth }, { name: 'Hydrostatic', pts: hydro, dash: [1.5, 1] }],
        },
      }],
    },
    { id: 'sqrt', title: 'Square-root-of-time plot', statement: 'Does not apply: no linear flow regime was identified on the derivative.' },
    {
      id: 'thin',
      title: 'A plot with next to nothing in it',
      caption: 'Two points close together, the negative control for the blank check.',
      panels: [{ height: 60, spec: { xTitle: 'x', yTitle: 'y', series: [{ name: 'Two points', type: 'scatter', pts: [[1, 1], [1.01, 1.01]] }] } }],
    },
    { id: 'empty', title: 'A plot with no data', caption: 'Nothing was passed in.', panels: [{ height: 40, spec: { xTitle: 'x', yTitle: 'y', series: [{ name: 'None', pts: [] }] } }] },
  ]);
  return r.finish({ footer: 'Report Kit Self-Test, Well KIT-1' });
}

describe('the synthetic report, read back from the PDF', () => {
  let built;
  let pdf;
  let t;
  beforeAll(() => {
    built = buildSynthetic();
    pdf = readPdf(built.doc, { ink: true });
    t = flat(pdf.text);
  });
  afterAll(() => pdf?.close?.());

  test('header block: title, app name, identification grid in two columns, units, timestamp', () => {
    const first = pdf.pageText[0].split('\n');
    expect(first[0].trim()).toBe('Report Kit Self-Test');
    expect(first[1].trim()).toBe('Petrolord Report Kit');
    const p1 = flat(pdf.pageText[0]);
    // two label and value pairs to a row
    expect(first.find((l) => /Project/.test(l))).toMatch(/Project\s+Synthetic\s+Well\s+KIT-1/);
    expect(first.find((l) => /Field/.test(l))).toMatch(/Field\s+Obodo\s+Analyst\s+n\/a/);
    expect(p1).toMatch(/Zone n\/a Display units Oilfield \(ft, psi, degF\)/);
    expect(p1).toMatch(/Generated 2026-10-02 09:00 UTC/);
  });

  test('footer on every page: the report name and Page n of m', () => {
    expect(pdf.pages).toBe(built.pages);
    expect(pdf.pages).toBeGreaterThanOrEqual(6);
    pdf.pageText.slice(0, pdf.pages).forEach((page, i) => {
      expect(flat(page)).toContain(`Report Kit Self-Test, Well KIT-1 Page ${i + 1} of ${pdf.pages}`);
    });
  });

  test('tables: title, header row, note line, blanks as n/a, number formats', () => {
    expect(t).toMatch(/Headline results Quantity Value Permeability k \(mD\) 84\.5 kh \(md-ft\) 3,800/);
    expect(t).toMatch(/Reservoir pressure \(psi\) 4800\.0/);
    expect(t).toMatch(/Skin n\/a Flow efficiency 55% Confidence 81\.2 to 87\.9/);
    expect(t).toMatch(/A blank cell prints as n\/a\./);
    expect(EMPTY_VALUE).toBe('n/a');
  });

  test('a long table breaks across pages and repeats its header row on each', () => {
    const head = 'Period Date Rate (STB/D) Cumulative (STB) Remark';
    const pagesWithHead = pdf.pageText.map((p, i) => (flat(p).includes(head) ? i + 1 : 0)).filter(Boolean);
    expect(pagesWithHead.length).toBeGreaterThanOrEqual(3);
    // consecutive pages, and every page that holds rows of the table starts them under the header
    pagesWithHead.forEach((p, i) => { if (i) expect(p).toBe(pagesWithHead[i - 1] + 1); });
    const rowPages = new Set();
    for (let i = 1; i <= LONG_ROWS; i += 1) {
      const row = new RegExp(`(^|\\n)\\s*${i}\\s+2026-\\d\\d-01\\s+${(451 - i).toFixed(1).replace('.', '\\.')}\\s`);
      const page = pdf.pageText.findIndex((p) => row.test(p)) + 1;
      expect(page).toBeGreaterThan(0); // every row is printed, once
      rowPages.add(page);
    }
    expect([...rowPages].sort((a, b) => a - b)).toEqual(pagesWithHead);
    // the title is printed once, the note once after the last row
    expect(t.split('Production history').length - 1).toBe(1);
    expect(flat(pdf.pageText[pagesWithHead[pagesWithHead.length - 1] - 1])).toMatch(/120 2026-12-01 331\.0 1,620,000 n\/a One row per period/);
  });

  test('the inputs table: Value, Unit, Source and quality, with the assumption wording', () => {
    expect(INPUTS_HEAD).toEqual(['Input', 'Value', 'Unit', 'Source and quality']);
    expect(t).toMatch(/Reservoir and fluid inputs Input Value Unit Source and quality/);
    expect(t).toMatch(/Net pay h 45 ft Offset well\. KIT-0, same sand/);
    expect(t).toMatch(/Viscosity mu 0\.9 cp Measured \(lab\)\. Bottomhole sample 2/);
    expect(t).toMatch(/Formation volume factor 1\.25 RB\/STB Correlation: Standing/);
    // dimensionless: the unit cell stays empty, it does not become n/a
    expect(t).toMatch(/kv\/kh 0\.1 Assumed default 0\.1 \(no value entered\)/);
    expect(t).toMatch(/Water saturation Sw n\/a fraction Not provided/);
    expect(t).toMatch(/Porosity phi 0\.18 fraction Entered, source not stated/);
  });

  test('sections: a sentence in place of an empty table, and notes', () => {
    expect(t).toMatch(/Flow regimes observed No sustained flow regime was detected on the derivative\./);
    expect(t).toMatch(/Interpretation notes Radial flow from 8 hr\./);
  });

  test('figures are numbered in order, captioned, and listed by the test kit', () => {
    expect(built.figures.map((f) => [f.number, f.id, f.plotted])).toEqual([
      [1, 'loglog', true], [2, 'horner', true], [3, 'overview', true], [4, 'depth', true], [5, 'sqrt', false], [6, 'thin', true], [7, 'empty', true],
    ]);
    const captions = listCaptions(pdf);
    expect(captions.map((c) => c.title)).toEqual([
      'Log-log diagnostic plot', 'Horner plot', 'Test overview', 'Pressure against depth', 'Square-root-of-time plot',
      'A plot with next to nothing in it', 'A plot with no data',
    ]);
    // each title is on the page the builder reports
    built.figures.forEach((f, i) => expect(captions[i]).toEqual({ number: f.number, title: captions[i].title, page: f.page }));
    expect(t).toMatch(/Plots Figure 1\. Log-log diagnostic plot/);
    expect(t).toMatch(/The shaded band is the radial flow window\./);
  });

  test('plotted point counts are exposed, and a log axis drops what it cannot hold', () => {
    const n = pointCounts(built.figures);
    expect(n.loglog).toEqual([{ dp: N, Derivative: N }]); // 63 passed in, 3 not positive
    expect(withZeros).toHaveLength(N + 3);
    expect(n.horner).toEqual([{ pws: N, 'Straight line': N - 30 }]);
    expect(n.overview).toEqual([{ 'Gauge pressure': 80, Rate: 6 }, { 'Gauge temperature': 80 }]);
    expect(n.depth).toEqual([{ 'Formation pressure': 40, Hydrostatic: 2 }]);
    expect(n.sqrt).toEqual([]);
    expect(n.empty).toEqual([{}]);
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    expect(fig.loglog.panels[0].total).toBe(2 * N);
    expect(fig.loglog.panels[0].bands).toBe(1);
    expect(fig.horner.panels[0].bands).toBe(1);
    expect(fig.overview.panels[0].yBands).toBe(1);
    expect(fig.overview.panels[0].lines).toBe(2);
  });

  test('axes: log decades, reversed X, reversed Y, secondary Y, shared X span', () => {
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    expect(fig.loglog.panels[0].xRange).toEqual([0.01, 100]);
    expect(fig.loglog.panels[0].yRange[0]).toBe(10);
    expect(fig.overview.panels[0].y2Range).toEqual([0, 500]);
    expect(fig.overview.panels[0].xRange).toEqual(fig.overview.panels[1].xRange);
    // axis titles, legend entries, band labels, reference line labels and annotations are text in the file
    for (const s of ['Elapsed time (hr)', 'dp and derivative (psi)', 'Radial flow', 'Slope 0 from 8 hr', 'Derivative',
      'Horner time ratio (tp + dt)/dt', 'Fit window', 'Straight line', 'Rate (STB/D)', 'Gauge pressure', 'Target', 'Shut-in', 'Bubble point',
      'Temperature (degF)', 'Depth (ft)', 'Hydrostatic']) expect(t).toContain(s);
    // reversed X: on the Horner plot the tick 1000 is printed left of the tick 10
    const hornerPage = pdf.pageText[fig.horner.page - 1].split('\n');
    const ticks = hornerPage.find((l) => /\b1000\b.*\b100\b.*\b10\b/.test(l));
    expect(ticks).toBeTruthy();
    expect(ticks.indexOf('1000')).toBeLessThan(ticks.lastIndexOf('10'));
    // reversed Y: on the depth plot the shallow tick is printed above the deep one
    const depthPage = pdf.pageText[fig.depth.page - 1].split('\n');
    const row = (v) => depthPage.findIndex((l) => new RegExp(`^\\s*${v}\\b`).test(l));
    expect(row(2000)).toBeGreaterThan(-1);
    expect(row(4000)).toBeGreaterThan(row(2000));
    // and unreversed, pressure ticks run the other way: high above low
    const ovPage = pdf.pageText[fig.overview.page - 1].split('\n');
    const prow = (v) => ovPage.findIndex((l) => new RegExp(`^\\s*${v}\\b`).test(l));
    expect(prow(4750)).toBeGreaterThan(-1);
    expect(prow(4500)).toBeGreaterThan(prow(4750));
  });

  test('each plot is really drawn: its marks are in the file, ink in its box, the Petrolord mark embedded', () => {
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    for (const id of ['loglog', 'horner', 'overview', 'depth', 'thin']) {
      const checks = expectFigureDrawn(pdf, fig[id], { logo: true });
      expect(checks).toHaveLength(fig[id].panels.length);
      expect(pdf.images.some((im) => im.page === fig[id].page && im.type === 'image' && im.width > 50)).toBe(true);
    }
    // the file's own count of what is inside each plot area, against the series passed in
    expect(plotMarks(pdf, fig.loglog.page, fig.loglog.panels[0].plotArea)).toEqual({ segments: N - 1, markers: 2 * N, total: 3 * N - 1, frame: true });
    expect(plotMarks(pdf, fig.horner.page, fig.horner.panels[0].plotArea)).toMatchObject({ segments: N - 30 - 1, markers: N });
    // pressure line 79 segments, rate line 5, and the two reference lines
    expect(plotMarks(pdf, fig.overview.page, fig.overview.panels[0].plotArea)).toMatchObject({ segments: 79 + 5 + 2, markers: 0 });
    expect(plotMarks(pdf, fig.depth.page, fig.depth.panels[0].plotArea)).toMatchObject({ segments: 39 + 1, markers: 40 });
    expect(fig.loglog.panels[0].marks).toEqual({ segments: N - 1, markers: 2 * N });
  });

  test('negative controls: a plot that is not what the builder says is caught', () => {
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    // no data at all
    expect(() => expectFigureDrawn(pdf, fig.empty)).toThrow(/Figure 7 \(empty\): panel 1 drew 0 points/);
    expect(t).toMatch(/No data to plot/);
    expect(fig.empty.panels[0].logo).toBe(false);
    expect(pdf.ink(fig.empty.page, fig.empty.panels[0].box).dark).toBeLessThan(150);
    // too few points for the test's own floor
    expect(() => expectFigureDrawn(pdf, fig.thin, { minPoints: 10 })).toThrow(/Figure 6 \(thin\): panel 1 drew 2 points/);
    // a statement is not a plot
    expect(() => expectFigureDrawn(pdf, fig.sqrt)).toThrow(/is a statement/);
    // a builder that claims more than the file holds
    const claims = (panel, marks) => ({ ...fig.depth, panels: [{ ...fig.depth.panels[0], ...panel, marks }] });
    expect(() => expectFigureDrawn(pdf, claims({}, { segments: 40, markers: 80 }))).toThrow(/the file holds 80 line segments and markers inside the plot area, the builder reports 120/);
    // a plot area that is not where the builder says
    expect(() => expectFigureDrawn(pdf, claims({ plotArea: { x: 40, y: 40, w: 50, h: 30 } }, fig.depth.panels[0].marks))).toThrow(/no plot area frame found/);
    // a figure reported on the wrong page
    expect(() => expectFigureDrawn(pdf, { ...fig.depth, page: 1 })).toThrow(/no "Figure 4\." title on page 1/);
    // ink: a box with nothing in it
    expect(() => expectFigureDrawn(pdf, fig.depth, { minDark: 1e6 })).toThrow(/looks blank/);
  });

  test('conditional figure: one line saying why it does not apply, and no plot', () => {
    const sqrt = built.figures.find((f) => f.id === 'sqrt');
    expect(sqrt.panels).toEqual([]);
    expectFigureStatement(pdf, sqrt, 'Does not apply: no linear flow regime was identified on the derivative.');
    expect(t).toMatch(/Figure 5\. Square-root-of-time plot Does not apply: no linear flow regime/);
    expect(() => expectFigureStatement(pdf, built.figures[0])).toThrow(/is plotted/);
    expect(() => expectFigureStatement(pdf, sqrt, 'some other reason')).toThrow(/statement not found/);
  });

  test('keep with next: a figure title is never left on one page with its plot on the next', () => {
    const captions = listCaptions(pdf);
    for (const f of built.figures.filter((x) => x.plotted)) {
      expect(captions.find((c) => c.number === f.number).page).toBe(f.page);
      for (const p of f.panels) {
        expect(p.box.y).toBeGreaterThanOrEqual(PAGE.top);
        expect(p.box.y + p.box.h).toBeLessThanOrEqual(PAGE.bottom);
      }
    }
    // at least one figure had to move whole to a new page
    expect(new Set(built.figures.map((f) => f.page)).size).toBeGreaterThanOrEqual(3);
  });

  test('Latin-1 guard: the symbols are spelled out and nothing outside Latin-1 reaches the file', () => {
    expect(t).toMatch(/Symbols are spelled out: dp, mu, phi, sqrtt, 103m3\/d\./);
    expect(pdf.text).not.toMatch(/[^\x00-\xff]/);
    expect(pdf.text).not.toMatch(/undefined|NaN|\[object/);
  });
});

describe('Latin-1 guard', () => {
  test('transliterates what it knows and marks what it does not', () => {
    expect(pdfText('Δp = 12 psi·hr, φ ≥ 0.1, μ → 0.9 cp, 30°F, k×h, “quoted” – done…')).toBe('dp = 12 psi hr, phi >= 0.1, mu to 0.9 cp, 30deg F, kxh, "quoted" - done...');
    expect(pdfText('café Ångström ±5%')).toBe('café Ångström ±5%'); // Latin-1 passes untouched
    expect(pdfText('Ω and 井')).toBe('? and ?');
    expect(pdfText(null)).toBe('');
    expect(pdfText(12.5)).toBe('12.5');
    expect(unprintable('Ω and 井 and Ω, Δp')).toEqual(['Ω', '井']);
    expect(isPrintable('Δp √t')).toBe(true);
    expect(isPrintable('σ')).toBe(false);
  });

  test('strict mode rejects, naming the characters', () => {
    expect(assertPrintable('Δp')).toBe('dp');
    expect(() => assertPrintable('stress σ', 'the caption')).toThrow(/the caption holds characters the PDF fonts cannot print: "σ" \(U\+03C3\)/);
    const r = createReport({ title: 'Strict', strictText: true });
    r.header({ identification: [['Well', 'W-1']], generatedAt: AT });
    expect(() => r.table('Stress', ['Quantity', 'Value'], [['σv', '1']])).toThrow(/cannot print: "σ"/);
    // the same report without strict prints a question mark instead
    const loose = createReport({ title: 'Loose' });
    loose.header({ identification: [['Well', 'W-1']], generatedAt: AT });
    loose.table('Stress', ['Quantity', 'Value'], [['σv', '1']]);
    expect(flat(readPdf(loose.finish().doc).text)).toMatch(/Stress Quantity Value \?v 1/);
  });
});

describe('layout engine', () => {
  const fakeDoc = () => ({ pages: 1, addPage() { this.pages += 1; } });

  test('cursor, page break and keep together', () => {
    const doc = fakeDoc();
    const l = createLayout(doc);
    expect([l.left, l.right, l.width, l.top, l.bottom]).toEqual([14, 196, 182, 20, 280]);
    expect(l.y).toBe(20);
    l.advance(200);
    expect(l.room()).toBe(60);
    expect(l.ensure(60)).toBe(false); // exactly fits
    expect(doc.pages).toBe(1);
    expect(l.keepTogether(10, 40, 11)).toBe(true); // 61 does not: the whole group moves
    expect(doc.pages).toBe(2);
    expect(l.y).toBe(20);
    l.y = 100;
    l.newPage();
    expect([doc.pages, l.y]).toEqual([3, 20]);
    expect(l.pageHeight()).toBe(260);
  });

  test('custom page geometry', () => {
    const l = createLayout(fakeDoc(), { top: 30, bottom: 200, left: 10, right: 100 });
    expect([l.width, l.y, l.pageHeight()]).toEqual([90, 30, 170]);
  });

  test('a table with no rows prints nothing and says so', () => {
    const r = createReport({ title: 'Empty' });
    expect(r.table('Nothing', ['A'], [])).toBe(false);
    expect(r.table('Something', ['A'], [['1']])).toBe(true);
    expect(r.figures([])).toEqual([]);
    expect(flat(readPdf(r.finish().doc).text)).not.toMatch(/Nothing/);
  });
});

describe('header helpers', () => {
  test('pairs, blanks, and two pairs to a row', () => {
    const pairs = headerPairs({ identification: [['Well', 'W-1'], ['Field', ''], ['Licence', undefined]], displayUnits: 'Oilfield', generatedAt: AT });
    expect(pairs).toEqual([['Well', 'W-1'], ['Field', 'n/a'], ['Licence', 'n/a'], ['Display units', 'Oilfield'], ['Generated', '2026-10-02 09:00 UTC']]);
    expect(pairRows(pairs)).toEqual([
      ['Well', 'W-1', 'Field', 'n/a'], ['Licence', 'n/a', 'Display units', 'Oilfield'], ['Generated', '2026-10-02 09:00 UTC', '', ''],
    ]);
    expect(inputsBody([{ label: 'z', value: null, source: '' }, { label: 'h', value: '45', unit: 'ft', source: 'Entered' }]))
      .toEqual([['z', 'n/a', '', 'n/a'], ['h', '45', 'ft', 'Entered']]);
  });
});

describe('number formats', () => {
  test('significant figures, with thousands written out', () => {
    expect(sig(84.52)).toBe('84.5');
    expect(sig(6.4)).toBe('6.40');
    expect(sig(3803.4)).toBe('3,800');
    expect(sig(1234567, 4)).toBe('1,235,000');
    expect(sig(0.01503)).toBe('0.0150');
    expect(sig(NaN)).toBe('n/a');
    expect(sig('84.5')).toBe('n/a'); // a string is not read as a number
    expect(sig(undefined)).toBe('n/a');
  });

  test('fixed, scientific, plain, compact, thousands, percent, range', () => {
    expect(fixed(120.66, 1)).toBe('120.7');
    expect(fixed(null)).toBe('n/a');
    expect(sci(0.0000123)).toBe('1.230e-5');
    expect(plain(0.000012)).toBe('1.2e-5');
    expect(plain(4800)).toBe('4800');
    expect(plain(13.716000001)).toBe('13.716');
    expect(plain(0)).toBe('0');
    expect(plain(2500000)).toBe('2.5e+6');
    expect(plain(Infinity)).toBe('n/a');
    expect(compact(84.50)).toBe('84.5');
    expect(compact(NaN)).toBe('n/a');
    expect(thousands(1234567.84, 1)).toBe('1,234,567.8');
    expect(thousands(999)).toBe('999');
    expect(percent(0.553)).toBe('55%');
    expect(percent(0.553, 1)).toBe('55.3%');
    expect(range([81.23, 87.91])).toBe('81.2 to 87.9');
    expect(range([81.23, 87.91], (x) => fixed(x, 0))).toBe('81 to 88');
    expect(range([1, NaN])).toBe('n/a');
    expect(range(null)).toBe('n/a');
    expect(orNA('  W-7 ')).toBe('W-7');
    expect(orNA('')).toBe('n/a');
    expect(orNA(NaN)).toBe('n/a');
    expect(withUnit('Pressure', 'psi')).toBe('Pressure (psi)');
    expect(withUnit('Skin', '')).toBe('Skin');
    expect(timestampUtc(AT)).toBe('2026-10-02 09:00 UTC');
  });

  test('ticks', () => {
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(decadeTicks(0.02, 150)).toEqual([0.01, 0.1, 1, 10, 100, 1000]);
    expect(decadeTicks(-1, 10)).toEqual([]);
    expect(tickText(0.001)).toBe('0.001');
    expect(tickText(1e6)).toBe('1e6');
  });
});

describe('unit labels through the Suite unit profile', () => {
  test('built-in oilfield, a metric profile, and one family changed', () => {
    const oil = reportUnits();
    expect(oil.label('depth')).toBe('ft');
    expect(oil.head('Pressure', 'pressure')).toBe('Pressure (psi)');
    expect(oil.displayUnits(['depth', 'pressure', 'temperature'])).toBe('Oilfield (ft, psi, degF)');
    expect(oil.value('depth', 1000)).toBeCloseTo(3280.84, 2); // stored metres to ft

    const metric = reportUnits(resolveProfile({ user: makeProfile('metric') }).units);
    expect(metric.head('Net pay h', 'depth')).toBe('Net pay h (m)');
    expect(metric.value('pressure', 33094.8)).toBe(33094.8); // stored kPa, shown kPa, untouched
    expect(metric.displayUnits(['depth', 'pressure'])).toBe('SI / metric (m, kPa)');
    expect(metric.system(['depth', 'pressure'])).toBe('metric');

    const mixed = reportUnits(resolveProfile({ organization: makeProfile('oilfield'), user: makeProfile('custom', { pressure: 'bar' }) }).units);
    expect(mixed.label('pressure')).toBe('bar');
    expect(mixed.label('depth')).toBe('ft');
    expect(mixed.convert('pressure', 4800, 'psi')).toBeCloseTo(330.948, 3);
    expect(() => oil.label('volts')).toThrow(/unknown unit family "volts"/);
    // an unknown unit for a family falls back to the built-in preset
    expect(reportUnits({ depth: 'furlong' }).label('depth')).toBe('ft');
    expect(displayUnitsText('si')).toBe('SI / metric');
    expect(displayUnitsText('oilfield')).toBe('Oilfield');
  });

  test('the report prints in the profile units', () => {
    const metric = reportUnits(resolveProfile({ user: makeProfile('metric') }).units);
    const t = flat(readPdf(buildSynthetic({ units: metric }).doc).text);
    expect(t).toMatch(/Display units SI \/ metric \(m, kPa, degC\)/);
    expect(t).toMatch(/Reservoir pressure \(kPa\) 33094\.8/);
    expect(t).toMatch(/Net pay h 45 m Offset well/);
  });
});

describe('drawPlot on its own', () => {
  test('series without a colour take the palette, and counts come back per series', () => {
    const r = createReport({ title: 'Plot' });
    const out = drawPlot(r.doc, { x: 14, y: 30, w: 182, h: 70 }, {
      xTitle: 'x', yTitle: 'y', yInclude: [0, 50],
      series: [{ name: 'A', pts: [[0, 1], [1, 2], [2, NaN], [3, 4]] }, { name: 'B', type: 'scatter', pts: [[0, 3], [1, null], [2, 5]] }],
    });
    expect(out.drawn).toEqual({ A: 3, B: 2 });
    expect(out.total).toBe(5);
    expect(out.yRange).toEqual([0, 50]);
    expect(out.plotArea.w).toBeCloseTo(182 - 17 - 5, 6);
    expect(out.logo).toBe(false); // no mark passed: the word stands in
    expect(flat(readPdf(r.finish().doc).text)).toMatch(/Petrolord/);
  });
});

describe('golden fixtures through the test kit', () => {
  test('write, compare, and catch a change in text or in drawing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-kit-golden-'));
    try {
      const first = buildSynthetic();
      const wrote = checkGolden(first, { dir, name: 'synthetic', update: true });
      expect(fs.existsSync(path.join(dir, 'synthetic.txt'))).toBe(true);
      expect(wrote.meta.sha256).toBe(pdfSha256(first.doc));
      // the same report again: identical text, pages, figures and bytes
      const again = checkGolden(buildSynthetic(), { dir, name: 'synthetic' });
      expect(again.meta).toEqual(again.golden);
      // a changed word is reported with its line
      const r = createReport({ title: 'Report Kit Self-Test', appName: 'Petrolord Report Kit (changed)', logo });
      r.header({ identification: [['Well', 'KIT-1']], generatedAt: AT });
      expect(() => checkGolden(r.finish(), { dir, name: 'synthetic' })).toThrow(/Report golden "synthetic": line 2 differs/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
