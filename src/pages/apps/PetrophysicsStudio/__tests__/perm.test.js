// PS6: permeability + BVW vs the PERM golden at 1e-12, the pipeline
// path (KPERM/BVW outputs, zone k geometric mean), the mD constants
// pinned by the analytic anchors, and the no-perm default invariant.

import fs from 'fs';
import path from 'path';
import { kTimur, kTixier, kCoates, kWyllieRose, bvw, swirrFromBuckles, kGeomMean, MORRIS_BIGGS } from '../engine/perm';
import { computeWell, zoneSummary, DEFAULT_PARAMS } from '../engine/pipeline';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const analytic = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'analytic_cases.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));

const curves = {
  DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'),
  NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT'),
};
const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
const expectCurve = (got, want) => {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    if (want[i] === null) expect(Number.isNaN(got[i])).toBe(true);
    else expect(close(got[i], want[i])).toBe(true);
  }
};

const PG = goldens.PERM;
const E = goldens.EFFECTIVE;
const phid = goldens.PHID.map((v) => (v === null ? NaN : v));
// PT9: the pipeline runs k on the shale-corrected PHIE (EFFECTIVE block)
const PARAMS = { ...DEFAULT_PARAMS, phiShale: typewell.params.phi_shale, bucklesConst: PG.params.bucklesConst };

test('scalar correlations match the PERM golden curves at 1e-12', () => {
  const swirr = Float64Array.from(phid, (f) => swirrFromBuckles(f, PG.params.bucklesConst));
  expectCurve(swirr, PG.SWIRR);
  expectCurve(Float64Array.from(phid, (f, i) => kTimur(f, swirr[i])), PG.K_TIMUR);
  expectCurve(Float64Array.from(phid, (f, i) => kTixier(f, swirr[i])), PG.K_TIXIER);
  expectCurve(Float64Array.from(phid, (f, i) => kCoates(f, swirr[i])), PG.K_COATES);
  expectCurve(
    Float64Array.from(phid, (f, i) => kWyllieRose(f, swirr[i], PG.params.wrC, PG.params.wrQ)),
    PG.K_WR_GAS,
  );
});

test('pipeline (default Timur) computes KPERM + BVW on PHIE and the zone geometric mean matches the golden', () => {
  const { outputs } = computeWell(curves, PARAMS);
  expectCurve(outputs.KPERM, E.K_TIMUR);
  expectCurve(outputs.BVW, E.BVW);
  for (const [name, want] of Object.entries(E.ZONES)) {
    const [top, base] = typewell.params.zones[name];
    const s = zoneSummary(curves, outputs, PARAMS, { top_md_m: top, base_md_m: base });
    if (want.summary.k_gm_md === null) expect(Number.isNaN(s.k_gm_md)).toBe(true);
    else expect(close(s.k_gm_md, want.summary.k_gm_md)).toBe(true);
  }
});

test('the PS6 golden (k on the porosity as read) is reproduced with the shale correction at zero, wherever Vsh exists', () => {
  // PHIE = PHIT - Vsh * 0 still needs Vsh, so the GR-null sample (index
  // 90) is NaN here and finite in the PS6 golden; everywhere else the
  // two recipes coincide, zone means included (no pay at a null GR)
  const { outputs } = computeWell(curves, { ...PARAMS, phiShale: 0 });
  const vsh = outputs.VSH;
  const sameWhereVsh = (got, want) => {
    for (let i = 0; i < want.length; i++) {
      if (!Number.isFinite(vsh[i])) { expect(Number.isNaN(got[i])).toBe(true); continue; }
      if (want[i] === null) expect(Number.isNaN(got[i])).toBe(true);
      else expect(close(got[i], want[i])).toBe(true);
    }
  };
  sameWhereVsh(outputs.KPERM, PG.K_TIMUR);
  sameWhereVsh(outputs.BVW, PG.BVW);
  for (const [name, want] of Object.entries(PG.zones)) {
    const [top, base] = typewell.params.zones[name];
    const s = zoneSummary(curves, outputs, { ...PARAMS, phiShale: 0 }, { top_md_m: top, base_md_m: base });
    expect(close(s.k_gm_md, want.k_gm_timur)).toBe(true);
  }
});

test('permMethod none is an explicit choice: no KPERM, summary shape without k', () => {
  const { outputs } = computeWell(curves, { ...PARAMS, permMethod: 'none' });
  expect(outputs.KPERM).toBeUndefined();
  expect(outputs.BVW).toBeDefined(); // BVW needs only porosity and Sw
  const zone = { top_md_m: 2010, base_md_m: 2030 };
  expect(zoneSummary(curves, outputs, { ...PARAMS, permMethod: 'none' }, zone).k_gm_md).toBeUndefined();
});

test('analytic anchors pin the cited constants', () => {
  expect(close(kTimur(0.2, 0.2), analytic.timur_02_02.out)).toBe(true);
  expect(close(kTixier(0.2, 0.2), analytic.tixier_02_02.out)).toBe(true);
  expect(close(kCoates(0.2, 0.2), analytic.coates_02_02.out)).toBe(true);
  expect(close(kWyllieRose(0.2, 0.2, 79, 3), analytic.wyllie_rose_gas_02_02.out)).toBe(true);
  expect(swirrFromBuckles(0.03, 0.04)).toBe(1); // clamp
  expect(MORRIS_BIGGS.oil.c).toBe(250);
  // Tixier IS the Wyllie-Rose oil preset
  expect(close(kTixier(0.2, 0.3), kWyllieRose(0.2, 0.3, MORRIS_BIGGS.oil.c, MORRIS_BIGGS.oil.q))).toBe(true);
});

test('invalid inputs and empty pay are NaN', () => {
  expect(Number.isNaN(kTimur(0, 0.2))).toBe(true);
  expect(Number.isNaN(kCoates(0.2, 1.5))).toBe(true);
  expect(Number.isNaN(bvw(NaN, 0.5))).toBe(true);
  expect(Number.isNaN(kGeomMean([1, 2], [false, false], [0.5, 0.5]))).toBe(true);
  expect(close(kGeomMean([1, 100], [true, true], [0.5, 0.5]), 10)).toBe(true);
});
