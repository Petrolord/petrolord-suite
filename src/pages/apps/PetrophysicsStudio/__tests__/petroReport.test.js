/**
 * AppUpgrade PETRO-U1-009 (PL7): the PDF a reviewer can sign. The report
 * must carry who and what (company, field, well, UWI, analyst,
 * interpretation, units, datum, software build) and every input that
 * changed the answer: the whole parameter set (phi shale, permeability,
 * temperature were missing) and the per-zone overrides (a zone with its
 * own cutoffs was reported under the base values).
 *
 * Negative control (run 2026-09-28): on the pre-fix petroReport.js the
 * header, phi shale, permeability model and override assertions fail;
 * without latin1Safe the labels print as "P o r o s i t y :  Æ  s h a l e".
 */
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWellZoned, DEFAULT_PARAMS } from '../engine/pipeline';
import { zoneReports } from '../services/zoneAverages';
import { buildReport } from '../services/petroReport';

jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null }));

const pdfText = (doc) => {
  // jsPDF writes uncompressed text operators: "(...) Tj"
  const raw = doc.output();
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join(' ');
};

test('the header, every parameter, the overrides and the zone numbers reach the PDF', async () => {
  const curves = {};
  for (const [k, v] of Object.entries(typewell.curves)) curves[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  const zones = [{ id: 'zA', name: 'SAND A', top_md_m: 2010, base_md_m: 2030 }];
  const zoneParams = { zA: { cutPhi: 0.12 } };
  const { outputs } = computeWellZoned(curves, DEFAULT_PARAMS, [{ top: 2010, base: 2030, params: zoneParams.zA }]);
  const well = { name: 'KETA TYPE-1', uwi: 'NG-KETA-0001', kb_m: 30, surface_x: 501000, surface_y: 6700200, crs: 'EPSG:32631', deviation: [] };
  const summaries = zoneReports({ curves, outputs, params: DEFAULT_PARAMS, zones, zoneParams, well });
  const doc = await buildReport({
    wellName: well.name, well, wellData: { curves, inventory: [{ key: 'DEPT', log: { id: 'l1' } }, { key: 'GR', log: { id: 'l2' } }], inputNotes: ['NPHI is in PU: divided by 100 to v/v for the pipeline.'] },
    params: DEFAULT_PARAMS, zones, zoneParams, summaries, projectId: 'project-7', projectName: 'Base case 2026',
    header: { company: 'Lordsway Energy', field: 'Keta', analyst: 'A. Petrophysicist' },
    generatedAt: new Date('2026-09-28T10:00:00Z'),
  });
  const text = pdfText(doc);
  for (const s of ['Lordsway Energy', 'Keta', 'NG-KETA-0001', 'A. Petrophysicist', 'Base case 2026', 'EPSG:32631',
    'KB 30.00 m above the vertical datum', 'Petrophysics Studio, pipeline v', '2026-09-28 10:00 UTC']) {
    expect(text).toContain(s);
  }
  // parameters the hand-written table left out
  expect(text).toContain('Porosity: phi shale (v/v)');
  // PETRO-U1-010: Latin-1 only; the Greek labels used to print as mojibake
  expect(text).not.toMatch(/P o r o s i t y|Æ|Á/);
  expect(text).toContain('Cutoffs: phi >=');
  expect(text).toMatch(/Permeability: Model\s+timur/);
  expect(text).toMatch(/Temperature: Model\s+none/);
  // the override, named
  expect(text).toContain('Zone parameter overrides');
  expect(text).toMatch(/SAND A\s+.*0\.12/);
  // the zone line carries net reservoir, TVT and HCPV beside net pay
  expect(text).toContain('Net res (m)');
  expect(text).toContain('HCPV (m)');
  expect(text).toContain(String(Number(summaries.zA.net_m.toFixed(2))));
  // the averaging convention and the input conversion are stated
  expect(text).toMatch(/pore-volume weighted/);
  expect(text).toContain('Input: NPHI is in PU');
});

test('missing header fields read n/a, never blank', async () => {
  const curves = { DEPT: Float64Array.from([2000, 2000.5]) };
  const doc = await buildReport({
    wellName: 'W', wellData: { curves, inventory: [] }, params: DEFAULT_PARAMS, zones: [], summaries: {}, projectId: null,
  });
  const text = pdfText(doc);
  expect(text).toMatch(/Company\s+n\/a/);
  expect(text).toMatch(/Analyst\s+n\/a/);
  expect(text).toContain('KB not recorded');
});
