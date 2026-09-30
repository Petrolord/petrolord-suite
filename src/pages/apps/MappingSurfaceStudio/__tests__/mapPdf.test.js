/**
 * @jest-environment node
 *
 * MAP-U2-002 (finding MAP-U1-026), PL7: the map PDF is plotted to scale
 * and read back with pdftotext. The scale is proved from the printed
 * coordinate labels: two neighbouring easting labels sit exactly
 * gridStep x 1000 / N x xyToM millimetres apart on the paper, on a metre
 * frame and on a US-survey-feet frame of the same dome.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildMapPdf, planMapPlot, latin1 } from '../services/mapPdf';
import { mapCaption } from '../services/mapReport';

const M_PER_FT_US = 1200 / 3937;
const dome = (xm, ym) => -1500 - 0.00002 * ((xm - 5000) ** 2 + (ym - 5000) ** 2);
const specM = { x0: 500000, y0: 6700000, dx: 100, dy: 100, nx: 101, ny: 101 };
const gridFor = (spec, s) => {
  const z = new Float32Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) z[r * spec.nx + c] = dome(c * spec.dx * s, r * spec.dy * s);
  return z;
};
const specFt = { x0: 1640416, y0: 21981627, dx: 100 / M_PER_FT_US, dy: 100 / M_PER_FT_US, nx: 101, ny: 101 };
const surface = {
  name: 'Top Dome structure', kind: 'structure', z_domain: 'depth', crs: 'EPSG:32632', xy_unit: 'm',
  provenance: { source: { type: 'top', key: 'Top Dome' }, method: 'tension-blocked', control_points: 12, depth_ref: 'tvdss', cell_m: 100, faults: [{ name: 'F1' }] },
};
const contours = { stepM: 10, stepText: '10 m', format: (v) => `${Math.round(v)}` };

function pdfRead(doc, args = ['-layout']) {
  const f = path.join(os.tmpdir(), `map-pdf-${process.pid}-${Date.now()}-${Math.random()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try { return execFileSync('pdftotext', [...args, f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
}
const eastingCentresPt = (bboxHtml) => {
  const words = [...bboxHtml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)]
    .map((m) => ({ x: (Number(m[1]) + Number(m[3])) / 2, y: Number(m[2]), t: m[5] }));
  return words;
};

describe('MAP-U2-002: PDF map plotted to scale', () => {
  test('planMapPlot picks the largest standard scale that fits and refuses a typed scale that does not', () => {
    const p = planMapPlot({ spec: specM, xyToM: 1, paper: 'A3' });
    expect(p.scale).toBe(50000); // 10 km on a 213 mm high frame
    expect(p.mmPerUnit).toBeCloseTo(0.02, 12);
    expect(p.mapMm.h).toBeCloseTo(200, 9);
    expect(() => planMapPlot({ spec: specM, paper: 'A3', scale: 25000 })).toThrow(/needs 400 by 400 mm.*Use 1:50,000 on A3/);
    expect(planMapPlot({ spec: specM, paper: 'A2', scale: 40000 }).scale).toBe(40000);
    expect(() => planMapPlot({ spec: specM, xyToM: NaN })).toThrow(/geographic/);
    expect(() => planMapPlot({ spec: specM, paper: 'B5' })).toThrow(/paper size/);
  });

  test('the feet frame plots at the same scale: its map units are shorter on paper by the foot', () => {
    const m = planMapPlot({ spec: specM, xyToM: 1 });
    const ft = planMapPlot({ spec: specFt, xyToM: M_PER_FT_US });
    expect(ft.scale).toBe(m.scale);
    expect(ft.mapMm.w).toBeCloseTo(m.mapMm.w, 6);
    // negative control: the feet frame read as metres needs a 3.28x smaller scale
    expect(planMapPlot({ spec: specFt, xyToM: 1 }).scale).toBeGreaterThan(3 * m.scale);
  });

  test.each([
    ['metres', specM, 1],
    ['US survey feet', specFt, M_PER_FT_US],
  ])('read back (%s): the header, the scale and the label spacing on paper', async (label, spec, xyToM) => {
    const caption = mapCaption({ surface: { ...surface, xy_unit: xyToM === 1 ? 'm' : 'ftUS', crs: xyToM === 1 ? 'EPSG:32632' : 'EPSG:2274' }, depthUnit: 'm', contourStep: 10, report: { field: 'Okan', analyst: 'A. Mapper' }, now: new Date('2026-09-30T12:00:00Z'), build: 'build test' });
    const { doc, plan, fileName, contourLevels, wellsDrawn } = await buildMapPdf({
      surface, grid: gridFor(spec, xyToM), spec, caption, contours, xyToM, xyUnitLabel: label, logo: null,
      wells: [{ name: 'OKAN-1', x: spec.x0 + 50 * spec.dx, y: spec.y0 + 50 * spec.dy }],
      polygons: [{ name: 'F1', kind: 'fault_polygon', rings: [[[spec.x0 + 10 * spec.dx, spec.y0 + 10 * spec.dy], [spec.x0 + 20 * spec.dx, spec.y0 + 10 * spec.dy], [spec.x0 + 20 * spec.dx, spec.y0 + 60 * spec.dy]]] }],
    });
    expect(fileName).toBe('Top_Dome_structure-A3-1_50000.pdf');
    expect(contourLevels).toBeGreaterThan(3);
    expect(wellsDrawn).toBe(1);
    const text = pdfRead(doc);
    expect(text).toContain('Scale 1:50,000 on A3 landscape');
    expect(text).toContain('Top Dome structure · Okan');
    expect(text).toMatch(/Well top Top Dome from 12 control points, TVDSS at the borehole/);
    expect(text).toMatch(/spline in tension by fault block/);
    expect(text).toMatch(/Field Okan · Analyst A. Mapper · 2026-09-30 · build test/);
    expect(text).toContain(`XY in ${label}`);
    expect(text).toContain('OKAN-1');
    expect(text).toContain('Grid north');
    expect(text).toMatch(/Fault polygon/);
    expect(text).toMatch(/interval 10 m/);
    // the scale on paper, from the printed coordinate labels
    const words = eastingCentresPt(pdfRead(doc, ['-bbox']));
    const row = words.filter((w) => /^\d{1,3}(,\d{3})+$/.test(w.t));
    // the easting labels are the line with the most coordinate words
    const byY = new Map();
    for (const w of row) { const k = Math.round(w.y); byY.set(k, [...(byY.get(k) || []), w]); }
    const eastings = [...byY.values()].sort((a, b) => b.length - a.length)[0].sort((a, b) => a.x - b.x);
    expect(eastings.length).toBeGreaterThanOrEqual(3);
    const dxPt = eastings[1].x - eastings[0].x;
    const du = Number(eastings[1].t.replace(/,/g, '')) - Number(eastings[0].t.replace(/,/g, ''));
    expect(du).toBe(plan.gridStepUnits);
    const expectMm = (du * xyToM * 1000) / plan.scale;
    expect((dxPt * 25.4) / 72).toBeCloseTo(expectMm, 0);
  });

  test('latin1 swaps typography and never prints outside Latin-1', () => {
    expect(latin1('Top – “Dome” ≥ 5 · ok')).toBe('Top - "Dome" >= 5 · ok');
    expect(latin1('Δ')).toBe('?');
  });
});
