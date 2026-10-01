/**
 * RP-U2-011 (2026-10-01): pore pressure from Pore Pressure Studio and Sw
 * from a saturation-height function as scenario inputs.
 *
 * Pore pressure: the PP curve Pore Pressure Studio publishes sits on its
 * own depth grid; its mean over the zone, in MPa whatever unit it was
 * published in, fills the Batzle-Wang pressure, and the header says where
 * the number came from.
 *
 * Saturation-height: fluid B's Sw per sample comes from a SCAL Studio
 * project through Petrophysics Studio's own reader (the same function, the
 * same numbers), so moving the free-water level changes the substituted
 * logs. Negative control: the typed Sw gives another answer.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel, zoneIndices } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK, substituteZone, makeSampler } from '../services/scenario';
import { porePressureLog, zonePorePressure, saturationHeightSw, PP_ENGINE } from '../services/petroInputs';
import { reportHeader } from '../services/substitutionCsv';
import { preparePublishLogs } from '../services/publish';
import { shmFromScalProject, swAtHeight } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';
import { brine, gas, woodMix } from '../engine/fluids';
import { substituteVels } from '../engine/gassmann';
import RockParamsPanel from '../components/RockParamsPanel';

async function load(opts) {
  const backend = makeInMemoryBackend(opts);
  const well = (await backend.listWells())[0];
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { backend, well, logs, model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}
const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
const units = { velocity: 'm/s', density: 'kg/m3', depth: 'm' };

describe('pore pressure from Pore Pressure Studio', () => {
  test('the published PP curve is found, averaged over the zone on its own grid, and named as the source', async () => {
    const { backend, logs, zones } = await load({ pp: true });
    const log = porePressureLog(logs);
    expect(log.provenance.engine).toBe(PP_ENGINE);
    const data = await backend.downloadCurve(log);
    const r = zonePorePressure(log, data, zones[0]);
    // 0.0105 MPa per metre at 2020, 2030 and 2040 m
    expect(r.ok).toBe(true);
    expect(r.n).toBe(3);
    expect(r.mpa).toBeCloseTo(0.0105 * 2030, 9);
    expect(r.source).toBe('Pore Pressure Studio PP (eaton), mean of 3 samples in the zone');
    // negative control: the PP grid is not the log grid; indexing it with the log's samples would read 1900 to 2100 m
    expect(data.length).not.toBe(201);
    // no zone, no values in the zone, no curve
    expect(zonePorePressure(log, data, null).reason).toMatch(/Pick a zone/);
    expect(zonePorePressure(log, data, { top_md_m: 5000, base_md_m: 5010 }).reason).toMatch(/no values inside the zone/);
    expect(porePressureLog((await load()).logs)).toBeNull();
  });

  test('units at the door: psi and kPa convert; a mud weight needs the survey; a non-pressure curve is not taken', () => {
    const zone = { top_md_m: 2000, base_md_m: 2020 };
    const mk = (unit, v) => [{ mnemonic: 'PP', unit, start_md_m: 2000, stop_md_m: 2020, step_m: 10, n_samples: 3 }, [v, v, v]];
    expect(zonePorePressure(...mk('PSI', 3625.94), zone).mpa).toBeCloseTo(25, 3);
    expect(zonePorePressure(...mk('kPa', 25000), zone).mpa).toBeCloseTo(25, 9);
    const ppg = zonePorePressure(...mk('PPG', 10), zone);
    expect(ppg.ok).toBe(false);
    expect(ppg.reason).toMatch(/a mud weight\); it needs the well's survey/);
    // with the TVD below the rotary table: 10 ppg at 2010 m is 23.6 MPa
    const withTvd = zonePorePressure(...mk('PPG', 10), zone, (md) => md);
    expect(withTvd.mpa).toBeCloseTo((10 * 119.82642731689663 * 9.80665 * 2010) / 1e6, 3);
    expect(zonePorePressure({ mnemonic: 'PP', unit: 'GAPI' }, [1], zone).reason).toMatch(/is not a pressure/);
    expect(porePressureLog([{ mnemonic: 'PP', unit: 'GAPI' }])).toBeNull();
    // nulls are skipped; with no step the grid comes from start and stop
    const [log] = mk('MPA', 25);
    expect(zonePorePressure({ ...log, step_m: null }, [25, -999.25, 27], zone).mpa).toBeCloseTo(26, 9);
    // an imported PP curve (no Pore Pressure Studio provenance) is taken second and named as such
    const imported = { mnemonic: 'PP', unit: 'MPA', start_md_m: 2000, stop_md_m: 2020, step_m: 10 };
    expect(porePressureLog([imported, { ...imported, id: 'x', provenance: { engine: PP_ENGINE } }]).id).toBe('x');
    expect(zonePorePressure(imported, [25, 25, 25], zone).source).toBe('PP curve PP (MPA), mean of 3 samples in the zone');
  });

  test('the dock offers the value in the display unit, Apply carries the source, typing over it clears the source', () => {
    const onApply = jest.fn();
    const wellInputs = { pp: { ok: true, mpa: 21.315, source: 'Pore Pressure Studio PP (eaton), mean of 3 samples in the zone' }, scalProjects: [] };
    render(<RockParamsPanel scenario={DEFAULT_SCENARIO} rock={DEFAULT_ROCK} onApply={onApply} units={{ pressure: 'psi', temperature: 'degC', gor: 'm3/m3', depth: 'm' }} wellInputs={wellInputs} />);
    expect(screen.getByTestId('rp-param-pp-use')).toHaveTextContent('Use 3091.48 psi');
    fireEvent.click(screen.getByTestId('rp-param-pp-use'));
    expect(screen.getByTestId('rp-param-pMPa').value).toBe('3091.4794');
    expect(screen.getByTestId('rp-param-pp-note')).toHaveTextContent('From Pore Pressure Studio PP (eaton), mean of 3 samples in the zone.');
    fireEvent.click(screen.getByTestId('rp-apply-params'));
    const applied = onApply.mock.calls[0][0].scenario.conditions;
    expect(applied.pMPa).toBeCloseTo(21.315, 4);
    expect(applied.pSource).toBe('Pore Pressure Studio PP (eaton), mean of 3 samples in the zone');
    // typing another number is the user's number
    fireEvent.change(screen.getByTestId('rp-param-pMPa'), { target: { value: '3000' } });
    fireEvent.click(screen.getByTestId('rp-apply-params'));
    expect(onApply.mock.calls[1][0].scenario.conditions.pSource).toBeUndefined();
    // rock fields the panel does not edit ride through an Apply
    expect(onApply.mock.calls[1][0].rock.iterativeVs).toBe(true);
  });

  test('the source reaches the header and the publish provenance', async () => {
    const { well, model, zones } = await load();
    const scenario = { ...DEFAULT_SCENARIO, conditions: { ...DEFAULT_SCENARIO.conditions, pMPa: 21.315, pSource: 'Pore Pressure Studio PP (eaton), mean of 3 samples in the zone' } };
    const idx = zoneIndices(model.depth, zones[0].top_md_m, zones[0].base_md_m);
    const sub = substituteZone(model, idx, scenario, rock);
    const header = reportHeader({ well, zone: zones[0], model, sub, indices: idx, scenario, rock, units });
    expect(header.find(([k]) => k === 'Conditions')[1]).toMatch(/pore pressure 21\.32 MPa \(Pore Pressure Studio PP \(eaton\), mean of 3 samples in the zone\)/);
    expect(preparePublishLogs(model, sub, idx, zones[0], { scenario, rock, kmin: sub.kmin })[0].provenance.pore_pressure_source).toMatch(/Pore Pressure Studio/);
    // the gas is denser and stiffer at 25 MPa than at 21.3: the number matters
    const at25 = substituteZone(model, idx, DEFAULT_SCENARIO, rock);
    expect(Math.abs(at25.vp[idx[0]] - sub.vp[idx[0]])).toBeGreaterThan(0.5);
  });
});

describe('Sw from saturation-height for fluid B', () => {
  test('Sw per sample is Petrophysics Studio reader on the SCAL project; the substitution uses it sample by sample', async () => {
    const { backend, well, model, zones } = await load();
    const payload = await backend.loadScalProject('scal-sample');
    const r = await saturationHeightSw({ payload, depth: model.depth, well });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Keta SAND J (sample)');
    expect(r.fwlTvdssM).toBeCloseTo(6758.53 * 0.3048, 6);
    // the same numbers as Petrophysics' own function: MD 2030 m is TVDSS 2000 m (KB 30 m), 60 m above the FWL
    const shm = shmFromScalProject(payload);
    const i = model.depth.indexOf(2030);
    const want = swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, (r.fwlTvdssM - 2000) / 0.3048);
    expect(r.data[i]).toBeCloseTo(want, 12);
    expect(want).toBeGreaterThan(0.15);
    expect(want).toBeLessThan(0.6);
    // below the free-water level the rock is wet
    expect(r.data[model.depth.indexOf(2095)]).toBe(1);
    // Sw falls with height: the top of the zone is drier than its base
    const zone = zones[0];
    expect(r.data[model.depth.indexOf(zone.top_md_m)]).toBeLessThan(r.data[model.depth.indexOf(zone.base_md_m)]);

    const withShm = { ...model, swB: r.data, swBInfo: { name: r.name, fwlTvdssM: r.fwlTvdssM } };
    const scenario = { ...DEFAULT_SCENARIO, fluidB: { ...DEFAULT_SCENARIO.fluidB, shm: { on: true, projectId: 'scal-sample', fwlTvdssM: null } } };
    const idx = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
    const sub = substituteZone(withShm, idx, scenario, rock);
    expect(sub.swBFromShm).toBe(true);
    expect(sub.swBFallback).toBe(0);
    expect(sub.labelB).toBe('brine and gas at the saturation-height Sw');
    // one sample by hand through the engines
    const c = scenario.conditions;
    const br = brine(c.tC, c.pMPa, c.salinity);
    const g = gas(c.tC, c.pMPa, 0.6);
    const mix = woodMix([{ ...br, sat: want }, { ...g, sat: 1 - want }]);
    const ref = substituteVels(model.vp[i], model.vs[i], model.rho[i], 37e9, model.phi[i], br, mix);
    expect(sub.vp[i]).toBeCloseTo(ref.vp, 9);
    expect(sub.rho[i]).toBeCloseTo(ref.rho, 9);
    // negative control: the typed Sw (0, all gas) is another rock
    const typed = substituteZone(model, idx, DEFAULT_SCENARIO, rock);
    expect(Math.abs(typed.rho[i] - sub.rho[i])).toBeGreaterThan(20);
    expect(typed.swBFromShm).toBe(false);

    // "what if the contact moved": a free-water level 100 m deeper dries the zone
    const deeper = await saturationHeightSw({ payload, depth: model.depth, well, fwlTvdssM: r.fwlTvdssM + 100 });
    expect(deeper.data[i]).toBeLessThan(r.data[i]);
    // header words (PL4, PL7)
    const header = reportHeader({ well, zone, model: withShm, sub, indices: idx, scenario, rock, units });
    expect(header.find(([k]) => k === 'Fluid B (substitute)')[1]).toMatch(/^brine and gas with Sw from the saturation-height function per sample \(Keta SAND J \(sample\), free-water level 2060\.0 m TVDSS\): Sw 0\.\d{3} to 0\.\d{3}$/);
    expect(preparePublishLogs(withShm, sub, idx, zone, { scenario, rock, kmin: sub.kmin })[0].provenance.sw_b_from_saturation_height).toBe(true);
  });

  test('where the function has no value the typed Sw stands in and is counted; a project with no function is refused with its reason', async () => {
    const { backend, well, model, zones } = await load();
    const payload = await backend.loadScalProject('scal-sample');
    const r = await saturationHeightSw({ payload, depth: model.depth, well });
    const holes = Float64Array.from(r.data);
    const zone = zones[0];
    const idx = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
    for (let k = 0; k < 5; k++) holes[idx[k]] = NaN;
    const scenario = { ...DEFAULT_SCENARIO, fluidB: { ...DEFAULT_SCENARIO.fluidB, sw: 0.3, shm: { on: true, projectId: 'scal-sample' } } };
    const sub = substituteZone({ ...model, swB: holes }, idx, scenario, rock);
    expect(sub.swBFallback).toBe(5);
    expect(makeSampler({ ...model, swB: holes }, scenario, rock).swB(idx[0])).toEqual({ sw: 0.3, fallback: true });
    // switched on with no curve yet (still loading, or refused): the typed Sw, said by swBFromShm false
    expect(substituteZone(model, idx, scenario, rock).swBFromShm).toBe(false);
    const none = await saturationHeightSw({ payload: { name: 'x' }, depth: model.depth, well });
    expect(none).toEqual({ ok: false, reason: 'This SCAL Studio project has no capillary-pressure set-up.' });
    const noFwl = await saturationHeightSw({ payload: { ...payload, height: { ...payload.height, fwl_tvdss: '' } }, depth: model.depth, well });
    expect(noFwl.ok).toBe(false);
    expect(noFwl.reason).toMatch(/No free-water level/);
  });

  test('the dock: project, free-water level in the depth unit, and the status line; Apply carries them', () => {
    const onApply = jest.fn();
    const scenario = { ...DEFAULT_SCENARIO, fluidB: { ...DEFAULT_SCENARIO.fluidB, shm: { on: true, projectId: 'scal-sample', fwlTvdssM: 2060 } } };
    const wellInputs = { scalProjects: [{ id: 'scal-sample', name: 'Keta SAND J (sample)' }], shm: { ok: true, text: 'Keta SAND J (sample): Sw from the height above the free-water level at 6758.5 ft TVDSS, on 201 samples.' } };
    render(<RockParamsPanel scenario={scenario} rock={DEFAULT_ROCK} onApply={onApply} units={{ depth: 'ft' }} wellInputs={wellInputs} />);
    expect(screen.getByTestId('rp-param-fluidB-shm')).toBeChecked();
    expect(screen.getByTestId('rp-param-fluidB-shm-fwl').value).toBe('6758.53');
    expect(screen.getByTestId('rp-param-fluidB-shm-note')).toHaveTextContent('on 201 samples');
    // a deeper contact, typed in feet; a half-typed minus sign is kept as text
    fireEvent.change(screen.getByTestId('rp-param-fluidB-shm-fwl'), { target: { value: '-' } });
    expect(screen.getByTestId('rp-param-fluidB-shm-fwl').value).toBe('-');
    fireEvent.change(screen.getByTestId('rp-param-fluidB-shm-fwl'), { target: { value: '7000' } });
    fireEvent.click(screen.getByTestId('rp-apply-params'));
    const shm = onApply.mock.calls[0][0].scenario.fluidB.shm;
    expect(shm.on).toBe(true);
    expect(shm.projectId).toBe('scal-sample');
    expect(shm.fwlTvdssM).toBeCloseTo(7000 * 0.3048, 6);
    // blank means the project's own level
    fireEvent.change(screen.getByTestId('rp-param-fluidB-shm-fwl'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('rp-apply-params'));
    expect(onApply.mock.calls[1][0].scenario.fluidB.shm.fwlTvdssM).toBeNull();
  });
});
