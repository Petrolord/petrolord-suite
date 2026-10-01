/**
 * RP-U2-007 (RP-U1-019), 2026-10-01: wells with no sonic log open on an
 * ESTIMATED Vp, and say so everywhere (PL4). The no-sonic harness well has
 * a known true velocity (Faust with 2100 and a 3 percent wobble; density by
 * Gardner with 0.245), so the published constants are measurably biased,
 * a calibration on the well that has a sonic recovers the constants, and
 * the misfit against the truth is the number the screen prints.
 */
import { makeInMemoryBackend, noSonicTruth, NOSONIC_TRUTH } from '../services/inMemoryBackend';
import { mapLogs, buildModel, zoneIndices, CURVE_ALIASES } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK, substituteZone } from '../services/scenario';
import {
  pseudoConfig, pseudoVp, pseudoNote, calibrateOn, calibratedConfig, savedPseudo, misfitText, DEFAULT_PSEUDO, LIVE_CHECK,
} from '../services/pseudoSonic';
import { preparePublishLogs, prepareEstimatedSonicLog, staleOwnCurves, PIPELINE_VERSION } from '../services/publish';
import { reportHeader } from '../services/substitutionCsv';
import { velocityMisfit, gardnerVp, faustVp } from '../engine/pseudoSonic';
import { estimatedCurveKind, estimatedCurveLabel, substitutedCurveLabel } from '@/lib/rockPhysicsCurves';

async function raw(name) {
  const backend = makeInMemoryBackend({ nosonic: true });
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { backend, well, curves, mapped, zones: await backend.listZones(well.id) };
}
const NOSONIC = 'NOSONIC RP-6 (no sonic log)';
const SONIC = 'SONIC RP-7 (calibration well)';

test('a well with no sonic opens on the Gardner inverse, says estimated, and its misfit against the truth is honest', async () => {
  const { curves, mapped } = await raw(NOSONIC);
  expect(mapped.DT).toBeNull();
  expect(mapped.RT.mnemonic).toBe('RT');
  expect(CURVE_ALIASES.RT).toContain('ILD');
  const model = buildModel(curves, mapped);
  expect(model.vpSource).toBe('estimated');
  expect(model.vpMethod).toBe('gardner');
  expect(model.vpNote).toBe('Gardner (1974) inverse from density, rho = 0.23 V^0.25, published constant');
  expect(model.vsSource).toBe('estimated');
  expect(model.notes.join(' ')).toMatch(/No sonic \(DT\) curve: Vp is estimated\. Gardner \(1974\) inverse from density/);
  // the estimate is the engine's
  const i = 100;
  expect(model.vp[i]).toBeCloseTo(gardnerVp(model.rho[i]), 6);
  // the well's density follows a 0.245, so the published 0.23 reads fast: (0.245/0.23)^4 = +28.7 percent on the trend
  const truth = noSonicTruth();
  const m = velocityMisfit(model.vp, truth);
  expect(m.n).toBe(401);
  expect(m.biasPct).toBeGreaterThan(20);
  expect(m.biasPct).toBeLessThan(35);
  // negative control: the old door refused the well outright
  expect(() => { if (!curves.DT) throw new Error('This well has no sonic (DT) curve, and rock physics needs Vp.'); }).toThrow();
  // a measured-sonic well is untouched by any pseudo setting
  const s = await raw(SONIC);
  const withSonic = buildModel(s.curves, s.mapped, { pseudoSonic: { method: 'faust', faustGamma: 9999 } });
  expect(withSonic.vpSource).toBe('measured');
  expect(withSonic.vpNote).toBeNull();
  expect(withSonic.rt).toHaveLength(401);
});

test('calibrating on the well that has a sonic recovers the constants and cuts the misfit on the no-sonic well', async () => {
  const s = await raw(SONIC);
  const cal = calibrateOn(buildModel(s.curves, s.mapped));
  expect(cal.errors).toEqual([]);
  expect(cal.gardner.a).toBeCloseTo(NOSONIC_TRUTH.gardnerA, 2);
  expect(cal.faust.gamma / NOSONIC_TRUTH.faustGamma).toBeCloseTo(1, 2);
  // on the calibration well itself: published constants are biased, fitted ones are not
  expect(Math.abs(cal.gardner.published.biasPct)).toBeGreaterThan(20);
  expect(Math.abs(cal.gardner.calibrated.biasPct)).toBeLessThan(1);
  expect(cal.faust.published.biasPct).toBeCloseTo(100 * (1948 / 2100 - 1), 0);
  expect(Math.abs(cal.faust.calibrated.biasPct)).toBeLessThan(0.5);
  expect(misfitText(cal.faust.calibrated)).toMatch(/^bias -?0\.\d%, RMS \d\.\d%, correlation 0\.\d\d over 401 samples$/);
  // carried to the well with no sonic: the truth is known there, so the gain is measured, not assumed
  const { curves, mapped, well } = await raw(NOSONIC);
  const truth = noSonicTruth();
  for (const method of ['gardner', 'faust']) {
    const before = velocityMisfit(buildModel(curves, mapped, { pseudoSonic: { method } }).vp, truth);
    const cfg = calibratedConfig(pseudoConfig({ method }, { rhob: true, rt: true }), cal, s.well);
    const after = velocityMisfit(buildModel(curves, mapped, { pseudoSonic: cfg }).vp, truth);
    expect(Math.abs(after.biasPct)).toBeLessThan(Math.abs(before.biasPct) / 4);
    expect(after.rmsPct).toBeLessThan(4); // the 3 percent wobble no transform can know
    expect(cfg.calibratedOn.name).toBe(SONIC);
    expect(Object.keys(cfg).sort()).toEqual(['calibratedOn', 'faustGamma', 'gardnerA', 'method']);
  }
  expect(well.name).toBe(NOSONIC);
  // a well with no sonic cannot be a calibration well
  expect(calibrateOn(buildModel(curves, mapped)).errors).toEqual(['The calibration well has no sonic log.']);
  // a calibration well with no resistivity fits Gardner only
  const { RT, ...noRt } = s.curves;
  const gOnly = calibrateOn(buildModel(noRt, { ...s.mapped, RT: null }));
  expect(gOnly.gardner).not.toBeNull();
  expect(gOnly.faust).toBeNull();
  expect(gOnly.errors.join(' ')).toMatch(/no resistivity curve/);
});

test('settings: Faust needs a resistivity curve; hostile values fall back to the published constants', async () => {
  expect(pseudoConfig(null)).toMatchObject({ method: 'gardner', gardnerA: 0.23, faustGamma: 1948, available: ['gardner'], fellBack: null });
  const noRt = pseudoConfig({ method: 'faust' }, { rhob: true, rt: false });
  expect(noRt.method).toBe('gardner');
  expect(noRt.fellBack).toMatch(/no resistivity curve, so Faust cannot run/);
  expect(pseudoConfig({ method: 'x', gardnerA: -1, faustGamma: 'abc' }, { rhob: true, rt: true })).toMatchObject({ method: 'gardner', gardnerA: 0.23, faustGamma: 1948, available: ['gardner', 'faust'] });
  expect(savedPseudo(pseudoConfig({ method: 'faust', faustGamma: 2000 }, { rhob: true, rt: true }))).toEqual({ method: 'faust', gardnerA: 0.23, faustGamma: 2000, calibratedOn: null });
  expect(pseudoNote(pseudoConfig({ method: 'faust', faustGamma: 2100, calibratedOn: { name: 'W-3' } }, { rhob: true, rt: true }))).toBe('Faust (1953) from resistivity and depth, V = 2100 (Z R)^(1/6) ft/s, calibrated on W-3');
  expect(DEFAULT_PSEUDO.method).toBe('gardner');
  // gaps in the inputs are gaps in the estimate
  const { vp, estimated } = pseudoVp({ depth: [1000, 1001, 1002], rho: [2300, NaN, -999], rt: [2, 2, 2] }, pseudoConfig({}, { rhob: true, rt: true }));
  expect(estimated).toBe(1);
  expect(vp[1]).toBeNaN();
  expect(vp[2]).toBeNaN();
  const f = pseudoVp({ depth: [1000, 0, 1002], rho: [2300, 2300, 2300], rt: [2, 2, -999] }, pseudoConfig({ method: 'faust' }, { rhob: true, rt: true }));
  expect(f.vp[0]).toBeCloseTo(faustVp(1000, 2), 9);
  expect(f.estimated).toBe(1);
  // the live check is quoted, not invented: both wells, both transforms
  expect(LIVE_CHECK.wells.map((w) => w.name)).toEqual(['Alaoma-2', 'W-3']);
  expect(LIVE_CHECK.sentence).toMatch(/16 and 25 percent RMS/);
});

test('estimated says estimated in the header, the published curves and the labels other apps show (PL4)', async () => {
  const { curves, mapped, zones, well, backend } = await raw(NOSONIC);
  const model = buildModel(curves, mapped);
  const zone = zones[0];
  const idx = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  const sub = substituteZone(model, idx, DEFAULT_SCENARIO, DEFAULT_ROCK);
  expect(sub.done).toBeGreaterThan(0);
  const header = reportHeader({ well, zone, model, sub, indices: idx, scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, units: { velocity: 'm/s', density: 'kg/m3', depth: 'm' } });
  expect(header.find(([k]) => k === 'Sonic')[1]).toBe('Vp ESTIMATED, no sonic log: Gardner (1974) inverse from density, rho = 0.23 V^0.25, published constant');
  const logs = preparePublishLogs(model, sub, idx, zone, { scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, kmin: sub.kmin });
  const dtSub = logs.find((l) => l.mnemonic === 'DT_SUB');
  expect(dtSub.description).toMatch(/from an ESTIMATED sonic: Gardner \(1974\) inverse/);
  expect(dtSub.provenance.vp_source).toBe('estimated');
  expect(dtSub.provenance.vp_method).toBe('gardner');
  expect(dtSub.provenance.pipeline_version).toBe(PIPELINE_VERSION);
  expect(logs.find((l) => l.mnemonic === 'RHOB_SUB').description).not.toMatch(/ESTIMATED/);
  // the estimate itself as a curve
  const est = prepareEstimatedSonicLog(model, { projectId: 'p1' });
  expect(est.mnemonic).toBe('DT_EST');
  expect(est.unit).toBe('US/M');
  expect(est.description).toMatch(/^ESTIMATED compressional slowness \(no sonic log\): Gardner/);
  expect(est.provenance).toMatchObject({ computed: true, estimated: true, engine: 'rock-physics-studio', method: 'gardner', constants: { gardner_a: 0.23, gardner_b: 0.25 }, calibrated_on: null });
  expect(est.data[100]).toBeCloseTo(1e6 / model.vp[100], 2);
  // published through the backend, it is listed for other apps as an estimated sonic, never as a plain DT
  const saved = await backend.publishCurves(well.id, [est], 'p1');
  expect(estimatedCurveKind(saved[0])).toBe('sonic');
  expect(estimatedCurveLabel(saved[0])).toBe('DT_EST (US/M), ESTIMATED sonic: Gardner (1974) inverse from density, rho = 0.23 V^0.25, published constant');
  expect(estimatedCurveKind({ mnemonic: 'DT_EST', provenance: null })).toBeNull();
  expect(substitutedCurveLabel({ ...dtSub, unit: 'US/M' })).toMatch(/fluid substituted, from an ESTIMATED sonic/);
  // overwrite own: a republish replaces it; the well still maps no DT (the estimate is never read back as a log)
  const again = await backend.listLogs(well.id);
  expect(staleOwnCurves(again, [est], 'p1')).toHaveLength(1);
  expect(mapLogs(again).DT).toBeNull();
  // a well with a sonic has nothing to publish
  const s = await raw(SONIC);
  expect(() => prepareEstimatedSonicLog(buildModel(s.curves, s.mapped))).toThrow(/has a sonic log/);
});
