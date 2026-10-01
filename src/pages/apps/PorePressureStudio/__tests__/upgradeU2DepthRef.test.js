/**
 * PP-U2-004: the prognosis read in TVD below RKB, TVDSS or MD, converted
 * through the survey and the datum.
 */
import fs from 'fs';
import path from 'path';
import { buildProfileInput } from '../services/prep';
import { computeProfile } from '../engine/profile';

const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure', 'goldens.json'), 'utf8')).well;

// ---- U2-004 depth reference ----------------------------------------------------
import { depthReferences, refMapper, chosenRef } from '../services/depthRef';
import { prognosisCsv } from '../services/units';
import { reportRows, reviewerLines } from '../services/report';
import { makeDepthFrame } from '../../../../../packages/engines/engines/welldata/checkshots';

describe('U2-004 the prognosis read in TVD below RKB, TVDSS or MD', () => {
  const params = { waterDepthM: 100, mudlineMdM: 130, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, nct: { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, method: 'eaton', eatonN: 3, nu: 0.4 };
  // a well building to 45 degrees below 1,000 m MD, KB 30 m above sea level
  const frame = makeDepthFrame({ deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 1500, inc: 45, azi: 0 }, { md: 7000, inc: 45, azi: 0 }], kbM: 30 });
  const md = W.z_bml_m.map((z) => z + 130);
  const input = buildProfileInput({ depth: md, dt: W.dt_us_per_m, rho: W.rho_kg_m3 }, { DT: 'US/M', RHOB: 'KG/M3' }, { mudlineMdM: 130, frame });

  test('each frame through the survey and the datum', () => {
    const r = depthReferences(input, params, { frame, kbM: 30, source: 'well' });
    const i = input.mdM.indexOf(3130);
    const tvd = frame.mdToPosition(3130).tvd;
    expect(r.md[i]).toBe(3130);
    expect(r.tvdrkb[i]).toBeCloseTo(tvd, 9);
    expect(r.tvdss[i]).toBeCloseTo(tvd - 30, 9); // the mudline at 100 m below sea level
    expect(r.bml[i]).toBeCloseTo(tvd - 130, 9);
    // negative control: MD as the depth (no survey) is hundreds of metres deep of the TVD
    expect(r.md[i] - r.tvdrkb[i]).toBeGreaterThan(400);
    const m = refMapper(r, 'tvdss');
    expect(m.fromBml(r.bml[i])).toBeCloseTo(r.tvdss[i], 9);
    expect(m.toBml(r.tvdss[i])).toBeCloseTo(r.bml[i], 9);
  });

  test('frames the source cannot support are withheld with the reason', () => {
    const unset = depthReferences(input, { ...params, mudlineMdM: 0 }, { frame, kbM: 30 });
    expect(unset.tvdrkb).toBeNull();
    expect(unset.reasons.tvdrkb).toMatch(/set the mudline MD/);
    expect(chosenRef(unset, 'tvdrkb')).toBe('bml');
    const onshore = depthReferences(input, { ...params, waterDepthM: 0, mudlineMdM: 5 }, { frame: null, kbM: null });
    expect(onshore.tvdss).toBeNull();
    expect(onshore.reasons.tvdss).toMatch(/needs the KB elevation/);
    const onshoreKb = depthReferences(input, { ...params, waterDepthM: 0, mudlineMdM: 5 }, { frame: null, kbM: 250 });
    expect(onshoreKb.tvdss[0]).toBeCloseTo(input.zBmlM[0] + 5 - 250, 9);
    const trend = depthReferences({ zBmlM: [0, 10] }, params, { source: 'seismic' });
    expect(trend.md).toBeNull();
    expect(trend.reasons.md).toMatch(/no measured depth/);
    expect(trend.tvdss).toEqual([100, 110]);
  });

  test('the CSV carries every frame; the PDF table reads in the chosen one', () => {
    const r = depthReferences(input, params, { frame, kbM: 30, source: 'well' });
    const res = computeProfile({ ...input, params });
    const csv = prognosisCsv(input, res, params, { pressure: 'MPa', depth: 'm' }, { refs: r });
    expect(csv).toContain('Depth bml (m),TVD below RKB (m),TVDSS (m),MD below RKB (m),Depth below RKB (m),OBG (MPa)');
    const line = csv.split('\n').find((l) => l.split(',')[3] === '3130');
    expect(Number(line.split(',')[1])).toBeCloseTo(frame.mdToPosition(3130).tvd, 2);
    const rows = reportRows({ input, result: res, params, units: { pressure: 'MPa', depth: 'm' }, mapper: refMapper(r, 'md') });
    expect(rows[0][0]).toBe('130'); // the first sample, at the mudline, is 130 m MD
    expect(Number(rows[rows.length - 1][0].replace(',', ''))).toBeCloseTo(input.mdM[input.mdM.length - 1], 1);
    const lines = reviewerLines({ params, units: { pressure: 'MPa', depth: 'm' }, input, result: res, mapper: refMapper(r, 'tvdss') });
    expect(lines.join('\n')).toMatch(/Depths read as TVDSS/);
  });
});
