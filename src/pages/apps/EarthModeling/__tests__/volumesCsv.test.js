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
  expect(lines[3]).toBe('zone,registry_zone,block,cells,bulk (10^6 m3),net (10^6 m3),pore (10^6 m3),hcpv (10^6 m3)');
  expect(lines[4]).toBe('Zone A,A,Block 0,30,1.2000,0.6000,0.1200,0.0900');
  expect(lines[6]).toBe('Zone A,A,TOTAL,50,2.0000,1.0000,0.2000,0.1500');
  expect(text).toContain('# Zone A phi: block 0 okrige(4w) spherical r900 s0.0025 fitted');
});

test('field CSV converts rock and pore columns differently', () => {
  const { text } = volumesCsv(built, { volumeUnits: 'field' });
  const total = text.split('\n').find((l) => l.includes('TOTAL')).split(',');
  expect(Number(total[4])).toBeCloseTo(2e6 / M3_PER_ACRE_FT, 3);
  expect(Number(total[6])).toBeCloseTo(2e5 / 0.158987294928 / 1e6, 3);
  expect(() => volumesCsv({ zones: [] })).toThrow(/Build the model first/);
});
