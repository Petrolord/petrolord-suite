/**
 * @jest-environment node
 *
 * PP-U2-011 (PL7): the prognosis PDF draws the prognosis plot (vector lines,
 * white panel, depth downward) with the margins, the casing shoes and the
 * calibration by kind, made by the shipped generator with the real jsPDF and
 * read back with pdftotext. Negative control: the same report without the
 * plot (the U1 report) carries none of the plot's text.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { jsPDF } from 'jspdf';
import { buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';
import { prognosisPdf } from '../services/report';
import { drillingWindow, casingDesign } from '../services/drillingWindow';
import { niceTicks, drawPrognosisPlot } from '../services/reportPlot';
import { depthReferences, refMapper } from '../services/depthRef';

const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure', 'goldens.json'), 'utf8')).well;
const P = W.params;
const params = {
  waterDepthM: 100, rhoSeawaterKgM3: P.rho_seawater, rhoFluidKgM3: P.rho_fluid, mudlineMdM: 130,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m }, method: 'eaton', eatonN: 3, nu: 0.25,
  report: { field: 'Keta', analyst: 'A. Analyst' },
};
const input = buildProfileInput({ depth: W.z_bml_m.map((z) => z + 130), dt: W.dt_us_per_m, rho: W.rho_kg_m3 }, { DT: 'US/M', RHOB: 'KG/M3' }, { mudlineMdM: 130 });
const result = computeProfile({ ...input, params });
const casing = casingDesign(result, input.zBmlM, params);
const args = {
  wellName: 'ORACLE PP-1', params, units: { depth: 'm', pressure: 'MPa' }, input, result,
  calibration: [{ z: 3000, pMpa: 34.5 }, { z: 1000, pMpa: 17, kind: 'lot', source: 'lot.csv' }], nctFitted: true,
  window: drillingWindow(result, input.zBmlM, params), casing,
  now: new Date('2026-10-01T12:00:00Z'), build: 'Petrolord Suite 4.0.0 (abc1234)', report: params.report,
};
const pdfText = (buf) => {
  const f = path.join(os.tmpdir(), `pp-u2-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};

test('the PDF draws the prognosis plot and its words read back', () => {
  const a = { ...args };
  const doc = prognosisPdf(jsPDF, a);
  const text = pdfText(Buffer.from(doc.output('arraybuffer')));
  fs.mkdirSync(path.join('test-results'), { recursive: true });
  fs.writeFileSync(path.join('test-results', 'pp-u2-report.txt'), text);
  fs.writeFileSync(path.join('test-results', 'pp-u2-report.pdf'), Buffer.from(doc.output('arraybuffer')));
  for (const word of ['Overburden', 'Hydrostatic', 'Pore pressure', 'Fracture pressure', 'Mud weight (PP + trip)', 'Design FG (FG - kick)', 'Calibration', 'LOT/FIT', 'Depth (m below mudline)', 'Pressure (MPa)']) {
    expect(text).toContain(word);
  }
  expect(casing.seats.length).toBeGreaterThan(0);
  expect(text).toMatch(/Shoe 1/);
  // every series drawn as a polyline of its samples, the points by kind
  expect(a.plotDrawn.drawn.porePressurePa).toBe(input.zBmlM.length);
  expect(a.plotDrawn.drawn.cal).toBe(2);
  // depth runs downward: the plot's depth range starts at the mudline
  expect(a.plotDrawn.yRange[0]).toBe(0);
  expect(a.plotDrawn.yTicks).toContain(4000);
  expect(text).not.toMatch(/[—−•φ]/);
  // the table still follows the plot
  expect(text).toMatch(/3,500\s+3,630/);
});

test('negative control: without the plot the report carries none of its words', () => {
  const text = pdfText(Buffer.from(prognosisPdf(jsPDF, { ...args, plot: false }).output('arraybuffer')));
  expect(text).not.toContain('Hydrostatic');
  expect(text).not.toContain('Depth (m below mudline)');
});

test('in a chosen depth frame and an EMW unit the axes say so', () => {
  const refs = depthReferences(input, params, { kbM: 30 });
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const d = drawPrognosisPlot(doc, { x: 10, y: 10, w: 180, h: 140 }, { ...args, units: { depth: 'ft', pressure: 'ppg' }, mapper: refMapper(refs, 'tvdss') });
  expect(d.yTitle).toBe('Depth (ft TVDSS)');
  expect(d.xTitle).toBe('EMW (ppg) below RKB');
  expect(d.yRange[0]).toBeLessThanOrEqual(328.1); // 100 m of water below sea level, in ft
  expect(niceTicks(0, 13.2, 6)).toEqual([0, 2.5, 5, 7.5, 10, 12.5]);
});
