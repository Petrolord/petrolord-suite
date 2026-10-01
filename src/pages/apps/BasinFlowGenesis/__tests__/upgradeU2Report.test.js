/**
 * @jest-environment node
 *
 * BF-U2-011 (PL7): the report draws the burial history, the maturity and the
 * events chart as vectors; read back with pdftotext (titles, axes, legend,
 * the eroded section, the critical moment), Latin-1 only. A report with no
 * run draws no plot page.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { jsPDF } from 'jspdf';
import { SimulationEngine } from '../services/SimulationEngine';
import { referenceBasinRow } from '../services/backend';
import { basinReportPdf } from '../services/report';
import { drawBurialChart, drawMaturityChart, drawEventsChart } from '../services/reportCharts';
import { withLayerRoles } from '../services/resultsView';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const pdfText = (buf) => {
  const f = path.join(os.tmpdir(), `bf-u2-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};

const row = referenceBasinRow();
const state = { stratigraphy: row.stratigraphy, heatFlow: row.heat_flow, erosionEvents: row.erosion_events, settings: row.settings, calibration: { ro: [], temp: [] } };
let results;
beforeAll(async () => { results = await SimulationEngine.run(state); }, 120000);

test('the PDF carries the three plots with their labels and the eroded section', () => {
  const doc = basinReportPdf(jsPDF, { modelName: 'Reference Basin', state, results, units: { depth: 'ft', temp: 'F' }, report: {}, notes: [] });
  expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  const text = pdfText(Buffer.from(doc.output('arraybuffer')));
  expect(text).toMatch(/Burial history/);
  expect(text).toMatch(/Depth \(ft\)/);
  expect(text).toMatch(/Age \(Ma\)/);
  expect(text).toMatch(/Eroded section \(removed at 10 Ma\)/);
  expect(text).toMatch(/Maturity \(Easy%Ro\)/);
  expect(text).toMatch(/Oil window/);
  expect(text).toMatch(/Petroleum system events/);
  expect(text).toMatch(/Critical moment \d+ Ma/);
  expect(text).toMatch(/Source Shale/);
  expect(text).not.toMatch(/[—−•²]/);
});

test('the drawers draw every layer and the eroded section; a result with no erosion draws none', async () => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const roles = withLayerRoles(results, state.stratigraphy);
  const b = drawBurialChart(doc, { x: 10, y: 10, w: 190, h: 90 }, { results: roles, units: { depth: 'm' } });
  expect(b).toEqual({ layers: 4, eroded: 1 });
  expect(drawMaturityChart(doc, { x: 10, y: 110, w: 190, h: 80 }, { results: roles }).lines).toBe(4);
  const ev = drawEventsChart(doc, { x: 10, y: 200, w: 190, h: 70 }, { results: roles });
  expect(ev.bars).toBeGreaterThan(4);
  expect(ev.criticalMoment).not.toBeNull();
  const none = await SimulationEngine.run({ ...state, erosionEvents: [] });
  expect(drawBurialChart(new jsPDF(), { x: 10, y: 10, w: 190, h: 90 }, { results: withLayerRoles(none, state.stratigraphy), units: { depth: 'm' } }).eroded).toBe(0);
}, 120000);

test('no run: no plot page', () => {
  const doc = basinReportPdf(jsPDF, { modelName: 'M', state, results: null, units: { depth: 'm', temp: 'C' }, report: {}, notes: [] });
  expect(doc.getNumberOfPages()).toBe(1);
});
