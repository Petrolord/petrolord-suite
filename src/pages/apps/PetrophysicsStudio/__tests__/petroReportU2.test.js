/**
 * AppUpgrade PETRO-U2 (PL7): the PDF read back through pdftotext, the tool a
 * reviewer's machine would use, not our own text-operator scrape.
 *
 * U2-005: the cutoff sensitivity table is in the report with the current
 * cutoff marked and the numbers of the zone card.
 * Negative control (run 2026-09-29): with the sensitivities argument dropped
 * from buildReport the "Cutoff sensitivity" assertions fail.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWellZoned, DEFAULT_PARAMS } from '../engine/pipeline';
import { zoneReports } from '../services/zoneAverages';
import { zoneSensitivities } from '../services/cutoffSensitivity';
import { buildReport } from '../services/petroReport';

jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null }));

/** Write the jsPDF doc to disk and read it back with poppler's pdftotext. */
export function pdftotext(doc) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'petro-pdf-')), 'report.pdf');
  fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

const curvesOf = () => {
  const c = {};
  for (const [k, v] of Object.entries(typewell.curves)) c[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  return c;
};

test('U2-005: the cutoff sensitivity table reaches the PDF with the current cutoff marked', async () => {
  const curves = curvesOf();
  const [top, base] = typewell.params.zones.SAND_A;
  const zones = [{ id: 'zA', name: 'SAND A', top_md_m: top, base_md_m: base }];
  const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, []);
  const summaries = zoneReports({ curves, outputs, params: DEFAULT_PARAMS, zones });
  const sensitivities = zoneSensitivities({ curves, outputs, params: DEFAULT_PARAMS, zones });
  const doc = await buildReport({
    wellName: 'TYPE-1', wellData: { curves, inventory: [] }, params: DEFAULT_PARAMS, zones, summaries,
    projectId: 'p', sensitivities, generatedAt: new Date('2026-09-29T10:00:00Z'),
  });
  const text = pdftotext(doc);
  expect(text).toContain('Cutoff sensitivity');
  expect(text).toContain('SPE 84387');
  expect(text).toMatch(/Porosity cutoff \(phie >=\)/);
  // the current porosity cutoff, marked, with the card's net pay beside it
  expect(text).toContain(`*0.08: ${Number(summaries.zA.net_m.toFixed(2))}`);
  expect(text).toMatch(/\*0\.5: /);
  expect(text).toMatch(/\*0\.6: /);
});
