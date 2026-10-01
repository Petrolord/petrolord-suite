/**
 * @jest-environment node
 *
 * U2-003 (finding EM-U1-021), PL7: the model report a reviewer signs, read
 * back with pdftotext. Every number checked here is the build's own number
 * formatted the way the QC panel shows it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition } from '../services/modelBuild';
import { buildModelReportPdf, latin1 } from '../services/modelReportPdf';
import { fmtVolume } from '../services/units';
import { FAULT_POLYGON } from '../services/fixture';

function pdfText(doc) {
  const f = path.join(os.tmpdir(), `em-report-${process.pid}-${Date.now()}-${Math.random()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
}

let built;
beforeAll(async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const by = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  built = await buildModel({
    ...emptyDefinition(), name: 'Keta report test',
    surfaceIds: [by.TopA.id, by.TopB.id, by.BaseB.id], topNames: ['TopA', 'TopB', 'BaseB'],
    zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
    faultPolygons: [{ name: 'F1', vertices: FAULT_POLYGON }],
    fluidsInput: [{ goc: '1540', gocUnit: 'm', owc: '1580', owcUnit: 'm', bo: '1.25', bg: '0.8', bgUnit: 'RB/Mscf', blocks: { 1: { owc: '1560', owcUnit: 'm' } } }, null],
  }, wells, surfaces, backend);
});

test('the reviewer header, the zone volumes and the contacts as used read back', async () => {
  const { doc, fileName, pages } = await buildModelReportPdf({
    built, name: 'Keta report test', volumeUnits: 'metric', report: { field: 'Keta', analyst: 'A. Reviewer' },
    now: new Date('2026-10-01T10:00:00Z'), build: 'build test-123', logo: null,
  });
  expect(fileName).toBe('Keta_report_test-report.pdf');
  expect(pages).toBeGreaterThanOrEqual(2);
  const t = pdfText(doc);
  for (const s of ['Model report: Keta report test', 'Field', 'Keta', 'A. Reviewer', '2026-10-01', 'build test-123', 'TVDSS, metres below mean sea level, positive down', 'Prepared by (analyst)', 'Reviewed by', 'Contacts and FVFs as used', 'Volumes per zone and fault block', 'Population provenance', 'Well ties']) {
    expect(t).toContain(s);
  }
  // the zone totals as the QC panel formats them
  const zA = built.zones[0].volumes.total;
  for (const c of ['bulk_m3', 'hcpv_m3', 'stoiip_m3', 'giip_m3']) expect(t).toContain(fmtVolume(zA[c], c, 'metric'));
  // the contacts as the build read them (Bg 0.8 RB/Mscf = 0.8 x 5.614583 / 1000 rm3/sm3; block 1 own OWC)
  expect(t).toMatch(/Zone A: GOC 1540\.0 m; OWC 1580\.0 m; Bo 1\.25 rb\/stb; Bg 0\.004492 rm3\/sm3/);
  expect(t).toContain('block 1: OWC 1560.0 m');
  // Zone B has no OWC: flagged
  expect(t).toContain('Zone B: no OWC, the whole zone counts as hydrocarbon.');
  expect(t).toMatch(/page 1 of \d/);
});

test('field units carry the field labels; refusals and Latin-1', async () => {
  const { doc } = await buildModelReportPdf({ built, name: 'F', volumeUnits: 'field', logo: null });
  const t = pdfText(doc);
  expect(t).toContain('MMstb');
  expect(t).toContain(fmtVolume(built.zones[0].volumes.total.stoiip_m3, 'stoiip_m3', 'field'));
  // negative control: the metric number is not what the field report prints
  expect(fmtVolume(built.zones[0].volumes.total.stoiip_m3, 'stoiip_m3', 'field')).not.toBe(fmtVolume(built.zones[0].volumes.total.stoiip_m3, 'stoiip_m3', 'metric'));
  expect(t).toContain('not given');
  await expect(buildModelReportPdf({ built: null })).rejects.toThrow(/Build the model first/);
  expect(latin1('a → b ≤ c – d φ')).toBe('a -> b <= c - d phi');
});
