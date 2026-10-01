/**
 * RP-U2-016 (2026-10-01): patchy saturation. The option mixes brine and
 * hydrocarbon with the Voigt (arithmetic) average of their moduli, the
 * stiff bound; Wood (Reuss) is the soft bound. Validated against the
 * bounds: the mixed modulus IS the Voigt bound, it meets Wood at the end
 * members, and the exact patchy rock (Hill's average of the P-wave moduli
 * of the brine-filled and gas-filled rock, computed through the engines'
 * Gassmann) lies between the Wood rock and the Voigt-fluid rock at every
 * saturation.
 */
import {
  DEFAULT_SCENARIO, DEFAULT_ROCK, sideFluid, substituteZone, mixingOf, FLUID_MIXING,
} from '../services/scenario';
import { reportHeader } from '../services/substitutionCsv';
import { preparePublishLogs } from '../services/publish';
import { brine, gas, woodMix, voigtMix } from '../engine/fluids';
import { ksat, kdry } from '../engine/gassmann';
import { buildModel, zoneIndices } from '../services/prep';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs } from '../services/prep';

const c = DEFAULT_SCENARIO.conditions;
const br = brine(c.tC, c.pMPa, c.salinity);
const g = gas(c.tC, c.pMPa, 0.6);

test('the patchy fluid is the Voigt bound, above Wood, and equal to it at the end members', () => {
  for (const sw of [0.1, 0.5, 0.9]) {
    const side = { sw, hc: { kind: 'gas', gravity: 0.6 } };
    const patchy = sideFluid(c, side, 'voigt');
    const uniform = sideFluid(c, side, 'wood');
    expect(patchy.k).toBeCloseTo(sw * br.k + (1 - sw) * g.k, 3);            // the Voigt bound itself
    expect(patchy.k).toBeCloseTo(voigtMix([{ ...br, sat: sw }, { ...g, sat: 1 - sw }]).k, 6);
    expect(uniform.k).toBeCloseTo(woodMix([{ ...br, sat: sw }, { ...g, sat: 1 - sw }]).k, 6);
    expect(patchy.k).toBeGreaterThan(uniform.k * 1.5);
    expect(patchy.rho).toBeCloseTo(uniform.rho, 9);                        // density does not depend on the mixing law
    expect(patchy.label).toBe(`gas (Sw ${sw}, patchy)`);
  }
  for (const sw of [0, 1]) {
    const side = { sw, hc: { kind: 'gas', gravity: 0.6 } };
    expect(sideFluid(c, side, 'voigt').k).toBe(sideFluid(c, side, 'wood').k);
  }
  // 10 percent gas: a uniform mix has lost most of the brine's stiffness, a patchy one almost none
  const side = { sw: 0.9, hc: { kind: 'gas', gravity: 0.6 } };
  expect(sideFluid(c, side, 'wood').k / br.k).toBeLessThan(0.25);
  expect(sideFluid(c, side, 'voigt').k / br.k).toBeGreaterThan(0.85);
  expect(mixingOf({})).toBe('wood');
  expect(mixingOf({ mixing: 'voigt' })).toBe('voigt');
  expect(mixingOf({ mixing: 'bogus' })).toBe('wood');
  expect(FLUID_MIXING.map((m) => m.key)).toEqual(['wood', 'voigt']);
});

test('against the bounds: the exact patchy rock (Hill) lies between the Wood rock and the Voigt-fluid rock', () => {
  const kmin = 37e9; const phi = 0.25; const mu = 2250 * 1800 ** 2;
  const kd = kdry(2250 * 3200 ** 2 - (4 * mu) / 3, kmin, br.k, phi);
  const M = (kfl) => ksat(kd, kmin, kfl, phi) + (4 * mu) / 3;
  for (const sw of [0.05, 0.2, 0.5, 0.8, 0.95]) {
    const phases = [{ ...br, sat: sw }, { ...g, sat: 1 - sw }];
    const mWood = M(woodMix(phases).k);
    const mVoigt = M(voigtMix(phases).k);
    const mHill = 1 / (sw / M(br.k) + (1 - sw) / M(g.k)); // patches of fully brine and fully gas rock
    expect(mWood).toBeLessThan(mHill);
    expect(mHill).toBeLessThan(mVoigt);
  }
  // negative control: a mix above the Voigt bound (the stiffer phase alone) breaks the ordering
  const sw = 0.5;
  expect(M(br.k)).toBeGreaterThan(M(voigtMix([{ ...br, sat: sw }, { ...g, sat: 1 - sw }]).k));
});

test('the zone substitution, the header and the provenance follow the choice', async () => {
  const backend = makeInMemoryBackend();
  const well = (await backend.listWells())[0];
  const mapped = mapLogs(await backend.listLogs(well.id));
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  const model = buildModel(curves, mapped);
  const zone = (await backend.listZones(well.id))[0];
  const idx = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
  const half = { ...DEFAULT_SCENARIO, fluidB: { sw: 0.5, hc: { kind: 'gas', gravity: 0.6 } } };
  const uniform = substituteZone(model, idx, half, rock);
  const patchy = substituteZone(model, idx, { ...half, mixing: 'voigt' }, rock);
  const i = idx[0];
  expect(uniform.mixing).toBe('wood');
  expect(patchy.mixing).toBe('voigt');
  expect(patchy.vp[i]).toBeGreaterThan(uniform.vp[i] + 100);   // half gas in patches is a much stiffer rock
  expect(patchy.rho[i]).toBeCloseTo(uniform.rho[i], 9);
  expect(patchy.vs[i]).toBeCloseTo(uniform.vs[i], 9);          // the shear modulus does not see the fluid
  // all gas (the default fluid B): the two laws agree exactly
  expect(substituteZone(model, idx, { ...DEFAULT_SCENARIO, mixing: 'voigt' }, rock).vp[i]).toBe(substituteZone(model, idx, DEFAULT_SCENARIO, rock).vp[i]);
  const args = { well, zone, model, indices: idx, rock, units: { velocity: 'm/s', density: 'kg/m3', depth: 'm' } };
  expect(reportHeader({ ...args, sub: patchy, scenario: { ...half, mixing: 'voigt' } }).find(([k]) => k === 'Fluid mixing')[1]).toMatch(/^patchy saturation at its stiff bound: Voigt/);
  expect(reportHeader({ ...args, sub: uniform, scenario: half }).find(([k]) => k === 'Fluid mixing')[1]).toMatch(/^uniform saturation: Wood/);
  expect(preparePublishLogs(model, patchy, idx, zone, { scenario: { ...half, mixing: 'voigt' }, rock, kmin: patchy.kmin })[0].provenance.fluid_mixing).toBe('voigt');
});
