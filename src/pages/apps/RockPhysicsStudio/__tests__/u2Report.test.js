/**
 * @jest-environment node
 *
 * RP-U2-004 (PL7): the PDF a reviewer signs, made by the shipped generator
 * with the real jsPDF and read back with pdftotext. The numbers on the page
 * are the oracle's (the harness well is the log_domain golden). Negative
 * control: a report for a well with a shear log does not say estimated; one
 * without does.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { jsPDF } from 'jspdf';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { computeZoneResult } from '../services/zoneResult';
import { substitutionPdf, substitutionPdfName, reportBlocks, zoneTopAvo, latin1 } from '../services/report';
import { substitutionCsv } from '../services/substitutionCsv';
import { niceTicks } from '../services/reportPlot';
import { shuey } from '../engine/avo';

async function load(name, opts) {
  const backend = makeInMemoryBackend(opts);
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { well, model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}
const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
const units = { velocity: 'm/s', density: 'kg/m3', depth: 'm' };
const now = new Date('2026-10-01T12:00:00Z');
const pdfText = (doc) => {
  const f = path.join(os.tmpdir(), `rp-u2-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};
async function argsFor(name, opts, r = rock, u = units) {
  const { well, model, zones } = await load(name, opts);
  const zone = zones[0];
  const result = computeZoneResult(model, zone, DEFAULT_SCENARIO, r);
  return { well, zone, model, result, scenario: DEFAULT_SCENARIO, rock: r, units: u, reviewer: { field: 'Keta', analyst: 'A. Analyst' }, now, build: 'Petrolord Suite 4.0.0 (abc1234)' };
}

test('the PDF carries the reviewer header, the oracle numbers, the AVO and the three plots; read back with pdftotext', async () => {
  const args = await argsFor('KETA RP-1');
  const doc = substitutionPdf(jsPDF, args);
  const text = pdfText(doc);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results', 'rp-u2-report.txt'), text);
  fs.writeFileSync(path.join('test-results', 'rp-u2-report.pdf'), Buffer.from(doc.output('arraybuffer')));
  // reviewer header
  expect(text).toContain('Petrolord Suite - Rock Physics Studio');
  expect(text).toMatch(/Field:\s+Keta/);
  expect(text).toMatch(/Well:\s+KETA RP-1/);
  expect(text).toMatch(/Zone:\s+BRINE SAND \(MD 2020\.0 to 2040\.0 m\)/);
  expect(text).toMatch(/Analyst:\s+A\. Analyst/);
  expect(text).toMatch(/Date:\s+2026-10-01 12:00:00/);
  expect(text).toMatch(/Software:\s+Petrolord Suite 4\.0\.0 \(abc1234\)/);
  expect(text).toMatch(/Conditions:\s+60\.0 degC, pore pressure 25\.00 MPa/);
  expect(text).toMatch(/Mineral modulus:\s+37\.000 GPa \(override\)/);
  expect(text).toMatch(/Shear:\s+measured shear log/);
  expect(text).toMatch(/Samples:\s+41 in zone; 41 substituted/);
  // the log_domain golden on the page: 3200 / 1800 / 2250 to 2905.7 / 1891.0 / 2038.7
  expect(text).toMatch(/before \(fluid A\)\s+3200\.0\s+1800\.0\s+2250\.0/);
  expect(text).toMatch(/after \(fluid B\)\s+2905\.7\s+1891\.0\s+2038\.7/);
  // the zone top AVO through the engine
  const { a, b } = shuey(2900, 1330, 2290, 3200, 1800, 2250, 0);
  expect(text).toContain(`${a.toFixed(4)}`);
  expect(text).toContain(`${b.toFixed(4)}`);
  expect(text).toMatch(/zone with 100% gas/);
  // plots: titles, axis titles, legends as text
  for (const w of ['Velocity against depth', 'MD (m), downward', 'Impedance against Vp/Vs', 'Vp/Vs', 'Zone top reflectivity', 'Incidence angle (deg)', 'Vp in situ', 'Vp substituted', 'Petrolord']) expect(text).toContain(w);
  expect(args.plotsDrawn.depth.drawn['Vp in situ']).toBe(41);
  expect(args.plotsDrawn.crossplot.drawn.substituted).toBe(41);
  expect(args.plotsDrawn.avo.drawn['in situ']).toBe(21);
  // depth axis covers the zone, downward
  expect(args.plotsDrawn.depth.y[0]).toBeLessThanOrEqual(2020);
  expect(args.plotsDrawn.depth.y[1]).toBeGreaterThanOrEqual(2040);
  expect(text).toMatch(/Prepared by: A\. Analyst/);
  expect(text).toContain('Reviewed by:');
  expect(text).not.toContain('ESTIMATED');
  expect(text).not.toMatch(/[—–]/);
  expect(doc.getNumberOfPages()).toBe(1);
  expect(substitutionPdfName(args.well, args.zone)).toBe('rock-physics_KETA_RP-1_BRINE_SAND.pdf');
});

test('estimated shear is said on the page (PL4), in field units the numbers convert, and the CSV header is the same block', async () => {
  const args = await argsFor('AKOMA-2 (org shared)', {}, rock, { velocity: 'ft/s', density: 'g/cc', depth: 'ft' });
  const text = pdfText(substitutionPdf(jsPDF, args));
  expect(text).toMatch(/Shear:\s+Vs estimated \(Greenberg-Castagna on VSH\); no shear log/);
  expect(text).toMatch(/Vs is ESTIMATED/);
  expect(text).toMatch(/Zone:\s+BRINE SAND \(MD 6627\.3 to 6692\.9 ft\)/);
  expect(text).toContain('MD (ft), downward');
  expect(text).toMatch(/before \(fluid A\)\s+10499\s/); // 3200 m/s in ft/s
  // one header for both exports
  const csv = substitutionCsv({ ...args, sub: args.result.sub, indices: args.result.indices });
  const blocks = reportBlocks(args);
  for (const [k, v] of blocks.header) expect(csv).toContain(`# ${k}: ${v}`.replace(/"/g, ''));
});

test('hostile content: a long zone is thinned in the plots and said; odd characters print as Latin-1', async () => {
  const args = await argsFor('LONG RP-3 (5000 m)', { long: true }, DEFAULT_ROCK);
  args.reviewer = { field: 'Kéta — φ θ ρ ·', analyst: 'Ångström' };
  const doc = substitutionPdf(jsPDF, args);
  const text = pdfText(doc);
  expect(text).toMatch(/Plots draw every \d+th of 26247 zone samples/);
  expect(args.plotsDrawn.depth.drawn['Vp in situ']).toBeLessThanOrEqual(400);
  expect(text).toContain('Kéta - phi theta rho .');
  expect(text).toContain('Ångström');
  expect(latin1('a — b · c φ')).toBe('a - b . c phi');
  expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  // a zone top with no rock above it has no AVO, and the table says n/a
  const { model, zones } = await load('KETA RP-1');
  expect(zoneTopAvo(model, model, { top_md_m: 2000, base_md_m: 2010 })).toBeNull();
  expect(zoneTopAvo(model, model, zones[0]).cls).toBe('I');
});
