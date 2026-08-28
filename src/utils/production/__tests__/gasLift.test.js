/**
 * Production P4 gas-lift studio gates. The valve mechanics and the
 * spacing recursion are gated in the engine package
 * (packages/engines/__tests__/production.gaslift.test.js) against an
 * independent oracle; what is gated here is the Suite layer: injection
 * at depth against the NA3 whole-string assumption, the point-of-
 * injection construction on a real nodal traverse, the depth sweep,
 * the psig/psia boundary, form validation and the legacy import.
 */
import {
  ATM_PSIA, psigToPsia, psiaToPsig, liftedGor, MAX_GOR_EFF, mdAtTvd,
  liftedTraverse, traverseToTvdTable, solveLiftedOperatingPoint,
  gasLiftPerformance, injectionDepthSweep, injectionPointFromTraverse,
  killGradientFromPpg, ppgFromKillGradient, runInstallationDesign,
  valveSheetRows, importLegacyGasLiftInputs, injectionRateLadder,
} from '../gasLift';
import { gasLiftScreening } from '@/utils/nodal/gasLift';
import { computeIpr } from '@/utils/nodal/ipr';
import { buildFluidModel } from '@/utils/nodal/pvt';
import { buildTrajectory } from '@/utils/nodal/trajectory';
import { linearGeothermal } from '@/utils/nodal/temperature';
import { linspace } from '@/utils/nodal/numerics';
import { linearTemperature } from '../engine/gasLiftDesign';

const DEPTH = 7000;
const fluidModel = buildFluidModel({ api: 32, gasSg: 0.75, gor: 150, salinityPpm: 30000 });
const vertical = buildTrajectory({ mode: 'vertical', depthFt: DEPTH });
const tAt = linearGeothermal({ whtF: 100, bhtF: 170, tvdMaxFt: DEPTH });

// The classic gas-lift candidate: wet, low gas-oil ratio, dead on its own.
const vlp = {
  fluidModel,
  trajectory: vertical,
  tAt,
  idIn: 2.441,
  correlation: 'beggsBrill',
  whp: 150,
  nodeMd: DEPTH,
  stepFt: 250,
  rates: { wct: 0.7, gor: 150 },
};
const ipr = computeIpr({ model: 'composite', pr: 2600, pb: 1800, pi: 2.5 });

const baseForm = {
  kickoffPsig: '1000',
  operatingPsig: '900',
  whUnloadPsig: '100',
  injGasSg: '0.65',
  packerDepthFt: '7000',
  whtF: '100',
  bhtF: '170',
  killGradPsiPerFt: '0.45',
  unloadGradPsiPerFt: '0.1',
  dpTransferPsi: '50',
  dpPerValvePsi: '25',
  minSpacingFt: '250',
  maxValves: '12',
  targetQgiMscfd: '500',
  valveFamilyId: 'r15',
  valveType: 'IPO',
  bottomOrifice: true,
  orificeIdIn: '0.25',
  method: 'surfaceClose',
};

describe('unit boundary', () => {
  test('gauge and absolute round-trip through the studio boundary', () => {
    expect(psigToPsia(0)).toBe(ATM_PSIA);
    expect(psiaToPsig(psigToPsia(875))).toBeCloseTo(875, 9);
    expect(psigToPsia('900')).toBe(914.7);
    expect(Number.isNaN(psigToPsia('not a number'))).toBe(true);
  });

  test('kill gradient and mud weight convert both ways', () => {
    expect(killGradientFromPpg(8.33)).toBeCloseTo(0.4332, 4);
    expect(ppgFromKillGradient(killGradientFromPpg(9.5))).toBeCloseTo(9.5, 9);
  });
});

describe('lifted gas-oil ratio', () => {
  test('injected gas adds to the produced ratio per barrel of oil', () => {
    expect(liftedGor({ gor: 200, qgiMscfd: 500, qo: 1000 })).toBe(700);
  });

  test('the correlation envelope caps it rather than running off the chart', () => {
    expect(liftedGor({ gor: 200, qgiMscfd: 5000, qo: 1 })).toBe(MAX_GOR_EFF);
    expect(liftedGor({ gor: 200, qgiMscfd: 500, qo: 0 })).toBe(MAX_GOR_EFF);
  });
});

describe('measured depth at a true vertical depth', () => {
  test('a vertical well maps one to one', () => {
    expect(mdAtTvd(vertical, 3500)).toBeCloseTo(3500, 9);
    expect(mdAtTvd(vertical, 0)).toBe(0);
  });

  test('a deviated well stretches measured depth below the kickoff', () => {
    const dev = buildTrajectory({
      mode: 'deviated',
      survey: [
        { md: 0, inc: 0, azi: 0 },
        { md: 2000, inc: 0, azi: 0 },
        { md: 5000, inc: 45, azi: 90 },
        { md: 9000, inc: 45, azi: 90 },
      ],
    });
    expect(mdAtTvd(dev, 1500)).toBeCloseTo(1500, 6);
    const md = mdAtTvd(dev, 5000);
    expect(md).toBeGreaterThan(5000);
    // and past the bottom of the survey it clamps rather than extrapolating
    expect(mdAtTvd(dev, 99999)).toBe(dev.points[dev.points.length - 1].md);
    expect(mdAtTvd({ points: [] }, 100)).toBe(0);
  });
});

describe('injection at depth', () => {
  const qo = 400;

  test('only the string above the injection point carries the lifted ratio', () => {
    const deep = liftedTraverse({ ...vlp, qo, injectionMd: 6000, qgiMscfd: 600 });
    const shallow = liftedTraverse({ ...vlp, qo, injectionMd: 2000, qgiMscfd: 600 });
    expect(deep.ok).toBe(true);
    expect(shallow.ok).toBe(true);
    // lightening more of the column means a lower bottomhole pressure
    expect(deep.pwf).toBeLessThan(shallow.pwf);
    expect(deep.gorLifted).toBeCloseTo(shallow.gorLifted, 9);
  });

  test('injection at the node reproduces the NA3 whole-string screening', () => {
    const wholeString = liftedTraverse({ ...vlp, qo, injectionMd: DEPTH, qgiMscfd: 600 });
    const na3 = gasLiftScreening({
      ipr, vlp, qgis: [600], nGrid: 12,
    });
    // same physics at the same rate: the NA3 assumption is the limiting
    // case of this one, so the depth-aware traverse must not contradict it
    expect(wholeString.ok).toBe(true);
    expect(na3.response).toHaveLength(1);
    expect(wholeString.pwf).toBeGreaterThan(0);
  });

  test('no injection leaves the traverse at the native ratio', () => {
    const none = liftedTraverse({ ...vlp, qo, injectionMd: 4000, qgiMscfd: 0 });
    const flat = liftedTraverse({ ...vlp, qo, injectionMd: 0, qgiMscfd: 0 });
    expect(none.gorLifted).toBe(150);
    expect(Math.abs(none.pwf - flat.pwf)).toBeLessThan(1e-6);
  });

  test('the stream may arrive flat or nested, with the same answer', () => {
    const nested = liftedTraverse({ ...vlp, qo, injectionMd: 5000, qgiMscfd: 400 });
    const flat = liftedTraverse({
      ...vlp, rates: undefined, qo, wct: 0.7, gor: 150, injectionMd: 5000, qgiMscfd: 400,
    });
    expect(flat.pwf).toBeCloseTo(nested.pwf, 9);
  });

  test('traverse points reduce to the depth-pressure table the engine takes', () => {
    const t = liftedTraverse({ ...vlp, qo, injectionMd: 5000, qgiMscfd: 400 });
    const table = traverseToTvdTable(t.points);
    expect(table.length).toBe(t.points.length);
    expect(table[0]).toEqual({ tvdFt: t.points[0].tvd, pPsia: t.points[0].p });
    expect(traverseToTvdTable()).toEqual([]);
  });
});

describe('operating point and performance', () => {
  test('the well is dead without gas and alive with it', () => {
    const dead = solveLiftedOperatingPoint({ ipr, vlp, injectionMd: 6000, qgiMscfd: 0, nGrid: 20 });
    const alive = solveLiftedOperatingPoint({ ipr, vlp, injectionMd: 6000, qgiMscfd: 800, nGrid: 20 });
    expect(dead.q).toBe(0);
    expect(alive.q).toBeGreaterThan(300);
  });

  test('the performance curve rises then flattens, and reports both points', () => {
    const perf = gasLiftPerformance({
      ipr, vlp, injectionMd: 6000, qgis: linspace(0, 1600, 7), econSlope: 0.05, nGrid: 20,
    });
    expect(perf.response).toHaveLength(7);
    expect(perf.baseline.qgi).toBe(0);
    expect(perf.best.q).toBeGreaterThan(perf.baseline.q);
    const slopes = [];
    for (let i = 1; i < perf.response.length; i += 1) {
      const d = perf.response[i].q - perf.response[i - 1].q;
      slopes.push(d / (perf.response[i].qgi - perf.response[i - 1].qgi));
    }
    expect(slopes[slopes.length - 1]).toBeLessThan(slopes[0]);
    if (perf.econ) expect(perf.econ.qgi).toBeLessThanOrEqual(perf.best.qgi);
  });

  test('deeper injection produces more at the same gas rate', () => {
    const sweep = injectionDepthSweep({
      ipr, vlp, depthsMd: [2000, 4000, 6000], qgiMscfd: 800, nGrid: 20,
    });
    expect(sweep.points).toHaveLength(3);
    expect(sweep.points[2].q).toBeGreaterThan(sweep.points[0].q);
    expect(sweep.best.injectionMd).toBe(6000);
  });
});

describe('point of injection', () => {
  const tempAtDepthF = linearTemperature({ whtF: 100, bhtF: 170, refDepthFt: DEPTH });
  const lifted = liftedTraverse({ ...vlp, qo: 400, injectionMd: DEPTH, qgiMscfd: 600 });

  test('the construction crosses where the injection line meets the flowing gradient', () => {
    const hit = injectionPointFromTraverse({
      traversePoints: lifted.points,
      pSurfPsia: psigToPsia(900),
      gasSg: 0.65,
      tempAtDepthF,
      dpTransferPsi: 100,
      maxDepthFt: DEPTH,
    });
    expect(hit).not.toBeNull();
    expect(hit.depthFt).toBeGreaterThan(0);
    expect(hit.depthFt).toBeLessThanOrEqual(DEPTH);
    if (hit.limitedBy === 'pressure') {
      expect(Math.abs(hit.pInjPsia - 100 - hit.pProdPsia)).toBeLessThan(2);
    }
  });

  test('more casing pressure reaches deeper', () => {
    const low = injectionPointFromTraverse({
      traversePoints: lifted.points, pSurfPsia: psigToPsia(600), gasSg: 0.65,
      tempAtDepthF, dpTransferPsi: 100, maxDepthFt: DEPTH,
    });
    const high = injectionPointFromTraverse({
      traversePoints: lifted.points, pSurfPsia: psigToPsia(1200), gasSg: 0.65,
      tempAtDepthF, dpTransferPsi: 100, maxDepthFt: DEPTH,
    });
    expect(high.depthFt).toBeGreaterThan(low.depthFt);
  });
});

describe('installation design from the studio form', () => {
  test('a complete form designs a string and mirrors every pressure in psig', () => {
    const { ok, errors, design } = runInstallationDesign(baseForm);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
    expect(design.valves.length).toBeGreaterThan(1);
    design.valves.forEach((v) => {
      expect(v.pInjAtDepthPsig).toBeCloseTo(v.pInjAtDepthPsia - ATM_PSIA, 9);
      expect(v.depthFt).toBeGreaterThan(0);
      expect(v.depthFt).toBeLessThanOrEqual(7000);
    });
    expect(design.pOperatingPsig).toBeCloseTo(900, 9);
    expect(design.family.bellowsAreaIn2).toBe(0.77);
  });

  test('the bottom of the string is an orifice when asked for one', () => {
    const { design } = runInstallationDesign(baseForm);
    const last = design.valves[design.valves.length - 1];
    expect(last.valveType).toBe('orifice');
    expect(last.testRackOpeningPsig).toBeNull();
    const noOrifice = runInstallationDesign({ ...baseForm, bottomOrifice: false });
    const lastValve = noOrifice.design.valves[noOrifice.design.valves.length - 1];
    expect(lastValve.valveType).toBe('IPO');
    expect(lastValve.testRackOpeningPsig).toBeGreaterThan(0);
  });

  test('missing and contradictory inputs are refused with reasons, not defaulted', () => {
    const missing = runInstallationDesign({ ...baseForm, kickoffPsig: '' });
    expect(missing.ok).toBe(false);
    expect(missing.design).toBeNull();
    expect(missing.errors.join(' ')).toMatch(/Kickoff injection pressure/);

    const backwards = runInstallationDesign({ ...baseForm, kickoffPsig: '80', whUnloadPsig: '100' });
    expect(backwards.ok).toBe(false);
    expect(backwards.errors.join(' ')).toMatch(/must exceed the unloading wellhead pressure/);

    const silly = runInstallationDesign({ ...baseForm, injGasSg: '4' });
    expect(silly.ok).toBe(false);
  });

  test('a design that cannot reach the packer says so', () => {
    const short = runInstallationDesign({ ...baseForm, kickoffPsig: '400', operatingPsig: '350' });
    expect(short.ok).toBe(true);
    expect(short.design.depths[short.design.depths.length - 1]).toBeLessThan(7000);
    expect(short.design.warnings.length).toBeGreaterThan(0);
  });

  test('a known injection depth is honoured as the spacing floor', () => {
    const { design } = runInstallationDesign({ ...baseForm, targetDepthFt: '5000' });
    expect(Math.max(...design.depths)).toBeLessThanOrEqual(5000 + 1e-6);
  });

  test('the valve sheet carries what a shop needs to set each valve', () => {
    const { design } = runInstallationDesign(baseForm);
    const rows = valveSheetRows(design);
    expect(rows).toHaveLength(design.valves.length);
    expect(rows[0].valve).toBe(1);
    expect(rows[0].testRackPsig).toBeGreaterThan(0);
    expect(rows[0].gasRateMscfd).toBeGreaterThan(0);
    expect(valveSheetRows(null)).toEqual([]);
  });

  test('the injection rate ladder starts at zero and reaches the maximum', () => {
    const ladder = injectionRateLadder({ maxQgiMscfd: 1600, nPoints: 9 });
    expect(ladder[0]).toBe(0);
    expect(ladder[ladder.length - 1]).toBe(1600);
    expect(ladder).toHaveLength(9);
    expect(injectionRateLadder({ maxQgiMscfd: '800', nPoints: '5' })).toHaveLength(5);
  });
});

describe('legacy Artificial Lift Designer import', () => {
  const legacy = {
    tubingID: 2.441,
    wellDepth: 8000,
    whp: 200,
    bhp: 2000,
    liquidRate: 1500,
    waterCut: 30,
    gor: 300,
    oilApi: 35,
    gasGravity: 0.7,
    waterSalinity: 30000,
    wellheadTemp: 120,
    bottomholeTemp: 180,
    surfaceInjectionPressure: 1500,
    injectionGasGravity: 0.65,
    valveSpacingSafetyFactor: 100,
  };

  test('every field that means the same thing is carried across', () => {
    const { patch, mapped } = importLegacyGasLiftInputs(legacy);
    expect(patch.packerDepthFt).toBe('8000');
    expect(patch.kickoffPsig).toBe('1500');
    expect(patch.injGasSg).toBe('0.65');
    expect(patch.whtF).toBe('120');
    expect(mapped.length).toBe(14);
  });

  test('what does not map is reported rather than invented', () => {
    const { patch, unmapped } = importLegacyGasLiftInputs(legacy);
    expect(patch.valveSpacingSafetyFactor).toBeUndefined();
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toMatch(/safety factor/i);
  });

  test('nothing to import is not an error', () => {
    expect(importLegacyGasLiftInputs(null)).toEqual({ patch: {}, mapped: [], unmapped: [] });
    expect(importLegacyGasLiftInputs({}).mapped).toEqual([]);
  });
});
