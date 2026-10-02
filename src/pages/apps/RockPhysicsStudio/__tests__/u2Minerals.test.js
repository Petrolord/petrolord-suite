/**
 * RP-U2-009 (2026-10-01): K_min per sample from the mineral fractions
 * Petrophysics Studio's mineral model publishes on the well. The fractions
 * are bulk volumes, so the solid's shares are V_i over their sum; K_min is
 * the engine's Voigt-Reuss-Hill mix of those shares. Negative control: the
 * clay-free quartz table gives a different modulus and a different
 * substituted velocity in the calcite interval.
 */
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel, zoneIndices } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK, substituteZone, makeSampler } from '../services/scenario';
import { mineralModelLogs, buildMineralSet, kminFromFractions, mineralModuli, EXTRA_MINERALS } from '../services/petroInputs';
import { reportHeader } from '../services/substitutionCsv';
import { preparePublishLogs } from '../services/publish';
import { MINERALS, mixMinerals } from '../engine/minerals';

async function load() {
  const backend = makeInMemoryBackend({ minerals: true });
  const well = (await backend.listWells()).find((w) => w.name === 'MINERAL RP-8 (Petrophysics mineral model)');
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  const entries = [];
  for (const { key, log } of mineralModelLogs(logs)) entries.push({ key, data: await backend.downloadCurve(log) });
  const minerals = buildMineralSet(entries);
  return { well, logs, model: buildModel(curves, mapped, { minerals }), zones: await backend.listZones(well.id) };
}
const rock = { ...DEFAULT_ROCK, mineralsFromPetro: true };

test('the published fractions are found by provenance and read as shares of the solid', async () => {
  const { logs, model } = await load();
  expect(mineralModelLogs(logs).map((m) => m.key).sort()).toEqual(['calcite', 'dolomite', 'quartz']);
  expect(model.minerals.keys.sort()).toEqual(['calcite', 'dolomite', 'quartz']);
  expect(model.minerals.unknown).toEqual([]);
  const at = (d) => model.depth.indexOf(d);
  // pure calcite, pure quartz: the mineral's own modulus (the porosity is not part of the solid)
  expect(kminFromFractions(model.minerals, at(2105))).toBeCloseTo(MINERALS.calcite.k, 0);
  expect(kminFromFractions(model.minerals, at(2095))).toBeCloseTo(MINERALS.quartz.k, 0);
  // half quartz, half dolomite: the engine's Voigt-Reuss-Hill mix
  const mix = mixMinerals([{ name: 'quartz', frac: 0.5 }, { name: 'dolomite', frac: 0.5 }]).k;
  expect(kminFromFractions(model.minerals, at(2115))).toBeCloseTo(mix, 0);
  // negative control: reading the bulk fractions as they stand (0.425 + 0.425, not summing to one) is refused by the engine
  expect(() => mixMinerals([{ name: 'quartz', frac: 0.425 }, { name: 'dolomite', frac: 0.425 }])).toThrow(/sum to 1/);
  // no fractions at a sample: no modulus from the model
  expect(kminFromFractions(model.minerals, at(2125))).toBeNaN();
  // curves that are not the mineral model are not picked up
  expect(mineralModelLogs([{ mnemonic: 'V_QUARTZ', provenance: { computed: true, engine: 'other', operation: 'mineral-model' } }, { mnemonic: 'V_QUARTZ_CUM', provenance: { computed: true, engine: 'petrophysics-studio', operation: 'mineral-model' } }, { mnemonic: 'VSH', provenance: { computed: true, engine: 'petrophysics-studio' } }])).toEqual([]);
});

test('the zone substitution uses the mineral model per sample, counts the samples that fell back, and says so', async () => {
  const { well, model, zones } = await load();
  const zone = zones[0];
  const idx = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  const sub = substituteZone(model, idx, DEFAULT_SCENARIO, rock);
  expect(sub.kminSource).toBe('petro-minerals');
  expect(sub.mineralKeys.sort()).toEqual(['calcite', 'dolomite', 'quartz']);
  expect(sub.kminMin).toBeCloseTo(MINERALS.quartz.k, 0);
  expect(sub.kminMax).toBeCloseTo(MINERALS.calcite.k, 0);
  expect(sub.mineralFallback).toBe(20); // 2120 to 2129.5 m have no fractions
  expect(sub.done).toBe(idx.length);
  // negative control: the quartz table everywhere gives another velocity in the calcite interval
  const table = substituteZone(model, idx, DEFAULT_SCENARIO, DEFAULT_ROCK);
  const i = model.depth.indexOf(2105);
  expect(table.kminSource).toBe('table');
  expect(Math.abs(sub.vp[i] - table.vp[i])).toBeGreaterThan(20);
  // where the model is quartz the two agree exactly
  const q = model.depth.indexOf(2096);
  expect(sub.vp[q]).toBe(table.vp[q]);
  // the override still wins
  expect(makeSampler(model, DEFAULT_SCENARIO, { ...rock, kminOverrideGPa: '40' }).kminSource).toBe('override');
  // header and provenance (PL4, PL7)
  const header = reportHeader({ well, zone, model, sub, indices: idx, scenario: DEFAULT_SCENARIO, rock, units: { velocity: 'm/s', density: 'kg/m3', depth: 'm' } });
  expect(header.find(([k]) => k === 'Mineral modulus')[1]).toMatch(/^36\.600 to 76\.800 GPa \(Petrophysics mineral model per sample: .*; Voigt-Reuss-Hill; 20 samples without fractions used the mineral table\)/);
  const logs = preparePublishLogs(model, sub, idx, zone, { scenario: DEFAULT_SCENARIO, rock, kmin: sub.kmin });
  expect(logs[0].provenance.kmin_source).toBe('petro-minerals');
  expect(logs[0].provenance.kmin_minerals.sort()).toEqual(['calcite', 'dolomite', 'quartz']);
});

test('hostile models: an unknown mineral disables the source; anhydrite and halite have handbook moduli; a wrong-length set is dropped', async () => {
  const n = 5;
  const fill = (v) => Array.from({ length: n }, () => v);
  const withPyrite = buildMineralSet([{ key: 'quartz', data: fill(0.5) }, { key: 'pyrite', data: fill(0.3) }]);
  expect(withPyrite.unknown).toEqual(['pyrite']);
  expect(kminFromFractions(withPyrite, 0)).toBeNaN(); // a share cannot be left out without changing the answer
  const model = { n, depth: [0, 1, 2, 3, 4], vp: fill(4000), vs: fill(2300), rho: fill(2400), phi: fill(0.15), vsh: fill(0), minerals: withPyrite };
  expect(makeSampler(model, DEFAULT_SCENARIO, rock).kminSource).toBe('table');
  expect(mineralModuli('anhydrite')).toBe(EXTRA_MINERALS.anhydrite);
  expect(mineralModuli('halite').k).toBe(24.8e9);
  expect(mineralModuli('constructor')).toBeNull();
  const evap = buildMineralSet([{ key: 'anhydrite', data: fill(0.9) }, { key: 'halite', data: [0.1, -0.5, NaN, 0, 0.1] }]);
  expect(kminFromFractions(evap, 0)).toBeGreaterThan(24.8e9);
  expect(kminFromFractions(evap, 0)).toBeLessThan(56.1e9);
  expect(kminFromFractions(evap, 1)).toBeNaN(); // a clearly negative fraction
  expect(kminFromFractions(evap, 2)).toBeNaN();
  expect(kminFromFractions(evap, 3)).toBeCloseTo(56.1e9, 0);
  expect(kminFromFractions(null, 0)).toBeNaN();
  // a fraction set on another depth grid is not attached to the model
  const { model: real } = await load();
  const wrong = buildMineralSet([{ key: 'quartz', data: fill(1) }]);
  expect(buildModel({ DEPT: real.depth, DT: real.vp.map((v) => 1e6 / v), RHOB: real.rho.map((r) => r / 1000) }, { DEPT: { mnemonic: 'DEPT', unit: 'M' }, DT: { mnemonic: 'DT', unit: 'US/M' }, RHOB: { mnemonic: 'RHOB', unit: 'G/C3' } }, { minerals: wrong }).minerals).toBeNull();
});
