import { volumesCsv } from '../services/volumesCsv';
import { M3_PER_ACRE_FT } from '../services/units';

const built = {
  spec: { nx: 10, ny: 5, dx: 50, dy: 50 }, crs: 'EPSG:32631', boundary: { name: 'Lease' },
  zones: [{
    name: 'Zone A', registryZone: 'A',
    volumes: { total: { cells: 50, bulk_m3: 2e6, net_m3: 1e6, pore_m3: 2e5, hcpv_m3: 1.5e5 }, 1: { cells: 20, bulk_m3: 8e5, net_m3: 4e5, pore_m3: 8e4, hcpv_m3: 6e4 }, 0: { cells: 30, bulk_m3: 1.2e6, net_m3: 6e5, pore_m3: 1.2e5, hcpv_m3: 9e4 } },
    provenance: { phi: [{ block: 0, methodUsed: 'okrige', wells: 4, fellBack: false, variogram: { model: 'spherical', range: 900, sill: 0.0025, fitted: true } }] },
  }],
};

test('metric CSV carries the frame, units, rows in block order with TOTAL last, and provenance', () => {
  const { text, fileName } = volumesCsv(built, { name: 'Keta framework', volumeUnits: 'metric' });
  expect(fileName).toBe('Keta_framework-volumes-metric.csv');
  const lines = text.trim().split('\n');
  expect(lines[1]).toBe('# frame 10 x 5 at 50 x 50 m, clipped to Lease, CRS EPSG:32631');
  // U1: field, analyst, date and build, the depth reference and the zone fluids ride before the table
  const h = lines.findIndex((l) => l.startsWith('zone,'));
  expect(lines[h]).toBe('zone,registry_zone,block,cells,bulk (10^6 m3),net (10^6 m3),pore (10^6 m3),hcpv (10^6 m3)');
  expect(lines[h + 1]).toBe('Zone A,A,Block 0,30,1.2000,0.6000,0.1200,0.0900');
  expect(lines[h + 3]).toBe('Zone A,A,TOTAL,50,2.0000,1.0000,0.2000,0.1500');
  expect(text).toContain('# Zone A phi: block 0: ordinary kriging from 4 wells, spherical variogram (range 900 m, sill 0.0025, fitted)');
});

test('field CSV converts rock and pore columns differently', () => {
  const { text } = volumesCsv(built, { volumeUnits: 'field' });
  const total = text.split('\n').find((l) => l.includes('TOTAL')).split(',');
  expect(Number(total[4])).toBeCloseTo(2e6 / M3_PER_ACRE_FT, 3);
  expect(Number(total[6])).toBeCloseTo(2e5 / 0.158987294928 / 1e6, 3);
  expect(() => volumesCsv({ zones: [] })).toThrow(/Build the model first/);
});

test('EM-U1-011: the header a reviewer signs is read back (before: frame and units only)', () => {
  const b = { ...built, xyUnit: 'm', zones: [{ ...built.zones[0], fluids: { goc: null, owc: 1600, bo: 1.25, bg: null }, openEdge: { open: true, nodes: 12 } }], notes: ['TopA has no CRS or XY unit; map units read as metres.'] };
  const { text } = volumesCsv(b, { name: 'Keta', report: { field: 'Keta', analyst: 'A. Geologist' }, now: new Date('2026-09-30T10:00:00Z'), build: 'Petrolord Suite 4.0.0 (abc)' });
  expect(text).toContain('# field Keta; analyst A. Geologist; date 2026-09-30; Petrolord Suite 4.0.0 (abc)');
  expect(text).toContain('# depth TVDSS in metres below mean sea level, positive down; XY unit m');
  expect(text).toContain('# Zone A fluids: no GOC, OWC 1600.0 m, Bo 1.25 rb/stb, OPEN: the hydrocarbon leg reaches the model edge at 12 nodes');
  expect(text).toContain('# note: TopA has no CRS');
  expect(/[^\n\x20-\x7e\xa0-\xff]/.test(text)).toBe(false);
});
