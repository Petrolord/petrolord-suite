/**
 * P4 acceptance — the seismic velocity-trend source and the publish
 * path. Velocity sampling is closed-form checkable (V(z) = v0 + k·z
 * below the datum); publish preparation is pinned to the Petrophysics
 * provenance shape and the overwrite-own contract is proven on the
 * in-memory backend (publish twice — the registry must hold ONE set
 * of this project's curves, and foreign curves stay).
 */

import { pseudoSonicFromLinearVelocity, isLinearVelocityModel } from '../engine/velocitySource';
import { computeProfile } from '../engine/profile';
import { preparePublishLogs, staleOwnCurves, PIPELINE_VERSION } from '../services/publish';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const close = (a, b, tol = 1e-12) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const PARAMS = {
  waterDepthM: 100,
  rhoSeawaterKgM3: 1025,
  rhoFluidKgM3: 1030,
  mudlineMdM: 0,
  nct: { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 },
  method: 'eaton',
  eatonN: 3,
  nu: 0.4,
};

describe('velocity trend source', () => {
  test('samples V(z) = v0 + k·(offset + z) exactly', () => {
    const { zBmlM, dtUsPerM, rhoKgM3 } = pseudoSonicFromLinearVelocity(
      { v0: 2000, k: 0.6 }, { datumToMudlineM: 100, zMaxM: 3000, stepM: 10 },
    );
    expect(zBmlM.length).toBe(301);
    expect(rhoKgM3).toBeNull();
    for (const z of [0, 1000, 3000]) {
      const i = zBmlM.indexOf(z);
      expect(close(dtUsPerM[i], 1e6 / (2000 + 0.6 * (100 + z)))).toBe(true);
    }
  });

  test('k = 0 is a constant-velocity trend', () => {
    const { dtUsPerM } = pseudoSonicFromLinearVelocity(
      { v0: 2500, k: 0 }, { datumToMudlineM: 0, zMaxM: 100, stepM: 50 },
    );
    expect(dtUsPerM.every((dt) => dt === 1e6 / 2500)).toBe(true);
  });

  test('feeds the profile engine end-to-end with Gardner densities', () => {
    const input = pseudoSonicFromLinearVelocity(
      { v0: 2000, k: 0.6 }, { datumToMudlineM: 100, zMaxM: 3000, stepM: 10 },
    );
    const r = computeProfile({ ...input, params: PARAMS });
    expect(r.rhoSource.every((s) => s === 'gardner')).toBe(true);
    // trend velocity above the NCT is a normally-to-under-pressured
    // smooth profile — must stay finite with S monotone
    for (let i = 1; i < input.zBmlM.length; i++) {
      expect(Number.isFinite(r.porePressurePa[i])).toBe(true);
      expect(r.overburdenPa[i]).toBeGreaterThan(r.overburdenPa[i - 1]);
    }
  });

  test('rejects layer-cake and unphysical models', () => {
    expect(isLinearVelocityModel({ type: 'layercake', layers: [] })).toBe(false);
    expect(isLinearVelocityModel({ v0: 2000, k: 0.6 })).toBe(true);
    expect(() => pseudoSonicFromLinearVelocity(
      { v0: 1000, k: -1 }, { datumToMudlineM: 0, zMaxM: 2000, stepM: 10 },
    )).toThrow(/non-positive/);
  });
});

describe('publish', () => {
  const input = { zBmlM: [0, 10, 20] };
  const result = {
    porePressurePa: [1e6, 2e6, 3e6],
    fracPressurePa: [1.5e6, 2.5e6, 3.5e6],
    overburdenPa: [2e6, 4e6, 6e6],
  };

  test('prepares PP/FP/OBG in MPa with full provenance', () => {
    const logs = preparePublishLogs(input, result, { ...PARAMS, mudlineMdM: 50 },
      { projectId: 'proj-1', inputLogIds: ['a', 'b'] });
    expect(logs.map((l) => l.mnemonic)).toEqual(['PP', 'FP', 'OBG']);
    const pp = logs[0];
    expect(pp.unit).toBe('MPA');
    expect(Array.from(pp.data)).toEqual([1, 2, 3]);
    expect(pp.startMdM).toBe(50);
    expect(pp.stopMdM).toBe(70);
    expect(pp.stepM).toBe(10);
    expect(pp.provenance).toMatchObject({
      computed: true,
      engine: 'pore-pressure-studio',
      pipeline_version: PIPELINE_VERSION,
      project_id: 'proj-1',
      input_log_ids: ['a', 'b'],
    });
  });

  test('overwrite-own: republish replaces only this project\'s curves', async () => {
    const backend = makeInMemoryBackend();
    const [well] = await backend.listWells();
    const before = await backend.listLogs(well.id);

    const prepared = () => preparePublishLogs(input, result, PARAMS,
      { projectId: 'proj-1', inputLogIds: [] });
    await backend.publishCurves(well.id, prepared(), 'proj-1');
    await backend.publishCurves(well.id, prepared(), 'proj-1');

    const after = await backend.listLogs(well.id);
    expect(after.length).toBe(before.length + 3); // ONE set, not two
    const mine = after.filter((l) => l.provenance?.engine === 'pore-pressure-studio');
    expect(mine.length).toBe(3);
    // imported curves untouched
    expect(after.filter((l) => !l.provenance?.computed).length).toBe(before.length);
    // a different project's curves are not stale
    expect(staleOwnCurves(after, prepared(), 'proj-2').length).toBe(0);
  });
});
