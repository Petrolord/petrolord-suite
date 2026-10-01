/**
 * @jest-environment node
 *
 * PP-U1-008 (PL7): the prognosis PDF is produced by the shipped generator
 * with the real jsPDF and read back with pdftotext: the reviewer block
 * (well, field, analyst, date, build, units, datum, method, NCT status,
 * calibration) and the 3,500 m row in the chosen units, Latin-1 only.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { jsPDF } from 'jspdf';
import { buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';
import { prognosisPdf, reviewerLines, reportRows } from '../services/report';
import { prognosisCsv, emwPpg } from '../services/units';
import { drillingWindow } from '../services/drillingWindow';

const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure', 'goldens.json'), 'utf8')).well;
const P = W.params;
const params = {
  waterDepthM: 100, rhoSeawaterKgM3: P.rho_seawater, rhoFluidKgM3: P.rho_fluid, mudlineMdM: 130,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m }, method: 'eaton', eatonN: 3, nu: 0.4,
  report: { field: 'Keta', analyst: 'A. Analyst' },
};
const input = buildProfileInput({ depth: W.z_bml_m.map((z) => z + 130), dt: W.dt_us_per_m, rho: W.rho_kg_m3 }, { DT: 'US/M', RHOB: 'KG/M3' }, { mudlineMdM: 130 });
const result = computeProfile({ ...input, params });
const args = {
  wellName: 'ORACLE PP-1', params, units: { depth: 'm', pressure: 'MPa' }, input, result,
  calibration: [{ z: 3000, pMpa: 34.5 }], nctFitted: true, window: drillingWindow(result, input.zBmlM, params),
  now: new Date('2026-10-01T12:00:00Z'), build: 'Petrolord Suite 4.0.0 (abc1234)', report: params.report,
};

const pdfText = (buf) => {
  const f = path.join(os.tmpdir(), `pp-u1-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};

test('the PDF carries the reviewer block and the golden row', () => {
  const doc = prognosisPdf(jsPDF, args);
  const text = pdfText(Buffer.from(doc.output('arraybuffer')));
  expect(text).toMatch(/Well: ORACLE PP-1 \| Field: Keta \| Analyst: A\. Analyst \| Date: 2026-10-01 \| Petrolord Suite 4\.0\.0 \(abc1234\)/);
  expect(text).toMatch(/EMW datum: RKB/);
  expect(text).toMatch(/mudline MD 130 m below RKB \(air gap 30 m\)/);
  expect(text).toMatch(/density log throughout/);
  expect(text).toMatch(/Method: Eaton sonic, n = 3/);
  expect(text).toMatch(/fitted on this source/);
  expect(text).toMatch(/Calibration: 1 point/);
  expect(text).toMatch(/Drilling window: narrowest/);
  const i = input.zBmlM.indexOf(3500);
  const pp = (result.porePressurePa[i] / 1e6).toFixed(2);
  const ppg = emwPpg(result.porePressurePa[i], 3630).toFixed(2);
  expect(text).toMatch(new RegExp(`3,500\\s+3,630\\s+[\\d.]+\\s+[\\d.]+\\s+${pp.replace('.', '\\.')}\\s+[\\d.]+\\s+${ppg.replace('.', '\\.')}`));
  expect(text).not.toMatch(/[—−•φ]/);
});

test('an uncalibrated, unfitted trend says so; the CSV carries the same block', () => {
  const lines = reviewerLines({ ...args, calibration: [], nctFitted: false, report: {}, params: { ...params, mudlineMdM: 0 } });
  expect(lines.join('\n')).toMatch(/Field: not given \| Analyst: not given/);
  expect(lines.join('\n')).toMatch(/NOT fitted on this source/);
  expect(lines.join('\n')).toMatch(/Calibration: none/);
  expect(lines.join('\n')).toMatch(/mudline MD not set/);
  const csv = prognosisCsv(input, result, params, { depth: 'm', pressure: 'MPa' }, { source: 'ORACLE PP-1', reviewer: reviewerLines(args) });
  expect(csv).toMatch(/^# Well: ORACLE PP-1 \| Field: Keta/m);
  expect(reportRows(args).length).toBeGreaterThan(10);
});
