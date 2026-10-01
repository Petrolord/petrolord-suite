/**
 * PP-U1-006 / 007: Geomechanics (and Perforation & Sand Control, which
 * shares the picker) read Pore Pressure Studio's curves of any pp-1.x
 * release by their declared unit, and the UCS correlation's DT is put on
 * the published grid.
 */
import {
  pickPublishedPpfg, publishedToBase, alignToGrid, logGrid,
} from '../services/prepGm';
import { assembleBaseProfile, runMem } from '../services/gmRun';
import { publishedToCurves } from '../../PerforationSandControl/services/prepPs';

const prov = (v) => ({ computed: true, engine: 'pore-pressure-studio', pipeline_version: v });
const row = (mnemonic, unit, v, start = 130, n = 5) => ({ id: `${mnemonic}-${v}`, mnemonic, unit, start_md_m: start, step_m: 10, n_samples: n, provenance: prov(v) });

test('pp-1.1.0 curves are found (the old picker only knew pp-1.0.0)', () => {
  const picked = pickPublishedPpfg([row('PP', 'MPA', 'pp-1.1.0'), row('OBG', 'MPA', 'pp-1.1.0'), row('PP', 'MPA', 'pp-2.0.0')]);
  expect(picked.PP.id).toBe('PP-pp-1.1.0');
  expect(picked.OBG).toBeTruthy();
});

test('values convert by the declared unit, never an assumed MPa', () => {
  const base = publishedToBase({
    ppLog: row('PP', 'kPa', 'pp-1.1.0'), obgLog: row('OBG', 'MPA', 'pp-1.1.0'),
    ppData: [10000, 11000, 12000, 13000, 14000], obgData: [20, 21, 22, 23, 24],
  });
  expect(base.ppPa[0]).toBeCloseTo(10e6, 3); // negative control: x1e6 read 10000 kPa as 1e10 Pa
  expect(base.obgPa[4]).toBeCloseTo(24e6, 3);
  expect(() => publishedToBase({ ppLog: row('PP', 'API', 'pp-1.1.0'), obgLog: row('OBG', 'MPA', 'pp-1.1.0'), ppData: [1, 1, 1, 1, 1], obgData: [1, 1, 1, 1, 1] }))
    .toThrow(/not a pressure/);
  expect(() => publishedToBase({ ppLog: row('PP', 'PPG', 'pp-1.1.0'), obgLog: row('OBG', 'MPA', 'pp-1.1.0'), ppData: [9, 9, 9, 9, 9], obgData: [1, 1, 1, 1, 1] }))
    .toThrow(/mud weight/);
});

test('Perforation & Sand Control converts the same way', () => {
  const gmRow = (m) => ({ ...row(m, 'MPA', 'gm-1.0.0'), provenance: { pipeline_version: 'gm-1.0.0' } });
  const out = publishedToCurves({
    gm: { SHMIN: gmRow('SHMIN'), SHMAX: gmRow('SHMAX'), UCS: gmRow('UCS') },
    ppfg: { PP: row('PP', 'psi', 'pp-1.1.0'), OBG: row('OBG', 'MPA', 'pp-1.1.0') },
    data: { SHMIN: [1, 1, 1, 1, 1], SHMAX: [1, 1, 1, 1, 1], UCS: [1, 1, 1, 1, 1], PP: [1000, 1000, 1000, 1000, 1000], OBG: [2, 2, 2, 2, 2] },
  });
  expect(out.curves.ppPa[0]).toBeCloseTo(6894757.29, 1);
});

test('DT on its own grid is aligned to the published grid, so the UCS correlation runs', () => {
  const ppLog = row('PP', 'MPA', 'pp-1.1.0', 130, 30);
  const obgLog = row('OBG', 'MPA', 'pp-1.1.0', 130, 30);
  const tvd = logGrid(ppLog);
  const published = publishedToBase({
    ppLog, obgLog, ppData: tvd.map((z) => (1030 * 9.80665 * z) / 1e6), obgData: tvd.map((z) => (2200 * 9.80665 * z) / 1e6),
  });
  const depthM = []; const dt = [];
  for (let m = 0; m <= 500; m += 5) { depthM.push(m); dt.push(500 - 0.2 * m); }
  const params = { ucs: { correlation: 'horsrud' } };
  // negative control: without alignment the run refuses (lengths differ)
  expect(() => runMem({ base: assembleBaseProfile({ source: { ppSource: 'published' }, published }), dtUsPerM: dt, params })).toThrow(/aligned/);
  published.dtAligned = alignToGrid(depthM, dt, published.tvdM);
  const base = assembleBaseProfile({ source: { ppSource: 'published' }, published });
  const mem = runMem({ base, dtUsPerM: null, params });
  expect(mem.profile.ucsPa).toHaveLength(30);
  expect(base.dtAligned[0]).toBeCloseTo(500 - 0.2 * 130, 9);
  expect(alignToGrid([0, 10], [1, 2], [20])).toEqual([null]);
});
