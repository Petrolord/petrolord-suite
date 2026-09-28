/**
 * @jest-environment node
 *
 * WDM-U2-011 (finding WDM-U1-033), PL7: the well data sheet PDF is opened
 * with pdftotext and read: the identity a reviewer signs (well, UWI, CRS,
 * datum assumption, KB, TD, unit, analyst, date, software), the tops with
 * MD / TVD / TVDSS in the display unit, the curve inventory with each
 * curve's origin, and the published zones. Text is Latin-1 (jsPDF standard
 * fonts): a non-Latin-1 well name prints with ASCII swaps, never garbage.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildWellSheet, latin1 } from '../services/wellSheet';

const WELL = {
  id: 'w1', name: 'OKAN PX–4 “deep”', uwi: '00-1234-5678', status: 'oil', organization_id: null,
  surface_x: 286131.31, surface_y: 165839.51, crs: 'EPSG:26391', xy_unit: 'm',
  crs_provenance: { datum_transform: 'EPSG:1168' }, kb_m: 30.48, td_md_m: 3048,
  deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 20, azi: 45 }, { md: 3048, inc: 30, azi: 60 }],
  checkshots: [{ tvdss_m: 274.32, twt_ms: 600, md_m: 304.8 }, { tvdss_m: 579.12, twt_ms: 1000, md_m: 609.6 }],
  checkshots_provenance: { units_in: { depth_ref: 'md', time: 'owt', depth_unit: 'ft' } },
};
const LOGS = [
  { id: 'l1', mnemonic: 'DEPT', unit: 'M', start_md_m: 1524, stop_md_m: 2438.4, step_m: 0.1524, n_samples: 6001, null_count: 0, source_file: 'run1.las', provenance: {} },
  { id: 'l2', mnemonic: 'GR', unit: 'GAPI', start_md_m: 1524, stop_md_m: 2438.4, step_m: 0.1524, n_samples: 6001, null_count: 12, source_file: 'run1.las', provenance: {} },
  { id: 'l3', mnemonic: 'PHIE', unit: 'V/V', start_md_m: 1524, stop_md_m: 2438.4, step_m: 0.1524, n_samples: 6001, null_count: 40, source_file: null, provenance: { computed: true, engine: 'petrophysics-studio' } },
];
const TOPS = [{ id: 't1', name: 'Top Agbada', md_m: 1828.8, surface_type: 'formation_top', interpreter: 'ama' }];
const ZONES = [{ id: 'z1', name: 'Agbada', top_md_m: 1828.8, base_md_m: 1981.2, properties: { net_m: 30.48, ntg: 0.2, phi_avg: 0.2213, sw_avg: 0.35, published_at: '2026-09-20T10:00:00Z', interpretation_name: 'Base' } }];

function pdfText(doc) {
  const f = path.join(os.tmpdir(), `wdm-sheet-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try {
    return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'latin1' });
  } finally {
    fs.unlinkSync(f);
  }
}

test('latin1 swaps typography and never passes a character jsPDF cannot draw', () => {
  expect(latin1('A–B “q” † ≤ 5 °')).toBe('A-B "q" + <= 5 °');
  expect(latin1('井')).toBe('?');
});

test('the sheet in feet carries the reviewer header, tops, inventory and zones (read back with pdftotext)', async () => {
  const { doc, fileName } = await buildWellSheet({
    well: WELL, logs: LOGS, tops: TOPS, zones: ZONES, unit: 'ft', analyst: 'A. Asaolu', now: new Date('2026-09-28T09:00:00Z'),
  });
  expect(fileName).toBe('OKAN_PX-4_deep_data_sheet.pdf');
  const text = pdfText(doc).replace(/[ \t]+/g, ' ');
  // header fields (PL7)
  expect(text).toContain('Petrolord Suite - Well Data Manager');
  expect(text).toContain('Well OKAN PX-4 "deep"');
  expect(text).toContain('UWI 00-1234-5678');
  expect(text).toContain('Status Oil');
  expect(text).toMatch(/Coordinate system Minna \/ Nigeria West Belt \(EPSG:26391\)/);
  expect(text).toContain('Surface X, Y 286131.31, 165839.51 m');
  expect(text).toMatch(/Datum transformation .*\(EPSG:1168\), site choice/);
  expect(text).toContain('Depth unit feet (the registry stores metres)');
  expect(text).toContain('Vertical datum mean sea level (assumed; not stored per well)');
  expect(text).toContain('KB 100.00 ft above datum');
  expect(text).toContain('TD 10000.0 ft MD');
  expect(text).toContain('Deviation survey 3 stations, grid azimuths, minimum curvature');
  expect(text).toContain('Checkshots 2 pairs, entered as MD ft / OWT');
  expect(text).toContain('Prepared by A. Asaolu');
  expect(text).toContain('Prepared on 2026-09-28');
  expect(text).toMatch(/Software Petrolord Suite/);
  // three headline numbers: a top in MD, its TVD below the survey, a zone net
  expect(text).toMatch(/Top Agbada 6000\.0 \d{4}\.\d \d{4}\.\d formation top ama/);
  expect(text).toMatch(/Agbada 6000\.0 6500\.0 100\.00 0\.20 0\.221 0\.350 2026-09-20 Base/);
  expect(text).toMatch(/PHIE V\/V 5000\.0 8000\.0 0\.5000 6001 40 computed/);
  expect(text).toMatch(/GR GAPI 5000\.0 8000\.0 0\.5000 6001 12 measured run1\.las/);
  expect(text).toContain('Page 1 of');
  // no em or en dashes survive into the PDF text
  expect(text).not.toMatch(/[–—]/);
});

test('a bare well prints n/a and says what is missing, in metres', async () => {
  const { doc } = await buildWellSheet({ well: { id: 'b', name: 'BARE-1', kb_m: 0, surface_x: 1, surface_y: 2, deviation: [] }, unit: 'm' });
  const text = pdfText(doc).replace(/[ \t]+/g, ' ');
  expect(text).toContain('KB not set (TVDSS equals TVD)');
  expect(text).toContain('Deviation survey none (treated as vertical)');
  expect(text).toContain('Coordinate system not assigned');
  expect(text).toContain('No tops on this well.');
  expect(text).toContain('Prepared by n/a');
  expect(text).toMatch(/QC flags .*KB not set/);
});
