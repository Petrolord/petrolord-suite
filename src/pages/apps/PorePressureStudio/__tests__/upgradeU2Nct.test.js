/**
 * PP-U2-005: shale-filtered picks, segmented trends (the semi-log axis is
 * checked in the browser, e2e/pore-pressure-u2.spec.js).
 */
import fs from 'fs';
import path from 'path';
import {
  autoShalePicks, picksInSand, fitSegments, pickShaleLog, normalizeShaleIndicator, grCutoff, DEFAULT_VSH_CUTOFF,
} from '../services/shalePicks';
import { makeInMemoryBackend, VSH_HARNESS } from '../services/inMemoryBackend';
import { mapLogs, buildProfileInput, normalizePpCurves } from '../services/prep';
import { nctDt } from '../engine/nct';
import { computeProfile } from '../engine/profile';

const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure', 'goldens.json'), 'utf8')).well;
const P = W.params;

async function harnessInput() {
  const b = makeInMemoryBackend();
  const [well] = await b.listWells();
  const logs = await b.listLogs(well.id);
  const mapped = mapLogs(logs);
  const sh = pickShaleLog(logs);
  const [depth, dt, rho, vsh] = await Promise.all([mapped.DEPT, mapped.DT, mapped.RHOB, sh.log].map((l) => b.downloadCurve(l)));
  const norm = normalizePpCurves({ depth, dt, rho, dtLog: mapped.DT, rhoLog: mapped.RHOB });
  const shale = normalizeShaleIndicator(vsh, sh);
  return { sh, input: buildProfileInput({ ...norm, shale: shale.values }, norm.units, { mudlineMdM: 130 }) };
}

describe('U2-005 shale picks and segmented trends', () => {
  test('the harness carries a VSH with sand beds; auto picks fall in shale only, one per interval', async () => {
    const { sh, input } = await harnessInput();
    expect(sh.kind).toBe('vsh');
    expect(input.shale).toHaveLength(input.zBmlM.length);
    const picks = autoShalePicks(input, { cutoff: DEFAULT_VSH_CUTOFF, fromM: 200, toM: 2390, everyM: 200 });
    expect(picks.length).toBe(11);
    picks.forEach((p) => expect(p.shale).toBeGreaterThanOrEqual(DEFAULT_VSH_CUTOFF));
    expect(picksInSand(picks, input, DEFAULT_VSH_CUTOFF)).toHaveLength(0);
    // the shale picks of the normally pressured section recover the generating trend exactly
    const fit = fitSegments(picks, { dtMlUsPerM: 600, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: 1e-3 }, []);
    expect(fit.nct.dtMlUsPerM).toBeCloseTo(P.dt_ml_us_per_m, 8);
    expect(fit.nct.cPerM).toBeCloseTo(P.c_nct_per_m, 12);
  });

  test('negative control: picks taken in the sand beds bend the trend', async () => {
    const { input } = await harnessInput();
    // the harness sonic is the oracle's (shale everywhere, so the goldens hold);
    // a sand reads faster, here 15%, as a real one would
    const sand = input.zBmlM.map((z, i) => ({ z, dt: 0.85 * input.dtUsPerM[i], v: input.shale[i] })).filter((p) => p.v < 0.3 && p.z > 200 && p.z < 2400);
    expect(sand.length).toBeGreaterThan(3);
    expect(picksInSand(sand, input, DEFAULT_VSH_CUTOFF)).toHaveLength(sand.length);
    const bent = fitSegments(sand, { dtMlUsPerM: 600, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: 1e-3 }, []);
    expect(Math.abs(bent.nct.dtMlUsPerM - P.dt_ml_us_per_m)).toBeGreaterThan(20);
  });

  test('a segment is fitted on the picks below its top; the base on the picks above', () => {
    const base = { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 };
    const above = [300, 600, 900].map((z) => ({ z, dt: nctDt(z, 656, 220, 6e-4) }));
    const below = [1600, 1900, 2200].map((z) => ({ z, dt: nctDt(z, 600, 220, 5e-4) }));
    const r = fitSegments([...above, ...below], base, [{ zTopM: 1500, dtMlUsPerM: 650, cPerM: 6e-4 }]);
    expect(r.nct.dtMlUsPerM).toBeCloseTo(656, 8);
    expect(r.segments[0].dtMlUsPerM).toBeCloseTo(600, 8);
    expect(r.segments[0].cPerM).toBeCloseTo(5e-4, 12);
    expect(r.fitted).toEqual(['the base trend', 'the segment from 1500 m']);
    // a segment with one pick keeps its values and is named
    const one = fitSegments([...above, below[0]], base, [{ zTopM: 1500, dtMlUsPerM: 650, cPerM: 6e-4 }]);
    expect(one.kept).toEqual(['the segment from 1500 m']);
    // and the engine draws the segmented trend
    const out = computeProfile({ zBmlM: W.z_bml_m, dtUsPerM: W.dt_us_per_m, rhoKgM3: W.rho_kg_m3, params: { waterDepthM: 100, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, nct: r.nct, nctSegments: r.segments, method: 'eaton', eatonN: 3, nu: 0.4 } });
    expect(out.dtNormalUsPerM[W.z_bml_m.indexOf(2000)]).toBeCloseTo(nctDt(2000, 600, 220, 5e-4), 8);
  });

  test('hostile shale curves: percent VSH, -999 nulls, GR cutoff from the data', () => {
    const pct = normalizeShaleIndicator([80, 15, -999.25, 90], { kind: 'vsh', log: { mnemonic: 'VSH', unit: '%' } });
    expect(pct.values.map((v) => (Number.isNaN(v) ? null : v))).toEqual([0.8, 0.15, null, 0.9]);
    expect(pct.notes[0]).toMatch(/percent/);
    const gr = Array.from({ length: 100 }, (_, i) => (i % 2 ? 30 : 120));
    expect(grCutoff(gr)).toBe(75);
    expect(pickShaleLog([{ mnemonic: 'GR' }, { mnemonic: 'VCL_CND' }]).kind).toBe('vsh');
    expect(pickShaleLog([{ mnemonic: 'GR' }]).kind).toBe('gr');
    expect(() => autoShalePicks({ zBmlM: [1], dtUsPerM: [1] }, { cutoff: 0.6, fromM: 0, toM: 10 })).toThrow(/no VSH or GR/);
    expect(VSH_HARNESS.length).toBe(W.z_bml_m.length);
  });
});
