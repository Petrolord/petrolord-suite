/**
 * Production P5 ESP studio gates. The pump hydraulics, the gas split
 * and the electrical side are gated in the engine package
 * (packages/engines/__tests__/production.esp.test.js) against an
 * independent oracle; what is gated here is the Suite layer: the chain
 * from the IPR through the PVT at intake to a traverse-derived
 * discharge pressure, the head decomposition, the operating point where
 * the pump curve meets the system curve, form validation and the legacy
 * import.
 */
import {
  mdAtTvd, tvdAtMdLocal, intakeConditions, tubingGor, dischargePressure,
  dutyAtRate, systemCurve, solveEspOperatingPoint, buildStageCurve,
  parseCurvePoints, runEspDesign, pumpVsSystem, stackHeadCurve, diagnose,
  importLegacyEspInputs, rateLadder,
} from '../esp';
import { computeIpr, pwfAtRate } from '@/utils/nodal/ipr';
import { buildFluidModel } from '@/utils/nodal/pvt';
import { buildTrajectory } from '@/utils/nodal/trajectory';
import { linearGeothermal } from '@/utils/nodal/temperature';
import { PSI_PER_FT_SG } from '../engine/espDesign';
import { REFERENCE_STAGES } from '../engine/espCatalog';

const DEPTH = 7500;
const fluidModel = buildFluidModel({ api: 32, gasSg: 0.75, gor: 120, salinityPpm: 30000 });
const trajectory = buildTrajectory({ mode: 'vertical', depthFt: DEPTH });
const tAt = linearGeothermal({ whtF: 100, bhtF: 190, tvdMaxFt: DEPTH });
// The classic ESP candidate: watered out, little gas, not enough
// pressure to lift its own column.
const ipr = computeIpr({ model: 'composite', pr: 2200, pb: 1500, pi: 0.5 });

const model = {
  fluidModel,
  trajectory,
  tAt,
  ipr,
  vlp: {
    idIn: 3.958,
    roughnessIn: 0.0006,
    correlation: 'beggsBrill',
    stepFt: 250,
    nodeMd: DEPTH,
  },
};

const duty = (over = {}) => dutyAtRate({
  model,
  qoStbd: 300,
  wct: 0.9,
  gorScfStb: 120,
  pumpTvdFt: 7000,
  pumpMd: 7000,
  perfTvdFt: DEPTH,
  annulusGradPsiPerFt: 0.4,
  separatorEfficiency: 0.7,
  whp: 200,
  ...over,
});

const baseForm = {
  designRateStbd: '300',
  wctPct: '90',
  gorScfStb: '120',
  pumpTvdFt: '7000',
  perfTvdFt: String(DEPTH),
  annulusGradPsiPerFt: '0.4',
  separatorEfficiencyPct: '70',
  whp: '200',
  hz: '60',
  nameplateHp: '250',
  nameplateVolts: '2400',
  nameplateAmps: '67',
  cableLengthFt: '7200',
  cableTempF: '180',
  maxDropPct: '5',
  powerFactor: '0.85',
  motorEfficiencyPct: '85',
  curveSource: 'reference',
  referenceStageId: 'ref-562-4000',
  curveRefHz: '60',
  curveText: '',
};

describe('depth conversion', () => {
  test('a vertical well maps both ways, and a deviated one stretches', () => {
    expect(mdAtTvd(trajectory, 3000)).toBeCloseTo(3000, 9);
    expect(tvdAtMdLocal(trajectory, 3000)).toBeCloseTo(3000, 9);
    const dev = buildTrajectory({
      mode: 'deviated',
      survey: [
        { md: 0, inc: 0, azi: 0 }, { md: 2000, inc: 0, azi: 0 },
        { md: 5000, inc: 45, azi: 90 }, { md: 9000, inc: 45, azi: 90 },
      ],
    });
    const md = mdAtTvd(dev, 5000);
    expect(md).toBeGreaterThan(5000);
    expect(tvdAtMdLocal(dev, md)).toBeCloseTo(5000, 6);
    expect(mdAtTvd({ points: [] }, 100)).toBe(0);
    expect(tvdAtMdLocal({ points: [] }, 100)).toBe(0);
  });
});

describe('intake conditions', () => {
  test('intake pressure is the IPR pressure less the annulus column', () => {
    const c = intakeConditions({
      model, qoStbd: 300, wct: 0.9, gorScfStb: 120,
      pumpTvdFt: 7000, perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4,
      separatorEfficiency: 0,
    });
    expect(c.pwfPsia).toBeCloseTo(pwfAtRate(ipr, 300), 9);
    expect(c.pipPsia).toBeCloseTo(c.pwfPsia - 0.4 * 500, 9);
    expect(c.tempF).toBeCloseTo(tAt(7000), 9);
  });

  test('a higher rate draws the well down and starves the intake', () => {
    const slow = intakeConditions({
      model, qoStbd: 150, wct: 0.9, gorScfStb: 120, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4,
    });
    const fast = intakeConditions({
      model, qoStbd: 600, wct: 0.9, gorScfStb: 120, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4,
    });
    expect(fast.pipPsia).toBeLessThan(slow.pipPsia);
    // and less pressure means more free gas at the intake
    expect(fast.stream.gvf).toBeGreaterThan(slow.stream.gvf);
  });

  test('an undersaturated intake has no free gas to separate', () => {
    // At this intake pressure the produced gas is still in solution, so
    // a separator has nothing to take and the pump sees liquid. The
    // studio must not manufacture a gas fraction here.
    const c = intakeConditions({
      model, qoStbd: 300, wct: 0.9, gorScfStb: 120, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.8,
    });
    expect(c.pvt.rs).toBeGreaterThanOrEqual(120 - 1e-9);
    expect(c.stream.freeGasScfd).toBe(0);
    expect(c.gas.gvfThroughPump).toBe(0);
  });

  test('the separator raises the gradient the head conversion uses', () => {
    // A gassier stream, so there is free gas at intake to take out.
    const none = intakeConditions({
      model, qoStbd: 300, wct: 0.5, gorScfStb: 1500, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4, separatorEfficiency: 0,
    });
    const most = intakeConditions({
      model, qoStbd: 300, wct: 0.5, gorScfStb: 1500, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.8,
    });
    expect(none.stream.freeGasScfd).toBeGreaterThan(0);
    expect(most.gradientPsiPerFt).toBeGreaterThan(none.gradientPsiPerFt);
    expect(most.gas.pumpIntakeBpd).toBeLessThan(none.gas.pumpIntakeBpd);
  });
});

describe('the tubing above the pump', () => {
  test('vented gas leaves the tubing stream, and none of it when there is no separator', () => {
    const c = intakeConditions({
      model, qoStbd: 300, wct: 0.5, gorScfStb: 1500, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.7,
    });
    const gorUp = tubingGor({ qoStbd: 300, gorScfStb: 1500, stream: c.stream, gas: c.gas });
    expect(gorUp).toBeLessThan(1500);
    expect(gorUp).toBeGreaterThanOrEqual(c.pvt.rs - 1e-9);
    const plain = intakeConditions({
      model, qoStbd: 300, wct: 0.5, gorScfStb: 1500, pumpTvdFt: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4, separatorEfficiency: 0,
    });
    expect(tubingGor({ qoStbd: 300, gorScfStb: 1500, stream: plain.stream, gas: plain.gas }))
      .toBeCloseTo(1500, 9);
  });

  test('discharge pressure is a traverse, and it grows with wellhead pressure and rate', () => {
    const low = dischargePressure({
      model, qoStbd: 300, wct: 0.9, gorTubingScfStb: 100, pumpMd: 7000, whp: 200,
    });
    const high = dischargePressure({
      model, qoStbd: 300, wct: 0.9, gorTubingScfStb: 100, pumpMd: 7000, whp: 400,
    });
    expect(low.ok).toBe(true);
    expect(low.pDischargePsia).toBeGreaterThan(200);
    expect(high.pDischargePsia).toBeGreaterThan(low.pDischargePsia);
    expect(low.points.length).toBeGreaterThan(5);
  });
});

describe('total dynamic head', () => {
  const d = duty();

  test('TDH is the pressure the pump adds over the gradient of what it pumps', () => {
    expect(d.dpPsi).toBeCloseTo(d.discharge.pDischargePsia - d.intake.pipPsia, 9);
    expect(d.tdhFt * d.intake.gradientPsiPerFt).toBeCloseTo(d.dpPsi, 6);
  });

  test('the three parts sum to the total exactly', () => {
    const b = d.breakdown;
    expect(b.netLiftFt + b.frictionFt + b.whpHeadFt).toBeCloseTo(b.tdhFt, 6);
    expect(b.tdhFt).toBeCloseTo(d.tdhFt, 6);
  });

  test('net lift dominates, which is the error the predecessor made', () => {
    // The old app set TDH = friction + wellhead head and staged an order
    // of magnitude short. On this well the lift term alone has to be
    // several thousand feet.
    expect(d.breakdown.netLiftFt).toBeGreaterThan(2000);
    expect(d.tdhFt).toBeGreaterThan(3 * (d.breakdown.frictionFt + d.breakdown.whpHeadFt));
  });

  test('setting the pump deeper buys submergence, not head', () => {
    // Deeper means a higher intake pressure, but the annulus column it
    // gains is lighter than the tubing column it adds, so the head goes
    // UP by about (1 - annulus gradient / pump gradient) per foot. The
    // trade is run-life and gas handling, not head, and the studio must
    // not suggest otherwise.
    const shallow = duty({ pumpTvdFt: 5000, pumpMd: 5000 });
    const deep = duty({ pumpTvdFt: 7400, pumpMd: 7400 });
    expect(deep.intake.pipPsia).toBeGreaterThan(shallow.intake.pipPsia);
    expect(deep.tdhFt).toBeGreaterThan(shallow.tdhFt);
    const perFoot = (deep.tdhFt - shallow.tdhFt) / 2400;
    const expectedPerFoot = 1 - 0.4 / deep.intake.gradientPsiPerFt;
    expect(Math.abs(perFoot - expectedPerFoot)).toBeLessThan(0.05);
  });
});

describe('system curve and operating point', () => {
  const rates = [150, 300, 500];

  test('the head the well demands rises with rate', () => {
    const rows = systemCurve({
      model, rates, wct: 0.9, gorScfStb: 120, pumpTvdFt: 7000, pumpMd: 7000,
      perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.7, whp: 200,
    });
    expect(rows).toHaveLength(3);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].tdhFt).toBeGreaterThan(rows[i - 1].tdhFt);
      expect(rows[i].pipPsia).toBeLessThan(rows[i - 1].pipPsia);
    }
  });

  test('a stack runs where its head equals the head the well demands', () => {
    const curve = buildStageCurve(baseForm);
    const op = solveEspOperatingPoint({
      model, curve, stages: 190, hz: 60, wct: 0.9, gorScfStb: 120,
      pumpTvdFt: 7000, pumpMd: 7000, perfTvdFt: DEPTH,
      annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.7, whp: 200, nScan: 7,
    });
    expect(op).not.toBeNull();
    expect(op.bracketed).toBe(true);
    expect(Math.abs(op.headFt - op.tdhFt)).toBeLessThan(15);
    expect(op.qoStbd).toBeGreaterThan(0);
  });

  test('a stack that cannot cross the system curve returns nothing rather than a guess', () => {
    const curve = buildStageCurve(baseForm);
    const op = solveEspOperatingPoint({
      model, curve, stages: 2, hz: 60, wct: 0.9, gorScfStb: 120,
      pumpTvdFt: 7000, pumpMd: 7000, perfTvdFt: DEPTH,
      annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.7, whp: 200, nScan: 5,
    });
    expect(op).toBeNull();
  });
});

describe('curve entry', () => {
  test('vendor points are parsed, and unusable lines are dropped rather than guessed', () => {
    const points = parseCurvePoints([
      '# rate, head, efficiency',
      '1500, 32, 55',
      '2000, 30.5, 68',
      'rubbish line',
      '2500; 28; 74',
      '',
      '3000\t24\t72',
    ].join('\n'));
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ qBpd: 1500, headFt: 32, efficiencyPct: 55 });
    expect(points[3].qBpd).toBe(3000);
  });

  test('a vendor curve is fitted, and a short one is refused', () => {
    const good = buildStageCurve({
      ...baseForm, curveSource: 'vendor',
      curveText: '1500,32,55\n2000,30.5,68\n2500,28,74\n3000,24,72\n3500,19,65',
    });
    expect(good.ok).toBe(true);
    expect(good.source).toBe('vendor');
    const short = buildStageCurve({ ...baseForm, curveSource: 'vendor', curveText: '1500,32' });
    expect(short.ok).toBe(false);
  });

  test('the reference model is labelled a model, not a vendor pump', () => {
    const curve = buildStageCurve(baseForm);
    expect(curve.source).toBe('reference-model');
    expect(curve.label).toMatch(/reference/i);
    expect(REFERENCE_STAGES.some((s) => s.id === baseForm.referenceStageId)).toBe(true);
  });
});

describe('the design run', () => {
  test('a complete form sizes a pump, a motor and a cable', () => {
    const { ok, errors, design } = runEspDesign({ form: baseForm, model });
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
    expect(design.sized.stages).toBeGreaterThan(10);
    expect(design.sized.shaftHp).toBeGreaterThan(0);
    expect(design.sized.headMarginFt).toBeGreaterThanOrEqual(0);
    expect(design.electrical.cable).not.toBeNull();
    expect(design.electrical.requirement.dropPct).toBeLessThanOrEqual(5);
    expect(design.duty.tdhFt).toBeGreaterThan(1000);
  });

  test('missing and contradictory inputs are refused with reasons', () => {
    expect(runEspDesign({ form: { ...baseForm, designRateStbd: '' }, model }).ok).toBe(false);
    const inverted = runEspDesign({
      form: { ...baseForm, pumpTvdFt: '8000' }, model,
    });
    expect(inverted.ok).toBe(false);
    expect(inverted.errors.join(' ')).toMatch(/cannot be set below the perforations/i);
  });

  test('a rate the inflow cannot deliver is refused, not extrapolated', () => {
    const res = runEspDesign({ form: { ...baseForm, designRateStbd: '99999' }, model });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/absolute open flow/i);
  });

  test('a gassy intake is called out with the number behind it', () => {
    const res = runEspDesign({
      form: { ...baseForm, gorScfStb: '1200', separatorEfficiencyPct: '0' }, model,
    });
    expect(res.ok).toBe(true);
    const codes = res.design.warnings.map((w) => w.code);
    expect(codes.some((c) => c === 'gasHandler' || c === 'separatorRequired')).toBe(true);
  });

  test('an impossible cable run is reported rather than silently sized', () => {
    const res = runEspDesign({
      form: {
        ...baseForm, cableLengthFt: '25000', nameplateVolts: '600', maxDropPct: '2',
      },
      model,
    });
    expect(res.ok).toBe(true);
    expect(res.design.electrical.cable).toBeNull();
    expect(res.design.warnings.map((w) => w.code)).toContain('noCable');
  });

  test('the pump and system curves share a rate axis for the design plot', () => {
    const { design, curve } = runEspDesign({ form: baseForm, model });
    const rows = pumpVsSystem({
      design, curve, model, form: baseForm, rates: rateLadder({ qMaxStbd: 600, nPoints: 4 }),
    });
    expect(rows).toHaveLength(4);
    rows.forEach((r) => {
      // the system head is a property of the well and is there on every
      // row; the PUMP head is only there where the stage curve can be
      // read, and past a tenth of its tested span it cannot be (item 5)
      expect(r.tdhFt).toBeGreaterThan(0);
      if (r.pumpOutsideCurve) {
        expect(r.pumpHeadFt).toBeNull();
        expect(r.pumpRefusal).toBe('outsideCurve');
      } else {
        expect(r.pumpHeadFt).toBeGreaterThan(0);
      }
    });
    // and the plot is not all refusals: the duty itself is on the curve
    expect(rows.some((r) => !r.pumpOutsideCurve)).toBe(true);
    const stack = stackHeadCurve({
      curve, stages: design.sized.stages, hz: 60,
      specificGravity: design.duty.intake.specificGravity, nPoints: 6,
    });
    expect(stack).toHaveLength(6);
  });

  test('diagnostics are reachable from the same module', () => {
    const { design, curve } = runEspDesign({ form: baseForm, model });
    const d = diagnose({
      curve,
      stages: design.sized.stages,
      hz: 60,
      specificGravity: design.duty.intake.specificGravity,
      measured: { qBpd: design.duty.pumpIntakeBpd, headFt: design.duty.tdhFt },
    });
    expect(d.headRatio).toBeGreaterThan(0.9);
    expect(d.headRatio).toBeLessThan(1.2);
  });
});

describe('legacy Artificial Lift Designer import', () => {
  const legacy = {
    targetRate: 2500, wellDepth: 7500, pumpDepth: 7000, whp: 150, waterCut: 50,
    gor: 500, oilApi: 32, gasGravity: 0.75, tubingID: 3.958, casingID: 6.366,
    frequency: 60, pumpModel: 'REDADN2600',
  };

  test('the fields that mean the same thing come across', () => {
    const { patch, mapped } = importLegacyEspInputs(legacy);
    expect(patch.designRateStbd).toBe('2500');
    expect(patch.pumpTvdFt).toBe('7000');
    expect(patch.perfTvdFt).toBe('7500');
    expect(patch.hz).toBe('60');
    expect(mapped).toHaveLength(11);
  });

  test('the invented pump model is refused rather than mapped to something', () => {
    const { patch, unmapped } = importLegacyEspInputs(legacy);
    expect(patch.pumpModel).toBeUndefined();
    expect(patch.referenceStageId).toBeUndefined();
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toMatch(/invented curves/i);
  });

  test('nothing to import is not an error', () => {
    expect(importLegacyEspInputs(null)).toEqual({ patch: {}, mapped: [], unmapped: [] });
  });
});

describe('rate ladder', () => {
  test('it spans the inflow without touching the open-flow limit', () => {
    const ladder = rateLadder({ qMaxStbd: 600, nPoints: 5 });
    expect(ladder).toHaveLength(5);
    expect(ladder[0]).toBeGreaterThan(0);
    expect(ladder[ladder.length - 1]).toBeLessThan(600);
  });
});
