/**
 * @jest-environment node
 *
 * AppUpgrade WC-U2-006 (PL7): the section PDF is plotted to scale and says
 * so. The page is opened with pdftotext and pdfinfo: the header a reviewer
 * signs (as on the PNG), the scale statement and legend, and a page whose
 * panel measures span / N on paper. Negative control: on origin/main there
 * is no PDF export (services/sectionPdf.js does not exist).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { printPlan, buildSectionPdf, scaleBar, scaleLabel, MM_PER_CSS_PX } from '../services/sectionPdf';
import { sectionCaption } from '../services/sectionReport';

// a 1x1 white PNG stands in for the offscreen render (canvas is browser work)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function readPdf(doc) {
  const f = path.join(os.tmpdir(), `wc-section-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try {
    return {
      text: execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'latin1' }).replace(/[ \t]+/g, ' '),
      info: execFileSync('pdfinfo', [f], { encoding: 'latin1' }),
    };
  } finally { fs.unlinkSync(f); }
}

test('the print plan makes the depth window measure span / N on paper', () => {
  const p = printPlan({ vTop: 1400, vBase: 1700, scaleN: 1000, contentW: 600, plotTop: 78, padBottom: 4 });
  expect(p.problem).toBeNull();
  expect(p.plotHmm).toBeCloseTo(300, 9);                 // 300 m at 1:1,000 is 30 cm
  expect(p.plotHcss * MM_PER_CSS_PX).toBeCloseTo(300, 9);
  expect((p.hCss - 82) * MM_PER_CSS_PX).toBeCloseTo(300, 9); // the band the section draws in
  const big = printPlan({ vTop: 0, vBase: 3000, scaleN: 500, contentW: 600, plotTop: 78, padBottom: 4 });
  expect(big.problem).toMatch(/6.00 m of paper, more than a PDF page can hold/);
});

test('scale labels and the scale bar in metres and feet', () => {
  expect(scaleLabel(1000, 'm')).toBe('1:1,000 (1 cm = 10 m)');
  expect(scaleLabel(1200, 'ft')).toBe('1:1,200 (1 in = 100 ft)');
  const bar = scaleBar(1000, 'm');
  expect(bar).toEqual({ value: 20, mm: 20 }); // 20 m is 2 cm at 1:1,000
  const ft = scaleBar(1200, 'ft');
  expect(ft.mm).toBeCloseTo(ft.value * 0.3048 * 1000 / 1200, 9);
});

test('the PDF carries the reviewer header, the scale statement, the legend and a page of the right size', () => {
  const plan = printPlan({ vTop: 1400, vBase: 1700, scaleN: 1000, contentW: 700, plotTop: 78, padBottom: 4 });
  const header = sectionCaption({
    wells: [{ name: 'KETA-1' }, { name: 'KETA-2' }], datum: { mode: 'flatten', topName: 'Top Dome', datumM: 1500 },
    depthRef: 'tvdss', depthUnit: 'm', spacing: 'equal', templateName: 'Raw quicklook', scale: 1000,
    report: { field: 'Keta Field', analyst: 'A. Analyst' }, now: new Date('2026-09-29T10:00:00Z'), build: 'Petrolord Suite test',
  });
  const { doc, fileName, imgTop } = buildSectionPdf({
    imageDataUrl: PNG, plan, plotTopCss: 78, header, scaleN: 1000, depthUnit: 'm',
    legend: [{ name: 'Top Dome', color: '#b45309' }, { name: 'Base Sand – lower', color: '#0e7490' }], fillNote: 'between consecutive shown tops',
  });
  expect(fileName).toBe('Well_Correlation_Keta_Field_2_wells_1-1000.pdf');
  const { text, info } = readPdf(doc);
  for (const s of [
    'Petrolord Suite - Well Correlation: Keta Field (2 wells)',
    'Wells: KETA-1, KETA-2',
    'Flattened on Top Dome at 1500 m TVDSS',
    'Vertical scale 1:1,000',
    'Field Keta Field',
    'Analyst A. Analyst',
    '2026-09-29',
    'Petrolord Suite test',
    'Plotted to scale: vertical 1:1,000 (1 cm = 10 m) when printed at 100 %',
    'Tops: Top Dome',
    'Base Sand - lower',
    'Fill: between consecutive shown tops',
    '20 m',
  ]) expect(text).toContain(s);
  // page height = header + panel (whose plot band is 300 mm) + margin, in pt
  const m = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info);
  const hMm = Number(m[2]) * 25.4 / 72;
  expect(hMm).toBeCloseTo(imgTop + plan.hCss * MM_PER_CSS_PX + 10, 0);
  expect(plan.hCss * MM_PER_CSS_PX).toBeGreaterThan(300);
});
