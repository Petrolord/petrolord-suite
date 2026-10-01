/**
 * RP-U1-010 (PL7): the substitution CSV a reviewer can sign. Built from the
 * in-memory backend's oracle well through the shipped services; the header
 * is read back and the rows carry the oracle log-domain golden.
 */
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel, zoneIndices } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK, substituteZone } from '../services/scenario';
import { substitutionCsv, substitutionCsvName } from '../services/substitutionCsv';

async function oracle() {
  const b = makeInMemoryBackend();
  const well = (await b.listWells()).find((w) => w.name === 'KETA RP-1');
  const logs = await b.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, l] of Object.entries(mapped)) if (l) curves[k] = await b.downloadCurve(l);
  const model = buildModel(curves, mapped);
  const zone = (await b.listZones(well.id)).find((z) => z.name === 'BRINE SAND');
  const indices = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
  const sub = substituteZone(model, indices, DEFAULT_SCENARIO, rock);
  return { well, zone, model, indices, sub, rock };
}

const parse = (text) => {
  const lines = text.trim().split('\n');
  const header = Object.fromEntries(lines.filter((l) => l.startsWith('# ')).map((l) => {
    const at = l.indexOf(': ');
    return [l.slice(2, at), l.slice(at + 2)];
  }));
  const rows = lines.filter((l) => !l.startsWith('# '));
  return { header, columns: rows[0].split(','), rows: rows.slice(1).map((r) => r.split(',')) };
};

test('RP-U1-010: the header names what a reviewer signs and the rows carry the golden', async () => {
  const o = await oracle();
  const text = substitutionCsv({
    ...o, scenario: DEFAULT_SCENARIO, units: { velocity: 'm/s', density: 'kg/m3', depth: 'm' },
    reviewer: { field: 'Keta', analyst: 'A. Analyst' }, now: new Date('2026-10-01T12:00:00Z'),
  });
  expect(/^[\x20-\x7E\n]*$/.test(text)).toBe(true);
  const { header, columns, rows } = parse(text);
  expect(header.Field).toBe('Keta');
  expect(header.Analyst).toBe('A. Analyst');
  expect(header.Well).toBe('KETA RP-1');
  expect(header.Zone).toMatch(/BRINE SAND \(MD 2020.0 to 2040.0 m\)/);
  expect(header.Date).toBe('2026-10-01 12:00:00');
  expect(header.Software).toMatch(/^Petrolord Suite/);
  expect(header['Mineral modulus']).toMatch(/^37.000 GPa \(override\)/);
  expect(header.Porosity).toBe('PHIE (effective porosity)');
  expect(header['Fluid A (in situ)']).toMatch(/^100% brine: K /);
  expect(header['Fluid B (substitute)']).toMatch(/^100% gas: K /);
  expect(header.Samples).toBe(`${o.indices.length} in zone; ${o.indices.length} substituted; 0 left in situ (outside the limits); 0 skipped`);
  expect(columns[2]).toBe('Vp B (m/s)');
  expect(rows).toHaveLength(o.indices.length);
  // the oracle log-domain golden: Vp 2905.70, Vs 1890.98, rho 2038.71
  expect(Number(rows[0][2])).toBeCloseTo(2905.7, 1);
  expect(Number(rows[0][4])).toBeCloseTo(1891.0, 1);
  expect(Number(rows[0][6])).toBeCloseTo(2038.7, 1);
  expect(rows[0][14]).toBe('substituted');
  expect(substitutionCsvName(o.well, o.zone)).toBe('rock-physics_KETA_RP-1_BRINE_SAND.csv');
});

test('RP-U1-010: field units convert in the file (negative control: the SI number differs)', async () => {
  const o = await oracle();
  const text = substitutionCsv({ ...o, scenario: DEFAULT_SCENARIO, units: { velocity: 'ft/s', density: 'g/cc', depth: 'ft' } });
  const { columns, rows, header } = parse(text);
  expect(columns[0]).toBe('MD (ft)');
  expect(columns[2]).toBe('Vp B (ft/s)');
  expect(Number(rows[0][2])).toBeCloseTo(2905.70 / 0.3048, 0);
  expect(Number(rows[0][6])).toBeCloseTo(2.0387, 4);
  expect(Number(rows[0][0])).toBeCloseTo(2020 / 0.3048, 1);
  expect(header.Units).toBe('depth ft MD; velocity ft/s; density g/cc; impedance ft/s*g/cc');
  expect(Math.abs(Number(rows[0][2]) - 2905.7)).toBeGreaterThan(1000);
});
