/**
 * @jest-environment node
 *
 * ReservoirCalc Pro upgrade U1, PL7 (RCP-U1-019, 001): both PDF reports
 * are produced by the shipped generator with the real jsPDF and read back
 * with pdftotext: the reviewer block (field, analyst, date, build, units,
 * method, contacts with their datum), the headline numbers in the right
 * unit, and no character the standard fonts cannot print.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { ReportGenerator } from '../components/tools/ReportGenerator';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { reviewerLines } from '../services/reportInfo';

jest.setTimeout(120000);

// the real jsPDF, with save() capturing the bytes instead of downloading
jest.mock('jspdf', () => {
  const actual = jest.requireActual('jspdf');
  const Real = actual.jsPDF || actual.default;
  function Wrapped(...args) {
    const d = new Real(...args);
    d.save = () => { global.__rcpPdf = Buffer.from(d.output('arraybuffer')); return d; };
    return d;
  }
  Object.assign(Wrapped, Real);
  Wrapped.API = Real.API;
  return { __esModule: true, ...actual, default: Wrapped, jsPDF: Wrapped };
});
beforeAll(() => { global.fetch = () => Promise.reject(new Error('no network in jest')); });

const pdfText = (buf) => {
  const f = path.join(os.tmpdir(), `rcp-u1-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};
const now = new Date('2026-09-30T12:00:00Z');

test('the deterministic PDF carries the reviewer block and Latin-1 text', async () => {
  const inputs = { area: 5000, thickness: 50, ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, fluidType: 'oil', recovery: 25, owc: -8000 };
  const r = VolumeCalculationEngine.calculateDeterministic(inputs, 'field', 'simple');
  await ReportGenerator.generateDeterministicReport('Keta Project', r, 'field', {
    fluidType: 'oil', inputs: r.inputs, reservoirName: 'Upper Sand',
    reviewer: reviewerLines({ report: { field: 'Keta', analyst: 'A. Analyst' }, unitSystem: 'field', inputMethod: 'simple', fluidType: 'oil', inputs, results: r, now, build: 'Petrolord Suite 4.0.0 (abc1234)' }),
  });
  const text = pdfText(global.__rcpPdf);
  expect(text).toMatch(/Field: Keta \| Analyst: A\. Analyst \| Date: 2026-09-30 \| Petrolord Suite 4\.0\.0 \(abc1234\)/);
  expect(text).toMatch(/Units: Field \(acres, ft, STB, scf/);
  expect(text).toMatch(/Contacts: not used by the Simple method/);
  expect(text).toMatch(/Porosity \(phi\)/);
  // 7758 x 5000 x 50 x 0.2 x 0.7 / 1.2 = 226,275,000 STB
  expect(text).toMatch(/226,275,000/);
  expect(text).not.toMatch(/[φ−—•]/);
});

test('the probabilistic PDF reads a metric gas run in Bsm3 (it printed MMsm3 over 1e9)', async () => {
  const st = (v) => ({ p90: v * 0.6, p50: v, p10: v * 1.6, mean: v * 1.05, stdDev: v * 0.3, min: v * 0.3, max: v * 2.5, cdf: [] });
  const results = {
    stats: { stooip: {}, giip: st(4.2e9), sensitivity: [], iterations: 5000, validCount: 5000 },
    raw: { stooip: [], giip: [4.2e9], samples: [] },
    diagnostics: { rejectedCount: 0, warnings: [], tracking: {} },
    meta: { unitSystem: 'metric', fluidType: 'gas', grvMode: 'structural', iterations: 5000, ranAt: '2026-09-30T11:00:00.000Z' },
  };
  await ReportGenerator.generateProbabilisticReport('Keta Project', results, 'field', {}, {
    template: 'executive', fluidType: 'gas', reservoirName: 'Upper Sand',
    reviewer: reviewerLines({ report: { field: 'Keta' }, unitSystem: 'metric', inputMethod: 'hybrid', fluidType: 'gas', inputs: { goc: -1560 }, probResults: results, now, build: 'Petrolord Suite test' }),
  });
  const text = pdfText(global.__rcpPdf);
  expect(text).toMatch(/4\.20 Bsm/);
  expect(text).not.toMatch(/MMsm/);
  expect(text).toMatch(/GWC -1,560 m/);
  expect(text).toMatch(/Monte Carlo: 5,000 realizations, GRV from the surface against sampled contacts/);
  expect(text).toMatch(/exceeded with 90, 50 and 10 percent probability/);
});
