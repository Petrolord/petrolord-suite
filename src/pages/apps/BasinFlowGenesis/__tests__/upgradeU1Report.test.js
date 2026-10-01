/**
 * @jest-environment node
 *
 * BF-U1-016 (PL7): the basin report is produced by the shipped generator
 * with the real jsPDF and read back with pdftotext: the reviewer block
 * (model, well, field, analyst, date, build, units, engine, heat flow,
 * erosion, calibration, result status, notes), the stratigraphy and the
 * present-day row of the source layer in the display units, Latin-1 only.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { jsPDF } from 'jspdf';
import { SimulationEngine } from '../services/SimulationEngine';
import { finalDepthProfile } from '../services/resultsView';
import { referenceBasinRow } from '../services/backend';
import { basinReportPdf, reviewerLines } from '../services/report';
import { engineInputsKey, modelNotes } from '../services/honesty';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const pdfText = (buf) => {
  const f = path.join(os.tmpdir(), `bf-u1-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};

const row = referenceBasinRow();
const state = {
  stratigraphy: row.stratigraphy, heatFlow: row.heat_flow, erosionEvents: row.erosion_events,
  settings: { ...row.settings, registryWellName: 'KETA-1', report: { field: 'Keta', analyst: 'A. Analyst' } },
  calibration: { ro: [{ depth: 4000, value: 1.2 }], temp: [{ depth: 3000, value: 110 }] },
};
let results;
beforeAll(async () => {
  results = await SimulationEngine.run(state);
  results.runOf = { key: engineInputsKey(state), at: '2026-10-01T12:00:00Z', wellId: 'w' };
});

test('the PDF carries the reviewer block, the inputs and the golden present-day row', () => {
  const args = { modelName: 'Reference Basin (oracle)', state, results, units: { depth: 'ft', temp: 'F' }, report: state.settings.report, notes: [], stale: { stale: false }, now: new Date('2026-10-01T12:00:00Z'), build: 'Petrolord Suite 4.0.0 (abc1234)' };
  const text = pdfText(Buffer.from(basinReportPdf(jsPDF, args).output('arraybuffer')));
  expect(text).toMatch(/Model: Reference Basin \(oracle\) \| Well: KETA-1 \| Field: Keta \| Analyst: A\. Analyst \| Date: 2026-10-01 \| Petrolord Suite 4\.0\.0 \(abc1234\)/);
  expect(text).toMatch(/Units: depth ft, temperature F/);
  expect(text).toMatch(/Easy%Ro \(Sweeney and Burnham 1990\)/);
  expect(text).toMatch(/Basal heat flow: history 150 Ma 80, 100 Ma 70, 50 Ma 65, 0 Ma 60 mW\/m2/);
  expect(text).toMatch(/Erosion: 10 Ma 1,969 ft removed/);
  expect(text).toMatch(/Calibration: 1 Ro point, RMS [\d.]+ %Ro; 1 temperature point, RMS [\d.]+ F/);
  expect(text).toMatch(/Source Shale/);
  const src = finalDepthProfile(results).find((p) => p.name === 'Source Shale');
  expect(text).toMatch(new RegExp(`Source Shale\\s+[\\d,]+\\s+[\\d,]+\\s+[\\d.,]+\\s+${src.ro.toFixed(3).replace('.', '\\.')}`));
  expect(text).not.toMatch(/[—−•²]/);
  expect(text).not.toMatch(/BasinFlow Genesis Report|Untitled/);
});

test('no run, no calibration and the notes are said, not left out', () => {
  const s = { ...state, calibration: { ro: [], temp: [] }, erosionEvents: [{ age: 23, amount: 0, surface: 'Top Oligocene' }] };
  const lines = reviewerLines({ modelName: 'M', state: s, results: null, units: { depth: 'm', temp: 'C' }, notes: modelNotes(s), report: {} });
  expect(lines.join('\n')).toMatch(/Field: not given \| Analyst: not given/);
  expect(lines.join('\n')).toMatch(/Top Oligocene 23 Ma amount unknown, NOT modelled/);
  expect(lines.join('\n')).toMatch(/Calibration: none/);
  expect(lines.join('\n')).toMatch(/Result: no run/);
  expect(lines.join('\n')).toMatch(/Note: 1 erosion event has no amount/);
  const text = pdfText(Buffer.from(basinReportPdf(jsPDF, { modelName: 'M', state: s, results: null, units: { depth: 'm', temp: 'C' }, notes: [], report: {} }).output('arraybuffer')));
  expect(text).toMatch(/No run: simulate the model/);
});

test('a result computed from other inputs is said in the report', () => {
  const lines = reviewerLines({ modelName: 'M', state, results, units: { depth: 'm', temp: 'C' }, stale: { stale: true, text: 'The inputs changed after this result was computed.' } });
  expect(lines.join('\n')).toMatch(/Result: The inputs changed after this result was computed\./);
});
