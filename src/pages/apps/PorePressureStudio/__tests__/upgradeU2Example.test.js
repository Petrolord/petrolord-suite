/**
 * PP-U2-010: the worked example project opens on the synthetic offshore
 * well, computes, and the numbers its help-guide walk quotes are the ones
 * the app produces (a drift in either fails here).
 */
import { makeWorkedExampleBackend, EXAMPLE_PROJECT } from '../services/workedExample';
import { mapLogs, normalizePpCurves, buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';
import { casingDesign } from '../services/drillingWindow';
import { inputNotes } from '../services/honesty';
import { fitToCalibration } from '../services/calibrate';
import { fmtPressure, emwReferenceDepthM } from '../services/units';
import { WORKED_EXAMPLE_NUMBERS } from '../PorePressureStudioHelpGuide';

async function exampleState() {
  const b = makeWorkedExampleBackend();
  const [well] = await b.listWells();
  const project = await b.loadProject();
  const mapped = mapLogs(await b.listLogs(well.id));
  const [depth, dt, rho] = await Promise.all([mapped.DEPT, mapped.DT, mapped.RHOB].map((l) => b.downloadCurve(l)));
  const norm = normalizePpCurves({ depth, dt, rho, dtLog: mapped.DT, rhoLog: mapped.RHOB });
  const input = buildProfileInput(norm, norm.units, { mudlineMdM: project.params.mudlineMdM });
  const result = computeProfile({ ...input, params: project.params });
  return { b, well, project, input, result };
}

test('the example opens its own well with the trend fitted, the points, and publish off', async () => {
  const { b, well, project } = await exampleState();
  expect(b.isExample).toBe(true);
  expect(b.publishCurves).toBeNull();
  expect(project.source.wellId).toBe(well.id);
  expect(project.source.nctFittedFor).toBe(well.id);
  expect(project.calibration.filter((c) => c.kind === 'rft')).toHaveLength(4);
  expect(project.calibration.filter((c) => c.kind === 'lot')).toHaveLength(3);
  expect(EXAMPLE_PROJECT.picks).toHaveLength(11);
});

test('the numbers the help guide quotes are the app\'s own', async () => {
  const { project, input, result } = await exampleState();
  const i = input.zBmlM.indexOf(3500);
  const ref = emwReferenceDepthM(3500, project.params);
  const casing = casingDesign(result, input.zBmlM, project.params);
  const notes = inputNotes({ input, result, params: project.params, calibration: project.calibration, nctFitted: true });
  const got = {
    ppMpaAt3500: fmtPressure(result.porePressurePa[i], 'MPa'),
    ppPpgAt3500: fmtPressure(result.porePressurePa[i], 'ppg', ref),
    seats: casing.seats.map((s) => Math.round(s.zBmlM)),
    calibrationNote: notes.find((n) => n.key === 'calibration').text,
  };
  // the walk's "type n 2.5, then fit" step
  const off = { ...project.params, eatonN: 2.5 };
  const fit = fitToCalibration(off, input, computeProfile({ ...input, params: off }), project.calibration);
  got.fitN = fit.params.eatonN.toFixed(2);
  expect(got).toEqual(WORKED_EXAMPLE_NUMBERS);
});
