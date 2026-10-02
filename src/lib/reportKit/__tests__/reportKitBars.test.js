/**
 * Report Kit self-test for the bar chart (./bars.js, added in the Reservoir
 * round for Risked Reserves Valuation): a report with bar figures is built
 * and read back from the PDF file through the kit's own test side.
 */
import { createReport, drawBars, SERIES_RGB } from '@/lib/reportKit';
import {
  readPdf, chartLogo, flat, listCaptions, pointCounts, plotMarks, expectFigureDrawn,
} from '@/lib/reportKit/testKit';

const AT = new Date('2026-10-02T09:00:00Z');
const logo = chartLogo();

const FACTORS = ['Trap', 'Reservoir', 'Charge', 'Seal', 'Chance of success (product)'];
const VALUES = [80, 80, 50, 100, 32];

function build({ values = VALUES } = {}) {
  const r = createReport({ title: 'Report Kit Bars Self-Test', appName: 'Petrolord Report Kit', logo });
  r.header({ identification: [['Prospect', 'KIT-1']], generatedAt: AT });
  r.figures([
    {
      id: 'chance',
      title: 'Chance factors and their product',
      caption: 'One bar per factor; the last bar is the product.',
      panels: [{
        kind: 'bars',
        height: 70,
        spec: {
          yTitle: 'Chance, %', categories: FACTORS, yInclude: [100],
          valueText: (v) => `${v.toFixed(0)}%`,
          lines: [{ y: 50, label: 'Even chance', dash: [1, 1] }],
          series: [{ name: 'Chance', values, rgb: SERIES_RGB.blue, rgbs: [null, null, null, null, SERIES_RGB.emerald] }],
        },
      }],
    },
    {
      id: 'grouped',
      title: 'Two series side by side, with a negative value',
      caption: 'A group of bars per category and a legend.',
      panels: [{
        kind: 'bars',
        height: 60,
        spec: {
          xTitle: 'Case', yTitle: 'Value, $MM', categories: ['Low', 'Base', 'High'],
          series: [{ name: 'Unrisked', values: [-20, 140, 410] }, { name: 'Risked', values: [-25, 20, NaN] }],
          notes: ['A missing value draws no bar'],
        },
      }],
    },
    {
      id: 'line',
      title: 'A line plot beside the bars',
      caption: 'The plot of ./plot.js is unchanged.',
      panels: [{ height: 50, spec: { xTitle: 'x', yTitle: 'y', series: [{ name: 'Line', pts: [[0, 0], [1, 2], [2, 3], [3, 5]] }] } }],
    },
  ]);
  return r.finish({ footer: 'Report Kit Bars Self-Test' });
}

describe('bar chart, read back from the PDF', () => {
  let built; let pdf;
  beforeAll(() => { built = build(); pdf = readPdf(built.doc, { ink: true }); });
  afterAll(() => pdf.close());

  test('the bars are counted per series and are in the file', () => {
    expect(pointCounts(built.figures).chance[0]).toEqual({ Chance: 5 });
    // a value that is not a number draws no bar
    expect(pointCounts(built.figures).grouped[0]).toEqual({ Unrisked: 3, Risked: 2 });
    const [chance, grouped, line] = built.figures;
    expect(chance.panels[0].marks).toEqual({ segments: 0, markers: 0, bars: 5 });
    expect(plotMarks(pdf, chance.page, chance.panels[0].plotArea)).toMatchObject({ bars: 5, markers: 0, frame: true });
    expect(plotMarks(pdf, grouped.page, grouped.panels[0].plotArea).bars).toBe(5);
    // a line plot holds no bars, and its marks are counted as before
    expect(plotMarks(pdf, line.page, line.panels[0].plotArea)).toEqual({ segments: 3, markers: 0, total: 3, frame: true });
  });

  test('each bar figure is really drawn: title, bars in the file, ink, the Petrolord mark', () => {
    for (const f of built.figures) expectFigureDrawn(pdf, f, { logo: true });
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'Chance factors and their product', 'Two series side by side, with a negative value', 'A line plot beside the bars',
    ]);
  });

  test('categories, the value over each bar, the axis title, the reference line and the legend are text', () => {
    const text = flat(pdf.text);
    for (const c of ['Trap', 'Reservoir', 'Charge', 'Seal']) expect(text).toContain(c);
    for (const v of ['80%', '50%', '100%', '32%']) expect(text).toContain(v);
    expect(text).toContain('Chance, %');
    expect(text).toContain('Even chance');
    expect(text).toMatch(/Unrisked\s+Risked/);
    expect(text).toContain('A missing value draws no bar');
  });

  test('the Y axis includes zero and the values asked for', () => {
    expect(built.figures[0].panels[0].yRange[0]).toBe(0);
    expect(built.figures[0].panels[0].yRange[1]).toBeGreaterThanOrEqual(100);
    expect(built.figures[1].panels[0].yRange[0]).toBeLessThanOrEqual(-25);
  });

  test('negative controls: a bar the builder reports and the file does not hold is caught, and an empty chart is blank', () => {
    const lying = { ...built.figures[0], panels: [{ ...built.figures[0].panels[0], marks: { segments: 0, markers: 0, bars: 6 } }] };
    expect(() => expectFigureDrawn(pdf, lying)).toThrow(/holds 5 bars inside the plot area, the builder reports 6/);
    const empty = build({ values: [NaN, NaN, NaN, NaN, NaN] });
    expect(empty.figures[0].panels[0].total).toBe(0);
    const emptyPdf = readPdf(empty.doc, { ink: true });
    try {
      expect(flat(emptyPdf.text)).toContain('No data to plot');
      expect(() => expectFigureDrawn(emptyPdf, empty.figures[0])).toThrow(/drew 0 points/);
    } finally { emptyPdf.close(); }
  });

  test('drawBars on its own returns what it drew', () => {
    const r = createReport({ title: 'x' });
    const out = drawBars(r.doc, { x: 14, y: 30, w: 182, h: 60 }, { categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }] });
    expect(out).toMatchObject({ drawn: { S: 2 }, total: 2, lines: 0, logo: false });
    expect(out.plotArea.w).toBeGreaterThan(100);
  });
});
