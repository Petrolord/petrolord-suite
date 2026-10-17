/**
 * From the booked 12.14 MMstb to the 3D grid's 10.31 (3D grid upgrade,
 * 2026-10-17), one change at a time, every number from buildModel on the live
 * Ekene rows (the six-well maps, the Ekene wells with the Middle and Lower
 * tops, the Ekene-1 to -4 logs; OWC 5,036.1 ft, Bo 1.2):
 *   1 booked typed values on the maps' 100 m nodes (ReservoirCalc Pro)  12.14
 *   2 the same on the 25 m x 2.5 ft grid with the traced edge            12.09
 *   3 NTG from the logs (kriged) instead of the booked 0.8
 *   4 porosity by SGS from the logs instead of the booked 0.2
 *   5 Sw from the logs (inverse distance) instead of the booked 0.35
 *   6 the sand split at its two shale breaks, under a 50 ft cap         10.31
 * The STATUS and the report carry the same table.
 */
import fs from 'fs';
import path from 'path';
import { buildModel, emptyDefinition, newModelDefinition } from '../services/modelBuild';
import { M3_PER_BBL } from '../services/units';

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-six-well.json'), 'utf8'));
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-grid.json'), 'utf8'));
const ALL = [...FX.surfaces, ...G.surfaces];
const backend = { downloadSurfaceGrid: async (s) => Float32Array.from(ALL.find((x) => x.id === s.id).grid) };
const surfaces = ALL.map(({ grid, ...s }) => s);
const curves = Object.fromEntries(Object.entries(G.curves).map(([w, c]) => [w, Object.fromEntries(
  Object.entries({ phi: c.PHIE, sw: c.SW, vsh: c.VSH, perm: c.KPERM, facies: c.RP_FACIES, coreK: c.CKH, corePhi: c.CPOR }).filter(([, v]) => v)
    .map(([k, v]) => [k, { start: v.start_md_m, step: v.step_m, values: v.unit === '%' ? v.values.map((x) => (x === null ? NaN : x / 100)) : v.values.map((x) => (x === null ? NaN : x)), unit: v.unit, mnemonic: v.mnemonic }]),
)]));
const booked = { phi: '0.2', sw: '0.35', ntg: '0.8' };
const base = {
  name: 'waterfall', surfaceIds: ['ekene-top', 'ekene-base'], topNames: ['Ekene Sand', 'Ekene Sand Base'],
  fluidsInput: [{ owc: '5036.1', owcUnit: 'ft', bo: '1.2' }], logsResolved: { curves },
};
const zone = (extra = {}) => [{ name: 'Ekene Sand', registryZone: 'Ekene Sand', typed: booked, ...extra }];
const mmstb = (b) => b.zones.reduce((a, z) => a + (z.volumes.total?.stoiip_m3 || 0), 0) / M3_PER_BBL / 1e6;
const STEPS = [
  ['1 booked values, map nodes', { ...emptyDefinition(), ...base, zones: zone(), methods: { phi: 'typed', sw: 'typed', ntg: 'typed' } }],
  ['2 the same on the fine grid', { ...newModelDefinition(), ...base, zones: zone(), methods: { phi: 'typed', sw: 'typed', ntg: 'typed' } }],
  ['3 NTG from the logs', { ...newModelDefinition(), ...base, control: 'logs', zones: zone(), methods: { phi: 'typed', sw: 'typed', ntg: 'okrige' } }],
  ['4 porosity by SGS', { ...newModelDefinition(), ...base, control: 'logs', zones: zone(), methods: { phi: 'sgs', sw: 'typed', ntg: 'okrige' } }],
  ['5 Sw from the logs', { ...newModelDefinition(), ...base, control: 'logs', zones: zone(), methods: { phi: 'sgs', sw: 'idw', ntg: 'okrige' } }],
  ['6 three zones and the cap', { ...newModelDefinition(), ...base, control: 'logs', zones: zone({ splitTops: ['Ekene Sand Middle', 'Ekene Sand Lower'] }), cap: { on: true, thickness: '50', unit: 'ft', name: 'Ogbia Shale cap' }, methods: { phi: 'sgs', sw: 'idw', ntg: 'okrige' } }],
];

test('the waterfall from 12.14 to 10.31 MMstb, step by step', async () => {
  const out = [];
  for (const [label, def] of STEPS) out.push([label, mmstb(await buildModel(def, label.startsWith('1') ? FX.wells.map((w) => ({ ...w, zones: w.zones.map((z) => ({ ...z, properties: { ...z.properties, phi_avg: 0.2, sw_avg: 0.35, net_res_tvt_m: 0.8 * z.properties.gross_tvt_m } })) })) : G.wells, surfaces, backend))]);
  // eslint-disable-next-line no-console
  console.log(out.map(([l, v], i) => `${l}: ${v.toFixed(3)}${i ? ` (${(v - out[i - 1][1] >= 0 ? '+' : '')}${(v - out[i - 1][1]).toFixed(3)})` : ''}`).join('\n'));
  expect(out[0][1].toFixed(2)).toBe('12.14');
  expect(out[1][1].toFixed(2)).toBe('12.09');
  expect(Math.abs(out[1][1] / out[0][1] - 1)).toBeLessThan(0.01);
  expect(out[5][1].toFixed(2)).toBe('10.31');
}, 600000);
