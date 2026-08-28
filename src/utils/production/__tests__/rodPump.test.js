/**
 * Production P6 rod pump studio gates. The mechanics, the wave equation
 * and the unit kinematics are gated in the engine package
 * (packages/engines/__tests__/production.rodpump.test.js) against an
 * independent oracle; what is gated here is the Suite layer: the chain
 * from the IPR through the intake pressure to a fluid load, the fillage
 * the free gas leaves, form validation and its refusals, the speed
 * sweep, the measured-card diagnosis and the legacy import.
 */
import {
  PSI_PER_FT_SG, intakeConditions, liquidGravity, dischargePressure, gasFillage,
  buildStringFromForm, buildUnit, parseSections, runDesign, speedSweep,
  parseMeasuredCard, diagnoseMeasured, suggestTaper, importLegacyRodInputs,
  displacementBpd, fluidLoadLb,
} from '../rodPump';
import { computeIpr } from '@/utils/nodal/ipr';
import { buildFluidModel } from '@/utils/nodal/pvt';
import { buildTrajectory } from '@/utils/nodal/trajectory';
import { linearGeothermal } from '@/utils/nodal/temperature';

const DEPTH = 5000;
// The classic rod pump candidate: shallow, watered out, low rate, and
// nowhere near enough pressure to flow.
const model = {
  fluidModel: buildFluidModel({ api: 30, gasSg: 0.7, gor: 80, salinityPpm: 30000 }),
  trajectory: buildTrajectory({ mode: 'vertical', depthFt: DEPTH }),
  tAt: linearGeothermal({ whtF: 90, bhtF: 150, tvdMaxFt: DEPTH }),
  ipr: computeIpr({ model: 'composite', pr: 1200, pb: 800, pi: 0.6 }),
  tvdMax: DEPTH,
};

const baseForm = {
  designRateStbd: '120',
  wctPct: '80',
  gorScfStb: '80',
  pumpTvdFt: '4800',
  strokeIn: '64',
  spm: '8',
  plungerDIn: '1.75',
  whp: '80',
  annulusGradPsiPerFt: '0.38',
  separatorEfficiencyPct: '60',
  pumpEfficiencyPct: '90',
  serviceFactor: '1',
  api: '30',
  gradeId: 'D',
  sectionsText: '7/8, 2400\n3/4, 2400',
  unitSource: 'generic',
  unitDesignation: 'C-228D-200-74',
  structuralUnbalanceLb: '0',
  crankOffsetDeg: '0',
};

describe('intake conditions', () => {
  it('works the intake pressure back from the inflow, not from a typed number', () => {
    const c = intakeConditions({
      model, qoStbd: 120, pumpTvdFt: 4800, perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.38,
    });
    expect(c.pwfPsia).toBeGreaterThan(0);
    expect(c.pwfPsia).toBeLessThan(1200);
    // 200 ft of annulus below the pump, at 0.38 psi/ft
    expect(c.pipPsia).toBeCloseTo(c.pwfPsia - 0.38 * 200, 6);
    expect(c.submergenceFt).toBeCloseTo((c.pipPsia - 14.7) / 0.38, 6);
  });

  it('a harder drawdown gives less submergence', () => {
    const at = (q) => intakeConditions({
      model, qoStbd: q, pumpTvdFt: 4800, perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.38,
    });
    expect(at(300).submergenceFt).toBeLessThan(at(80).submergenceFt);
  });

  it('never reports an intake below atmospheric', () => {
    const c = intakeConditions({
      model, qoStbd: 120, pumpTvdFt: 100, perfTvdFt: DEPTH, annulusGradPsiPerFt: 0.45,
    });
    expect(c.pipPsia).toBeGreaterThanOrEqual(14.7);
  });
});

describe('the liquid the plunger lifts', () => {
  it('mixes oil and water by cut', () => {
    const dry = liquidGravity({ api: 30, wct: 0 });
    const wet = liquidGravity({ api: 30, wct: 1 });
    expect(wet).toBeCloseTo(1.0, 9);
    expect(dry).toBeCloseTo(141.5 / 161.5, 9);
    expect(liquidGravity({ api: 30, wct: 0.5 })).toBeCloseTo((dry + 1) / 2, 9);
  });

  it('the discharge pressure is the liquid column plus the wellhead', () => {
    const p = dischargePressure({ pumpTvdFt: 4800, liquidSg: 0.96, whp: 80 });
    expect(p).toBeCloseTo(80 + PSI_PER_FT_SG * 0.96 * 4800, 9);
    // and tubing pressure ADDS to it, which the predecessor had backwards
    expect(dischargePressure({ pumpTvdFt: 4800, liquidSg: 0.96, whp: 200 }))
      .toBeGreaterThan(p);
  });
});

describe('barrel fillage from the gas that is really there', () => {
  it('a stream with no free gas fills the barrel', () => {
    const pvt = { bo: 1.1, bw: 1.0, bg: 0.005, rs: 200 };
    const g = gasFillage({ qoStbd: 100, wct: 0.8, gorScfStb: 80, pvt });
    expect(g.freeGasScfd).toBe(0);
    expect(g.fillage).toBeCloseTo(1, 9);
  });

  it('free gas takes barrel volume, and a gas anchor gives it back', () => {
    const pvt = { bo: 1.1, bw: 1.0, bg: 0.004, rs: 40 };
    const none = gasFillage({ qoStbd: 100, wct: 0.5, gorScfStb: 300, pvt, separatorEfficiency: 0 });
    const anchored = gasFillage({ qoStbd: 100, wct: 0.5, gorScfStb: 300, pvt, separatorEfficiency: 0.8 });
    expect(none.fillage).toBeLessThan(1);
    expect(anchored.fillage).toBeGreaterThan(none.fillage);
    expect(anchored.gasThroughPumpResBpd).toBeCloseTo(0.2 * none.freeGasResBpd, 9);
    // fillage is the liquid share of what the barrel swallows
    expect(none.fillage).toBeCloseTo(
      none.liquidResBpd / (none.liquidResBpd + none.gasThroughPumpResBpd), 9,
    );
  });
});

describe('reading what the user typed', () => {
  it('parses a taper, one section per line, and ignores blanks and comments', () => {
    const s = parseSections('# taper\n7/8, 2400\n\n3/4, 2400\nrubbish\n');
    expect(s).toEqual([{ size: '7/8', lengthFt: 2400 }, { size: '3/4', lengthFt: 2400 }]);
  });

  it('builds the string with the fractions read as fractions', () => {
    const s = buildStringFromForm({
      sections: parseSections('7/8, 2400\n3/4, 2400'), liquidSg: 0.96, gradeId: 'D',
    });
    expect(s.ok).toBe(true);
    expect(s.lengthFt).toBe(4800);
    expect(s.sections[0].dIn).toBeCloseTo(0.875, 9);
    expect(s.sections[0].areaIn2).toBeLessThan(1);
  });

  it('a generic unit says it is generic; typed dimensions are used as given', () => {
    const g = buildUnit({ unitSource: 'generic', strokeIn: '64' });
    expect(g.ok).toBe(true);
    expect(g.generic).toBe(true);
    expect(g.kin.strokeIn).toBeCloseTo(64, 1);
    const d = buildUnit({
      unitSource: 'dimensions', aIn: '106.67', cIn: '64', pIn: '80',
      crankBehindIn: '92.8', crankBelowIn: '60.8', rIn: '28.8',
    });
    expect(d.ok).toBe(true);
    expect(d.generic).toBe(false);
  });

  it('a linkage that cannot close is reported', () => {
    const d = buildUnit({
      unitSource: 'dimensions', aIn: '100', cIn: '60', pIn: '5',
      crankBehindIn: '90', crankBelowIn: '60', rIn: '30',
    });
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/does not close/);
  });

  it('reads a measured card and refuses one too short to read', () => {
    const card = parseMeasuredCard('0, 9000\n10, 12000\n20, 11000\n# note\nbad line');
    expect(card).toHaveLength(3);
    expect(card[1]).toMatchObject({ positionIn: 10, loadLb: 12000 });
    expect(diagnoseMeasured({ string: { ok: true }, card, spm: 8 }).ok).toBe(false);
  });
});

describe('the design run', () => {
  it('sizes a complete installation on the default well', () => {
    const res = runDesign({ form: baseForm, model });
    expect(res.ok).toBe(true);
    const d = res.design;
    // The plunger stroke is shorter than the surface stroke: the rods
    // stretch before the plunger moves.
    expect(d.plungerStrokeIn).toBeLessThan(64);
    expect(d.groups.spOverS).toBeLessThan(1);
    // The load brackets the buoyed rod weight.
    expect(d.pprlLb).toBeGreaterThan(res.string.weightFluidLb);
    expect(d.mprlLb).toBeLessThan(res.string.weightFluidLb);
    expect(d.mprlLb).toBeGreaterThan(0);
    // The unit is balanced and inside its ratings.
    expect(d.balance.balanced).toBe(true);
    expect(d.rating.torquePct).toBeLessThan(100);
    expect(d.rating.structuralPct).toBeLessThan(100);
    // The fluid load is the differential across the plunger.
    expect(d.fluidLoadLb).toBeCloseTo(
      fluidLoadLb({
        plungerDIn: 1.75, pDischargePsi: d.pDischargePsi, pIntakePsi: d.intake.pipPsia,
      }), 6,
    );
  });

  it('production follows the plunger stroke, not the polished rod stroke', () => {
    const res = runDesign({ form: baseForm, model });
    const d = res.design;
    expect(d.sweptBpd).toBeLessThan(d.ratedBpd);
    expect(d.producedBpd).toBeCloseTo(d.sweptBpd * d.gas.fillage * 0.9, 6);
    expect(d.sweptBpd).toBeCloseTo(
      displacementBpd({ plungerDIn: 1.75, strokeIn: d.plungerStrokeIn, spm: 8 }), 6,
    );
  });

  it('refuses a missing number with the field name rather than defaulting it', () => {
    const res = runDesign({ form: { ...baseForm, plungerDIn: '' }, model });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Plunger diameter/);
    expect(res.design).toBeNull();
  });

  it('refuses a rod string that does not reach its pump', () => {
    const res = runDesign({ form: { ...baseForm, sectionsText: '7/8, 2000' }, model });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/reaches its pump/);
  });

  it('refuses a pump set below the perforations', () => {
    const res = runDesign({
      form: { ...baseForm, pumpTvdFt: '5400', sectionsText: '7/8, 2700\n3/4, 2700' }, model,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/below the perforations/);
  });

  it('refuses a rate at or above the absolute open flow, naming it', () => {
    const qMax = model.ipr.qmax;
    const res = runDesign({
      form: { ...baseForm, designRateStbd: String(Math.ceil(qMax) + 10) }, model,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/absolute open flow/);
  });

  it('refuses an unreadable rod size instead of inventing a diameter', () => {
    const res = runDesign({ form: { ...baseForm, sectionsText: 'seven eighths, 4800' }, model });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/could not be read/);
  });

  it('names a barrel that free gas is keeping empty', () => {
    // Gassy and lightly watered, with no gas anchor.
    const gassy = {
      ...model,
      fluidModel: buildFluidModel({ api: 35, gasSg: 0.7, gor: 900, salinityPpm: 30000 }),
    };
    const res = runDesign({
      form: { ...baseForm, gorScfStb: '900', wctPct: '10', separatorEfficiencyPct: '0' },
      model: gassy,
    });
    expect(res.ok).toBe(true);
    expect(res.design.gas.fillage).toBeLessThan(1);
    const codes = res.design.warnings.map((w) => w.code);
    expect(codes.some((c) => c === 'gasInterference' || c === 'incompleteFillage')).toBe(true);
  });
});

describe('the speed sweep', () => {
  it('produces more the faster it is pumped, and loads the rods harder for it', () => {
    const sweep = speedSweep({ form: baseForm, model, spms: [4, 6, 8, 10] });
    expect(sweep.every((s) => s.ok)).toBe(true);
    for (let i = 1; i < sweep.length; i += 1) {
      expect(sweep[i].producedBpd).toBeGreaterThan(sweep[i - 1].producedBpd);
      expect(sweep[i].loadingPct).toBeGreaterThan(sweep[i - 1].loadingPct);
    }
  });

  it('a speed that cannot be designed is reported rather than dropped', () => {
    const sweep = speedSweep({ form: baseForm, model, spms: [8, 400] });
    expect(sweep[0].ok).toBe(true);
    expect(sweep[1].ok).toBe(false);
    expect(sweep[1].reason).toBeTruthy();
  });
}, 60000);

describe('diagnosing a measured card', () => {
  it('reads a predicted installation back off its own surface card', () => {
    const res = runDesign({ form: baseForm, model });
    const surface = res.design.dynamics.surfaceCard;
    const d = diagnoseMeasured({
      string: res.string, card: surface, spm: 8, dampingRatio: 0.1,
    });
    expect(d.ok).toBe(true);
    // The fluid load it reads back is the one the design was built on.
    expect(Math.abs(d.fluidLoadLb - res.design.fluidLoadLb) / res.design.fluidLoadLb)
      .toBeLessThan(0.1);
    // A full pump carries the load for about half the plunger cycle.
    expect(d.fillageEstimate).toBeGreaterThan(0.3);
    expect(d.fillageEstimate).toBeLessThan(0.7);
  });

  it('refuses without a rod string, because the card cannot be propagated', () => {
    expect(diagnoseMeasured({ string: null, card: [], spm: 8 }).ok).toBe(false);
  });
}, 60000);

describe('taper suggestion', () => {
  it('proposes lengths that fill the string and put the big rods on top', () => {
    const t = suggestTaper({
      pumpTvdFt: 4800, sizes: ['7/8', '3/4'], plungerDIn: 1.75,
      pDischargePsi: 2100, pIntakePsi: 900, liquidSg: 0.96,
    });
    expect(t.ok).toBe(true);
    expect(t.sections.reduce((a, s) => a + s.lengthFt, 0)).toBeCloseTo(4800, 6);
    expect(t.sections[0].size).toBe('7/8');
  });
});

describe('legacy Artificial Lift Designer import', () => {
  it('carries the well numbers and refuses to carry the rod string', () => {
    const { patch, mapped, unmapped } = importLegacyRodInputs({
      pumpDepth: 4500, liquidRate: 90, tubingPressure: 120, waterCut: 75,
      oilApi: 28, strokeLength: 54, pumpingSpeed: 7, pumpDiameter: 1.5,
      rodString: '7/8, 3/4',
    });
    expect(patch.pumpTvdFt).toBe('4500');
    expect(patch.designRateStbd).toBe('90');
    expect(patch.whp).toBe('120');
    expect(patch.wctPct).toBe('75');
    expect(patch.strokeIn).toBe('54');
    expect(patch.spm).toBe('7');
    expect(patch.plungerDIn).toBe('1.5');
    expect(mapped.length).toBe(8);
    // The old tab read 7/8 as 7.8 inches, so any saved string describes
    // rods that do not exist and there is nothing honest to import.
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toMatch(/7\.8 inches/);
  });

  it('an empty legacy record maps nothing rather than throwing', () => {
    expect(importLegacyRodInputs(null).mapped).toEqual([]);
    expect(importLegacyRodInputs({}).unmapped).toEqual([]);
  });
});
