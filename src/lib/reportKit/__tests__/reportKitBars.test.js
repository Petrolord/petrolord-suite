/**
 * Report Kit additions of the Material Balance round (MBAL-U1): stacked
 * bars (`type: 'bar'`) and a calendar X axis (`xDate`), for drive indices
 * against time; the corner the annotations go in (`notesAt`) and the size
 * of a marker (`markerSize`). Built, then read back from the PDF file. The
 * Well Test goldens guard everything the kit drew before.
 */
import {
  createReport, dateTicks, dateTickText, SERIES_RGB,
} from '@/lib/reportKit';
import {
  readPdf, chartLogo, flat, plotMarks, pointCounts, expectFigureDrawn,
} from '@/lib/reportKit/testKit';

const AT = new Date('2026-10-02T09:00:00Z');
const day = (iso) => Date.parse(`${iso}T00:00:00Z`);

// Four drives at six yearly dates; each stack closes on 1 but the last,
// which carries a small negative water term below the axis.
const DATES = ['2011-01-01', '2012-01-01', '2013-01-01', '2014-01-01', '2015-01-01', '2016-01-01'].map(day);
const DDI = [0.62, 0.58, 0.55, 0.50, 0.47, 0.45];
const GDI = [0.20, 0.22, 0.23, 0.25, 0.26, 0.27];
const EDI = [0.03, 0.03, 0.02, 0.02, 0.02, 0.02];
const WDI = [0.15, 0.17, 0.20, 0.23, 0.25, -0.04];
const series = (values, name, rgb) => ({ name, type: 'bar', rgb, pts: values.map((v, i) => [DATES[i], v]) });

function build({ bars = true, xDate = true } = {}) {
  const r = createReport({ title: 'Kit bars', appName: 'Report Kit self-test', logo: chartLogo() });
  r.header({ identification: [['Case', 'bars']], generatedAt: AT });
  r.figures([{
    id: 'drive',
    title: 'Drive indices against time',
    caption: 'Stacked in series order.',
    panels: [{
      height: 80,
      spec: {
        xTitle: 'Date', yTitle: 'Drive index (fraction)', xDate, yInclude: [0, 1],
        lines: [{ y: 1, label: 'Sum 1', rgb: SERIES_RGB.red, dash: [1.5, 1] }],
        series: bars
          ? [series(DDI, 'Depletion', SERIES_RGB.emerald), series(GDI, 'Gas cap', SERIES_RGB.cyan), series(EDI, 'Rock and water', SERIES_RGB.violet), series(WDI, 'Water', SERIES_RGB.blue)]
          : [{ name: 'Depletion', type: 'both', pts: DDI.map((v, i) => [DATES[i], v]) }],
      },
    }],
  }]);
  return r.finish();
}

describe('calendar ticks', () => {
  test('a span of years ticks on the first of January', () => {
    const t = dateTicks(day('2011-01-01'), day('2016-01-01'));
    expect(t.unit).toBe('year');
    expect(t.ticks.map((ms) => dateTickText(ms, t.unit))).toEqual(['2011', '2012', '2013', '2014', '2015', '2016']);
  });

  test('a span of months ticks on the first of a month and covers both ends', () => {
    const t = dateTicks(day('2024-02-10'), day('2024-11-20'));
    expect(t.unit).toBe('month');
    expect(t.step).toBe(2);
    expect(dateTickText(t.ticks[0], t.unit)).toBe('2024-01');
    expect(t.ticks[0]).toBeLessThanOrEqual(day('2024-02-10'));
    expect(t.ticks[t.ticks.length - 1]).toBeGreaterThanOrEqual(day('2024-11-20'));
    for (const ms of t.ticks) expect(new Date(ms).getUTCDate()).toBe(1);
  });

  test('a span of days, one date, and long spans', () => {
    const d = dateTicks(day('2024-03-01'), day('2024-03-20'));
    expect(d.unit).toBe('day');
    expect(dateTickText(d.ticks[0], d.unit)).toMatch(/^2024-0[23]-\d\d$/);
    expect(dateTicks(day('2024-03-01'), day('2024-03-01')).ticks.length).toBeGreaterThan(1);
    const long = dateTicks(day('1960-06-01'), day('2025-06-01'));
    expect(long.unit).toBe('year');
    expect(long.step).toBe(240);
    expect(dateTicks(NaN, 5).ticks).toEqual([]);
  });

  // a known value: 2000-03-01 is 951868800000 ms after 1970 (a leap year February behind it)
  test('a tick is the UTC start of its month', () => {
    expect(dateTickText(951868800000, 'day')).toBe('2000-03-01');
    expect(dateTickText(951868800000 - 1, 'day')).toBe('2000-02-29');
  });
});

describe('stacked bars on a calendar axis, read back from the PDF', () => {
  const built = build();
  const pdf = readPdf(built.doc, { ink: true });
  const fig = built.figures[0];
  const panel = fig.panels[0];
  afterAll(() => pdf.close());

  test('every point of every series is drawn, as a bar', () => {
    expect(pointCounts(built.figures).drive[0]).toEqual({ Depletion: 6, 'Gas cap': 6, 'Rock and water': 6, Water: 6 });
    expect(panel.marks).toEqual({ segments: 0, markers: 0, bars: 24 });
  });

  test('the bars are in the file, inside the plot area, with the reference line', () => {
    const marks = plotMarks(pdf, fig.page, panel.plotArea);
    expect(marks.frame).toBe(true);
    expect(marks.bars).toBe(24);
    expect(marks.markers).toBe(0);
    expect(marks.segments).toBe(1); // the Sum 1 line
    expectFigureDrawn(pdf, fig, { logo: true });
  });

  test('the axis spans the stack, the part below zero and the bar widths', () => {
    // highest stack 1.00, lowest part -0.04
    expect(panel.yRange[0]).toBeLessThanOrEqual(-0.04);
    expect(panel.yRange[1]).toBeGreaterThanOrEqual(1);
    expect(panel.xRange[0]).toBeLessThan(DATES[0]);
    expect(panel.xRange[1]).toBeGreaterThan(DATES[5]);
  });

  test('the ticks print as years and the legend names each drive', () => {
    const text = flat(pdf.pageText[fig.page - 1]);
    for (const y of ['2011', '2013', '2016']) expect(text).toContain(y);
    for (const name of ['Depletion', 'Gas cap', 'Rock and water', 'Water']) expect(text).toContain(name);
    expect(text).not.toMatch(/1\.29e\+?12|1e12/); // no epoch numbers on the axis
  });

  test('a stack sits on the one before it: the tops in the file close on the sums', () => {
    // read the bar rectangles of the first date back from the content stream
    const ptPerMm = 72 / 25.4;
    const rects = [...pdf.raw.matchAll(/([\d.]+) ([\d.]+) ([\d.-]+) ([\d.-]+) re\nB/g)].map((m) => m.slice(1).map(Number));
    const left = Math.min(...rects.filter((r) => Math.abs(r[2]) < 30 * ptPerMm).map((r) => r[0]));
    const first = rects.filter((r) => Math.abs(r[0] - left) < 0.01);
    expect(first).toHaveLength(4);
    const height = first.reduce((sum, r) => sum + Math.abs(r[3]), 0);
    const unit = (panel.plotArea.h * ptPerMm) / (panel.yRange[1] - panel.yRange[0]);
    expect(height / unit).toBeCloseTo(DDI[0] + GDI[0] + EDI[0] + WDI[0], 3);
  });

  test('negative controls', () => {
    // the same figure as a line: no bar in the file, and the bar check would say so
    const lineBuilt = build({ bars: false });
    const linePdf = readPdf(lineBuilt.doc);
    const f = lineBuilt.figures[0];
    expect(plotMarks(linePdf, f.page, f.panels[0].plotArea).bars).toBeUndefined();
    // a builder that claims a bar the file does not hold is caught
    const lying = { ...fig, panels: [{ ...panel, marks: { ...panel.marks, bars: 25 } }] };
    expect(() => expectFigureDrawn(pdf, lying)).toThrow(/the builder reports 26/);
    // without xDate the axis prints numbers
    const numeric = build({ xDate: false });
    expect(flat(readPdf(numeric.doc).pageText[numeric.figures[0].page - 1])).not.toContain('2013');
  });
});

describe('annotation corner and marker size', () => {
  const pts = [[0, 0], [1, 2], [2, 4], [3, 6]];
  const one = (spec) => {
    const r = createReport({ title: 'Kit notes', appName: 'Report Kit self-test' });
    r.header({ identification: [['Case', 'notes']], generatedAt: AT });
    r.figures([{ id: 'f', title: 'Line through the origin', caption: 'c', panels: [{ height: 70, spec: { xTitle: 'x', yTitle: 'y', series: [{ name: 'Data', type: 'scatter', pts, ...spec.series }], notes: ['N = 2.00 MMSTB', 'r2 = 1.0000'], notesAt: spec.notesAt } }] }]);
    return r.finish();
  };
  // the Y (points, from the page bottom) at which a text was placed
  const yOf = (built, text) => {
    const raw = readPdf(built.doc).raw;
    const m = new RegExp(`([\\d.]+) ([\\d.]+) Td\\n\\(${text.replace(/[.()]/g, '\\$&')}\\) Tj`).exec(raw);
    return m ? Number(m[2]) : null;
  };

  test('notes go bottom left unless a top corner is named', () => {
    const bottom = one({});
    const top = one({ notesAt: 'top-left' });
    const area = top.figures[0].panels[0].plotArea;
    const ptPerMm = 72 / 25.4;
    const pageH = 297 * ptPerMm;
    const mid = pageH - (area.y + area.h / 2) * ptPerMm;
    expect(yOf(bottom, 'N = 2.00 MMSTB')).toBeLessThan(mid);
    expect(yOf(top, 'N = 2.00 MMSTB')).toBeGreaterThan(mid);
    // the first note is the top line in both
    expect(yOf(top, 'N = 2.00 MMSTB')).toBeGreaterThan(yOf(top, 'r2 = 1.0000'));
    expect(yOf(bottom, 'N = 2.00 MMSTB')).toBeGreaterThan(yOf(bottom, 'r2 = 1.0000'));
    expect(yOf(one({ notesAt: 'top-right' }), 'N = 2.00 MMSTB')).toBeGreaterThan(mid);
  });

  test('a larger marker leaves more ink, and the same number of marks', () => {
    const small = one({});
    const large = one({ series: { markerSize: 1.2 } });
    const ink = (built) => { const pdf = readPdf(built.doc, { ink: true }); try { return pdf.ink(built.figures[0].page, built.figures[0].panels[0].box).dark; } finally { pdf.close(); } };
    expect(ink(large)).toBeGreaterThan(ink(small));
    expect(large.figures[0].panels[0].marks).toEqual(small.figures[0].panels[0].marks);
  });
});
