/**
 * Production P9 advisor gates.
 *
 * Two layers, gated separately because they are different kinds of
 * thing. The screening is a rules matrix and what is checked is that
 * its rules land where an engineer would expect on the archetypes.
 * The design pass runs four validated chains against ONE shared well
 * record, and what is checked is that it reaches the same answers the
 * studios do, refuses honestly, and never reports a design that misses
 * the target as a success.
 */
import {
  LIFT_METHODS, liftMethod, screenLift, screeningInputsFromModel,
} from '../liftScreening';
import {
  ROD_TRIALS, RATE_TOLERANCE, pickReferenceStage, pickMotorFrame,
  designEsp, designGasLift, designRodPump, designPlunger,
  runDesignPass, reconcile,
} from '../liftAdvisor';
import { defaultWellInputs, buildWellModel } from '../wellModel';

const wellFor = (tweak) => {
  const inputs = defaultWellInputs();
  tweak(inputs);
  return { inputs, model: buildWellModel(inputs) };
};

// The classic ESP candidate: deep, watered out, not enough pressure to flow.
const espWell = () => wellFor((i) => {
  i.well.depthFt = '7500';
  i.inflow.pr = '2200';
  i.inflow.pb = '1500';
  i.inflow.pi = '0.5';
  i.fluid.gor = '120';
  i.completion.idIn = '3.958';
});

// A shallow stripper: everything works, and the cheapest should win.
const stripperWell = () => wellFor((i) => {
  i.well.depthFt = '4000';
  i.inflow.pr = '900';
  i.inflow.pb = '600';
  i.inflow.pi = '0.4';
  i.fluid.gor = '150';
  i.fluid.api = '30';
  i.completion.idIn = '2.441';
});

describe('the screening matrix', () => {
  it('covers six methods and says which of them this Suite can design', () => {
    expect(LIFT_METHODS).toHaveLength(6);
    const engineBacked = LIFT_METHODS.filter((m) => m.hasEngine).map((m) => m.id);
    expect(engineBacked.sort()).toEqual(['esp', 'gasLift', 'plunger', 'rodPump']);
    // The two without an engine carry no studio to hand off to, which
    // is what stops the UI offering a design that does not exist.
    LIFT_METHODS.filter((m) => !m.hasEngine).forEach((m) => expect(m.studio).toBeNull());
    expect(liftMethod('pcp').label).toMatch(/Progressing cavity/);
    expect(liftMethod('nonsense')).toBeNull();
  });

  it('picks the right method on each archetype', () => {
    const top = (inputs) => screenLift(inputs)[0].id;
    // Deep, high rate, power and gas available.
    expect(['esp', 'gasLift']).toContain(top({
      targetLiquidRateBpd: 3000, depthFt: 9000, gor: 800, api: 35, bhtF: 210,
      powerAvailable: true, gasAvailable: true,
    }));
    // Shallow stripper with no gas: rod pumping, which is what most of
    // the world's wells actually run.
    expect(top({
      targetLiquidRateBpd: 60, depthFt: 4000, gor: 200, api: 30, bhtF: 130,
      powerAvailable: true, gasAvailable: false,
    })).toBe('rodPump');
    // A gassy well making almost no liquid is a plunger well.
    expect(top({
      targetLiquidRateBpd: 25, depthFt: 8000, gor: 20000, api: 50, bhtF: 200,
      powerAvailable: false, gasAvailable: false,
    })).toBe('plunger');
    // Heavy viscous crude with sand is what a PCP is best in the world at.
    expect(top({
      targetLiquidRateBpd: 300, depthFt: 3000, gor: 50, api: 14, bhtF: 120,
      hasSand: true, powerAvailable: true, gasAvailable: false,
    })).toBe('pcp');
  });

  it('a missing facility is decisive, because it should be', () => {
    const base = {
      targetLiquidRateBpd: 2000, depthFt: 8000, gor: 400, api: 33, bhtF: 200,
      powerAvailable: true, gasAvailable: true,
    };
    const withPower = screenLift(base).find((r) => r.id === 'esp').score;
    const without = screenLift({ ...base, powerAvailable: false })
      .find((r) => r.id === 'esp').score;
    expect(without).toBeLessThan(withPower - 40);
    const withGas = screenLift(base).find((r) => r.id === 'gasLift').score;
    const noGas = screenLift({ ...base, gasAvailable: false })
      .find((r) => r.id === 'gasLift').score;
    expect(noGas).toBeLessThan(withGas - 40);
  });

  it('rod pumping is limited by depth AND rate together, not either alone', () => {
    // The duty index is the thing that actually binds a rod string, and
    // a screening that looked at rate alone would pass deep wells it
    // should not.
    const shallowFast = screenLift({
      targetLiquidRateBpd: 800, depthFt: 2000, gor: 100, api: 30, bhtF: 130,
    }).find((r) => r.id === 'rodPump').score;
    const deepSlow = screenLift({
      targetLiquidRateBpd: 800, depthFt: 11000, gor: 100, api: 30, bhtF: 130,
    }).find((r) => r.id === 'rodPump').score;
    expect(deepSlow).toBeLessThan(shallowFast);
  });

  it('every reason is typed and spelled out, because the score is not the output', () => {
    screenLift({ targetLiquidRateBpd: 500, depthFt: 6000, gor: 300, api: 30, bhtF: 180 })
      .forEach((r) => {
        expect(r.reasons.length).toBeGreaterThan(1);
        r.reasons.forEach((x) => {
          expect(['pro', 'con', 'neutral']).toContain(x.type);
          expect(x.text.length).toBeGreaterThan(20);
        });
      });
  });

  it('recommends a band rather than a winner, because a score cannot separate close candidates', () => {
    const rows = screenLift({
      targetLiquidRateBpd: 3000, depthFt: 9000, gor: 800, api: 35, bhtF: 210,
      powerAvailable: true, gasAvailable: true,
    });
    const recommended = rows.filter((r) => r.recommended);
    expect(recommended.length).toBeGreaterThan(1);
    recommended.forEach((r) => expect(r.score).toBeGreaterThan(50));
  });

  it('reads what it can from the well model rather than asking twice', () => {
    const { model } = espWell();
    const derived = screeningInputsFromModel(model, { targetLiquidRateBpd: 300, wctPct: 90 });
    expect(derived.depthFt).toBe(7500);
    expect(derived.api).toBeCloseTo(32, 6);
    expect(derived.bhtF).toBeGreaterThan(100);
    expect(screeningInputsFromModel(null)).toEqual({});
  });
});

describe('equipment selection for a screening-grade pass', () => {
  it('picks the reference stage whose published range covers the duty', () => {
    const stage = pickReferenceStage(2500);
    expect(2500).toBeGreaterThanOrEqual(stage.qMin);
    expect(2500).toBeLessThanOrEqual(stage.qMax);
    // and falls back to the nearest best-efficiency point off the ends
    expect(pickReferenceStage(50).bepBpd).toBe(1000);
    expect(pickReferenceStage(99999).bepBpd).toBe(7000);
  });

  it('picks the smallest motor with headroom over the shaft load', () => {
    const m = pickMotorFrame(100);
    expect(m.hp).toBeGreaterThanOrEqual(125);
    expect(pickMotorFrame(1e6).hp).toBe(400);
  });

  it('the rod ladder climbs, so a bigger well gets a bigger unit', () => {
    for (let i = 1; i < ROD_TRIALS.length; i += 1) {
      const prev = ROD_TRIALS[i - 1];
      const here = ROD_TRIALS[i];
      expect(here.plungerDIn * here.strokeIn * here.spm)
        .toBeGreaterThan(prev.plungerDIn * prev.strokeIn * prev.spm);
    }
    expect(RATE_TOLERANCE).toBeGreaterThan(0.5);
    expect(RATE_TOLERANCE).toBeLessThanOrEqual(1);
  });
});

describe('the design pass', () => {
  const facility = {
    injectionPsig: 900, injectionMscfd: 500, injGasSg: 0.65,
    separatorEfficiencyPct: 70, casingPressurePsia: 600,
    slugLengthFt: 150, plungerWeightLb: 6,
  };

  // ITEM 19. The duty at the door is LIQUID, and the chains design on
  // the oil derived from it. A classic ESP candidate is a well making
  // thousands of barrels of liquid: 3,000 bbl/d at 90 per cent water cut
  // is 300 stb/d of oil, which is the number this case used to pass as
  // the "rate" and design 3,000 bbl/d of liquid on. Same well, same
  // physical duty, stated in the units the parameter names.
  it('designs an ESP on a classic ESP candidate, with real numbers', () => {
    const { model } = espWell();
    const r = designEsp({
      model, targetLiquidRateBpd: 3000, wctPct: 90, gorScfStb: 120, whp: 200, facility,
    });
    expect(r.ok).toBe(true);
    expect(r.id).toBe('esp');
    expect(r.studio).toBe('esp-design-studio');
    expect(r.equipment).toMatch(/stages/);
    const stages = r.design.sized.stages;
    expect(stages).toBeGreaterThan(20);
    // The net lift dominates on a well like this, which is the defect
    // P5 existed to fix.
    expect(r.design.duty.breakdown.netLiftFt)
      .toBeGreaterThan(0.5 * r.design.duty.tdhFt);
  });

  it('refuses to put a pump on a well that flows on its own', () => {
    const { model } = wellFor((i) => {
      i.well.depthFt = '9000';
      i.inflow.pr = '3400';
      i.inflow.pb = '2600';
      i.inflow.pi = '1.2';
      i.fluid.gor = '900';
      i.completion.idIn = '2.992';
    });
    const r = designEsp({
      model, targetLiquidRateBpd: 900, wctPct: 40, gorScfStb: 900, whp: 200, facility,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/flows on its own/);
  });

  it('gas lift finds a real injection point and lifts the well', () => {
    const { model } = stripperWell();
    const r = designGasLift({
      model, targetLiquidRateBpd: 60, wctPct: 85, gorScfStb: 150, whp: 60,
      facility: { ...facility, injectionPsig: 600, injectionMscfd: 150 },
    });
    expect(r.ok).toBe(true);
    expect(r.design.point.depthFt).toBeGreaterThan(0);
    expect(r.design.point.depthFt).toBeLessThanOrEqual(model.tvdMax);
    expect(r.rateStbd).toBeGreaterThan(0);
  });

  it('gas lift refuses honestly when the pressure cannot reach', () => {
    const { model } = espWell();
    const r = designGasLift({
      model, targetLiquidRateBpd: 300, wctPct: 90, gorScfStb: 120, whp: 200,
      facility: { ...facility, injectionPsig: 120, injectionMscfd: 50 },
    });
    expect(r.ok).toBe(false);
    expect(r.reason.length).toBeGreaterThan(30);
  });

  it('a rod pump that designs but MISSES the target is a shortfall, not a success', () => {
    // The single most misleading thing this advisor could do is report
    // a clean design that delivers a third of the asked-for rate as a
    // method that works.
    // 3,000 bbl/d of liquid at 90 per cent water cut, which is 300 stb/d
    // of oil: far past what a rod pump swings at this depth.
    const { model } = espWell();
    const r = designRodPump({
      model, targetLiquidRateBpd: 3000, wctPct: 90, gorScfStb: 120, whp: 200,
    });
    expect(r.ok).toBe(false);
    expect(r.shortfall).toBeDefined();
    expect(r.shortfall.achievedBpd).toBeLessThan(r.shortfall.targetBpd);
    expect(r.reason).toMatch(/against a target of/);
    expect(r.triedCount).toBe(ROD_TRIALS.length);
  });

  it('a rod pump that meets the target reports the smallest unit that does', () => {
    const { model } = stripperWell();
    // 400 bbl/d of liquid at 85 per cent water cut is 60 stb/d of oil,
    // which is the duty this case has always been about.
    const r = designRodPump({
      model, targetLiquidRateBpd: 400, wctPct: 85, gorScfStb: 150, whp: 60,
    });
    expect(r.ok).toBe(true);
    expect(r.rateStbd).toBeGreaterThanOrEqual(60 * RATE_TOLERANCE);
    expect(r.design.worstSection.loadingPct).toBeLessThanOrEqual(100);
  });

  it('plunger lift is judged on the gas a cycle really needs', () => {
    const { model } = espWell();
    const r = designPlunger({
      model, targetLiquidRateBpd: 300, wctPct: 90, gorScfStb: 120, whp: 200, facility,
    });
    expect(r.ok).toBe(false);
    // The refusal quotes both the computed requirement and what the
    // well makes, rather than a rule of thumb.
    expect(r.reason).toMatch(/scf of gas per barrel/);
  });

  it('runs all four against one well and refuses an impossible target', () => {
    const { model } = espWell();
    const pass = runDesignPass({
      model, targetLiquidRateBpd: 300, wctPct: 90, gorScfStb: 120, whp: 200, facility,
    });
    expect(pass.ok).toBe(true);
    expect(pass.results).toHaveLength(4);
    expect(pass.results.every((r) => r.hasEngine)).toBe(true);

    const tooMuch = runDesignPass({
      model, targetLiquidRateBpd: 99999, wctPct: 90, gorScfStb: 120, whp: 200, facility,
    });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.errors.join(' ')).toMatch(/absolute open flow/);
  });

  it('refuses a gas-well record, because this pass designs lift for an oil well', () => {
    const gas = defaultWellInputs();
    gas.well.phase = 'gas';
    gas.gasInflow = { ...gas.gasInflow, model: 'backPressure', c: '0.0025', n: '0.87' };
    const pass = runDesignPass({
      model: buildWellModel(gas), targetLiquidRateBpd: 300, wctPct: 50, gorScfStb: 500, whp: 200, facility,
    });
    expect(pass.ok).toBe(false);
    expect(pass.errors.join(' ')).toMatch(/gas/i);
  });
}, 120000);

describe('reconciling screening against design', () => {
  it('names the disagreements rather than quietly resolving them', () => {
    const screening = [
      { id: 'esp', label: 'ESP', hasEngine: true, score: 90, recommended: true, reasons: [] },
      { id: 'rodPump', label: 'Rod pump', hasEngine: true, score: 40, recommended: false, reasons: [] },
      { id: 'pcp', label: 'PCP', hasEngine: false, score: 70, recommended: true, reasons: [] },
    ];
    const designPass = {
      results: [
        { id: 'esp', ok: false, reason: 'refused' },
        { id: 'rodPump', ok: true, equipment: 'a unit' },
      ],
    };
    const out = reconcile({ screening, designPass });
    const esp = out.rows.find((r) => r.id === 'esp');
    const rod = out.rows.find((r) => r.id === 'rodPump');
    const pcp = out.rows.find((r) => r.id === 'pcp');
    expect(esp.verdict).toBe('designNo');
    expect(esp.note).toMatch(/design is the one that solved the well/);
    expect(rod.verdict).toBe('designYes');
    expect(pcp.verdict).toBe('noEngine');
    expect(pcp.note).toMatch(/no validated engine/);
    expect(out.disagreements.map((r) => r.id).sort()).toEqual(['esp', 'rodPump']);
  });

  it('ranks what demonstrably works above what merely scores well', () => {
    const screening = [
      { id: 'esp', label: 'ESP', hasEngine: true, score: 95, recommended: true, reasons: [] },
      { id: 'rodPump', label: 'Rod pump', hasEngine: true, score: 30, recommended: false, reasons: [] },
    ];
    const designPass = {
      results: [
        { id: 'esp', ok: false, reason: 'refused' },
        { id: 'rodPump', ok: true, equipment: 'a unit' },
      ],
    };
    const out = reconcile({ screening, designPass });
    expect(out.ranked[0].id).toBe('rodPump');
    expect(out.workable.map((r) => r.id)).toEqual(['rodPump']);
  });

  it('with no design pass it is screening alone, and says nothing worked', () => {
    const screening = [
      { id: 'esp', label: 'ESP', hasEngine: true, score: 90, recommended: true, reasons: [] },
    ];
    const out = reconcile({ screening, designPass: null });
    expect(out.rows[0].verdict).toBe('notRun');
    expect(out.workable).toHaveLength(0);
    expect(out.disagreements).toHaveLength(0);
  });
});
