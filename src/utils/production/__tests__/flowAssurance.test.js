/**
 * Gates for the Flow Assurance computation layer (Production P10).
 *
 * The thermal and inhibition physics are gated in the engine package
 * against an SI oracle. These gate the COUPLING, which is where a flow
 * assurance study actually goes wrong: that the trace is continuous
 * from the perforations to the arrival, that the choke step cools, that
 * the flowline march re-evaluates properties at the temperature the
 * thermal model puts the line at, and that the hydrate question is
 * asked at every station rather than at the arrival only.
 */
import {
  streamMass, brineSg, buildLayers, legU, marchLeg, chokeStep, scoreTrace,
  dutyRates, runFlowAssurance, insulationSweep, DEFAULT_CP,
} from '../flowAssurance';
import { buildWellModel, defaultWellInputs } from '../wellModel';

const oilWell = () => {
  const w = defaultWellInputs();
  w.well.depthFt = '8000';
  w.well.whtF = '150';
  w.well.bhtF = '210';
  w.fluid.api = '32';
  w.fluid.gasSg = '0.7';
  w.fluid.gor = '600';
  w.inflow.pr = '3200';
  w.inflow.pb = '2200';
  w.inflow.calMode = 'pi';
  w.inflow.pi = '1.5';
  w.completion.idIn = '2.992';
  return w;
};

const baseForm = () => ({
  duty: { qoStbd: '1200', wctPct: '20', gor: '600', whpPsia: '900' },
  choke: { pDownPsia: '400', jtCoeffFPerPsi: '0.04' },
  flowline: {
    enabled: true, lengthFt: '26400', idIn: '6', wallIn: '0.5',
    ambientTempF: '39', insideFilmId: 'multiphaseFlowing', outsideFilmId: 'seawaterCurrent',
    burialFt: '0', roughnessIn: '0.0018',
    coatings: [{ id: 'c1', materialId: 'syntacticPP', thicknessIn: '1.5' }],
  },
  riser: { enabled: false },
  thermal: {},
  hydrate: {},
  inhibitor: { inhibitorId: 'methanol', safetyMarginF: '5', leanWtPct: '100' },
  cooldown: {},
});

const run = (mutate) => {
  const form = baseForm();
  if (mutate) mutate(form);
  return runFlowAssurance({ form, model: buildWellModel(oilWell()) });
};

describe('stream mass', () => {
  it('is surface rates times standard densities, and nothing else', () => {
    const m = streamMass({ qoStbd: 1000, qwStbd: 250, qgMscfd: 600, api: 32, gasSg: 0.7 });
    // 1000 stb/d oil, sg = 141.5/163.5 = 0.86544, 62.428 lb/ft3 fresh
    const rhoO = 62.428 * (141.5 / 163.5);
    expect(m.oilLbHr).toBeCloseTo((1000 * 5.614583 * rhoO) / 24, 6);
    expect(m.gasLbHr).toBeCloseTo((600 * 1000 * 0.076362 * 0.7) / 24, 6);
    expect(m.fractions.oil + m.fractions.water + m.fractions.gas).toBeCloseTo(1, 12);
  });

  it('mixes heat capacity by MASS, so a watery stream is nearly water', () => {
    const dry = streamMass({ qoStbd: 1000, qwStbd: 0, qgMscfd: 0, api: 32, gasSg: 0.7 });
    const wet = streamMass({ qoStbd: 10, qwStbd: 990, qgMscfd: 0, api: 32, gasSg: 0.7 });
    expect(dry.cpBtuLbF).toBeCloseTo(DEFAULT_CP.oil, 6);
    expect(wet.cpBtuLbF).toBeGreaterThan(0.97);
    expect(wet.cpBtuLbF).toBeLessThan(DEFAULT_CP.water);
  });

  it('refuses a zero-rate stream and says why it is a different problem', () => {
    const m = streamMass({ qoStbd: 0, qwStbd: 0, qgMscfd: 0, api: 32, gasSg: 0.7 });
    expect(m.ok).toBe(false);
    expect(m.error).toMatch(/cooldown problem/);
  });

  it('salt makes the water heavier', () => {
    expect(brineSg(0)).toBe(1);
    expect(brineSg(100000)).toBeCloseTo(1.0695, 6);
  });
});

describe('insulation stack', () => {
  it('stacks coatings off each other, so thicknesses do not have to be added by hand', () => {
    const s = buildLayers({
      idIn: 6, wallIn: 0.5,
      coatings: [{ materialId: 'syntacticPP', thicknessIn: 1.5 }, { materialId: 'concrete', thicknessIn: 2 }],
    });
    expect(s.layers).toHaveLength(3);
    expect(s.layers[0].odIn).toBe(7);
    expect(s.layers[1].idIn).toBe(7);
    expect(s.layers[1].odIn).toBe(10);
    expect(s.layers[2].idIn).toBe(10);
    expect(s.outerOdIn).toBe(14);
  });

  it('insulation dominates the stack, which is the whole reason it is there', () => {
    const bare = legU({ idIn: 6, wallIn: 0.5, coatings: [], insideFilmId: 'multiphaseFlowing', outsideFilmId: 'seawaterCurrent' });
    const insulated = legU({
      idIn: 6, wallIn: 0.5, insideFilmId: 'multiphaseFlowing', outsideFilmId: 'seawaterCurrent',
      coatings: [{ materialId: 'syntacticPP', thicknessIn: 1.5 }],
    });
    expect(insulated.uBtuHrFt2F).toBeLessThan(bare.uBtuHrFt2F / 10);
    // The engine attributes the stack by layer, so the claim can be
    // read off rather than asserted: the foam IS the insulation.
    const coat = insulated.resistances.find((r) => /polypropylene/i.test(r.label || ''));
    expect(coat.sharePct).toBeGreaterThan(85);
    const shares = insulated.resistances.reduce((a, r) => a + r.sharePct, 0);
    expect(shares).toBeCloseTo(100, 6);
  });

  it('burying a line adds resistance, and a line lying on the bottom adds none', () => {
    const lying = legU({ idIn: 6, wallIn: 0.5, coatings: [], insideFilmId: 'multiphaseFlowing', outsideFilmId: 'seawaterCurrent', burialFt: 7 / 24, soilId: 'soilWet' });
    const buried = legU({ idIn: 6, wallIn: 0.5, coatings: [], insideFilmId: 'multiphaseFlowing', outsideFilmId: 'seawaterCurrent', burialFt: 3, soilId: 'soilWet' });
    expect(buried.uBtuHrFt2F).toBeLessThan(lying.uBtuHrFt2F);
  });

  it('refuses a pipe with no wall rather than assuming one', () => {
    expect(buildLayers({ idIn: 6, wallIn: 0 }).ok).toBe(false);
  });

  it('a coating whose material does not resolve is REPORTED, never dropped', () => {
    // Dropping it silently removes the insulation from the stack, and
    // the line comes back cold with nothing to explain why. This is the
    // Suite half of the engine's no-silent-fallback lookup fix.
    const s = buildLayers({ idIn: 6, wallIn: 0.5, coatings: [{ materialId: 'aerogl', thicknessIn: 2 }] });
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/aerogl/);
    expect(s.error).toMatch(/cannot be left out of the stack silently/);
  });

  it('a film coefficient that does not resolve is refused, not defaulted', () => {
    const u = legU({ idIn: 6, wallIn: 0.5, coatings: [], insideFilmId: 'seawaterCurrent', outsideFilmId: 'nonsense' });
    expect(u.ok).toBe(false);
    expect(u.error).toMatch(/film coefficient/);
  });
});

describe('the choke step', () => {
  it('cools by the coefficient times the drop, and that is a large number on gas', () => {
    const c = chokeStep({ pUpPsia: 1400, pDownPsia: 400, tUpF: 150, jtCoeffFPerPsi: 0.05 });
    expect(c.dpPsi).toBe(1000);
    expect(c.coolingF).toBeCloseTo(50, 9);
    expect(c.tDownF).toBeCloseTo(100, 9);
  });

  it('refuses a downstream pressure above the wellhead', () => {
    const c = chokeStep({ pUpPsia: 400, pDownPsia: 900, tUpF: 150, jtCoeffFPerPsi: 0.05 });
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/Nothing flows/);
  });

  it('a zero coefficient is isothermal, which is a choice and not an accident', () => {
    const c = chokeStep({ pUpPsia: 1400, pDownPsia: 400, tUpF: 150, jtCoeffFPerPsi: 0 });
    expect(c.tDownF).toBe(150);
  });
});

describe('the coupled leg march', () => {
  const model = buildWellModel(oilWell());
  const common = {
    lengthFt: 26400, inclinationDeg: 90, idIn: 6, fluidModel: model.fluidModel,
    rates: { qo: 1200, wct: 0.2, gor: 600 },
    pInPsia: 400, tInF: 130, ambientTempF: 39,
    massRateLbHr: 2.2e4, cpBtuLbF: 0.6,
  };

  it('temperature falls toward ambient and never below it', () => {
    const r = marchLeg({ ...common, uBtuHrFt2F: 1.5 });
    expect(r.stations[0].tempF).toBeCloseTo(130, 9);
    expect(r.tOut).toBeLessThan(130);
    expect(r.tOut).toBeGreaterThan(39);
    const temps = r.stations.map((s) => s.tempF);
    temps.slice(1).forEach((t, i) => expect(t).toBeLessThan(temps[i]));
  });

  it('pressure falls along the flow direction on a horizontal line', () => {
    const r = marchLeg({ ...common, uBtuHrFt2F: 1.5 });
    expect(r.pOut).toBeLessThan(400);
    expect(r.dpPsi).toBeGreaterThan(0);
    const grav = r.stations[0].gradGrav;
    expect(Math.abs(grav)).toBeLessThan(1e-9); // horizontal: no head
  });

  it('a riser gives back its hydrostatic head, so the same length costs far more', () => {
    const flat = marchLeg({ ...common, lengthFt: 3000, uBtuHrFt2F: 1.5 });
    const up = marchLeg({ ...common, lengthFt: 3000, inclinationDeg: 0, uBtuHrFt2F: 1.5 });
    expect(up.dpPsi).toBeGreaterThan(flat.dpPsi);
    expect(up.stations[0].gradGrav).toBeGreaterThan(0);
  });

  it('better insulation lands the fluid hotter, which is the point of insulating', () => {
    const bare = marchLeg({ ...common, uBtuHrFt2F: 100 });
    const good = marchLeg({ ...common, uBtuHrFt2F: 0.5 });
    expect(good.tOut).toBeGreaterThan(bare.tOut + 15);
    expect(bare.tOut).toBeCloseTo(39, 0);
  });

  it('the march is COUPLED: the pressure drop responds to the temperature', () => {
    // Same hydraulics, different insulation. If the pressure march were
    // decoupled from the thermal one, these would be identical.
    const cold = marchLeg({ ...common, uBtuHrFt2F: 100 });
    const hot = marchLeg({ ...common, uBtuHrFt2F: 0.2 });
    expect(cold.dpPsi).not.toBeCloseTo(hot.dpPsi, 3);
  });

  it('reports a line that cannot carry the rate rather than returning nonsense', () => {
    const r = marchLeg({ ...common, idIn: 1, lengthFt: 100000, uBtuHrFt2F: 1.5 });
    expect(r.ok).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/atmospheric/);
  });

  it('the relaxation length and NTU say whether the line is thermally long', () => {
    const r = marchLeg({ ...common, uBtuHrFt2F: 1.5 });
    expect(r.relaxationLengthFt).toBeGreaterThan(0);
    expect(r.ntu).toBeCloseTo(26400 / r.relaxationLengthFt, 9);
  });
});

describe('scoring against the hydrate boundary', () => {
  it('finds the WORST station by subcooling, not by temperature', () => {
    // A cold low-pressure arrival that is safe, and a warmer
    // high-pressure spool that is not. Ranking by temperature picks the
    // wrong one, which is the failure this ranking exists to prevent.
    const trace = [
      { sFt: 0, pPsia: 2000, tempF: 60 },
      { sFt: 100, pPsia: 200, tempF: 45 },
    ];
    const s = scoreTrace({ trace, gasSg: 0.7 });
    expect(s.worst.sFt).toBe(0);
    expect(s.stations[0].subcoolingF).toBeGreaterThan(s.stations[1].subcoolingF);
  });

  it('names where the trace enters and leaves the hydrate region', () => {
    const trace = [
      { sFt: 0, pPsia: 1500, tempF: 120 },
      { sFt: 100, pPsia: 1400, tempF: 50 },
      { sFt: 200, pPsia: 1300, tempF: 45 },
      { sFt: 300, pPsia: 100, tempF: 42 },
    ];
    const s = scoreTrace({ trace, gasSg: 0.7 });
    expect(s.inHydrate).toBe(true);
    expect(s.entry.sFt).toBe(100);
    expect(s.exposedLengthFt).toBeGreaterThan(0);
  });

  it('says nothing about wax when no wax appearance temperature was measured', () => {
    const s = scoreTrace({ trace: [{ sFt: 0, pPsia: 500, tempF: 80 }], gasSg: 0.7 });
    expect(s.wax).toBeNull();
    expect(s.stations[0].belowWat).toBeNull();
  });

  it('flags wax when one WAS measured', () => {
    const s = scoreTrace({ trace: [{ sFt: 0, pPsia: 500, tempF: 80 }], gasSg: 0.7, watF: 95 });
    expect(s.wax.crosses).toBe(true);
    expect(s.wax.watF).toBe(95);
  });
});

describe('duty rates', () => {
  it('splits an oil duty into the three surface streams', () => {
    const r = dutyRates({ phase: 'oil', duty: { qoStbd: '1000', wctPct: '20', gor: '600' } });
    expect(r.qoStbd).toBe(1000);
    expect(r.qwStbd).toBeCloseTo(250, 9);
    expect(r.qgMscfd).toBeCloseTo(600, 9);
  });

  it('splits a gas duty by its ratios', () => {
    const r = dutyRates({ phase: 'gas', duty: { qgMscfd: '8000', wgr: '5', cgr: '20' } });
    expect(r.qwStbd).toBeCloseTo(40, 9);
    expect(r.qoStbd).toBeCloseTo(160, 9);
    expect(r.traverse.qgMscfd).toBe(8000);
  });

  it('refuses a hundred percent water cut rather than dividing by zero', () => {
    const r = dutyRates({ phase: 'oil', duty: { qoStbd: '1000', wctPct: '100' } });
    expect(r.ok).toBe(false);
  });
});

describe('the whole analysis', () => {
  it('runs one continuous trace from the perforations to the arrival', () => {
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.trace.length).toBeGreaterThan(50);
    expect(r.trace[0].leg).toBe('wellbore');
    expect(r.trace[0].sFt).toBe(0);
    expect(r.trace[r.trace.length - 1].leg).toBe('flowline');
    // Monotone in distance: the legs are joined, not concatenated at random.
    r.trace.slice(1).forEach((pt, i) => expect(pt.sFt).toBeGreaterThanOrEqual(r.trace[i].sFt));
  });

  it('the wellbore runs in the flow direction: hottest and deepest first', () => {
    const r = run();
    const wb = r.trace.filter((p) => p.leg === 'wellbore');
    expect(wb[0].mdFt).toBeCloseTo(8000, 6);
    expect(wb[wb.length - 1].mdFt).toBe(0);
    expect(wb[0].tempF).toBeGreaterThan(wb[wb.length - 1].tempF);
    expect(wb[0].pPsia).toBeGreaterThan(wb[wb.length - 1].pPsia);
    expect(r.wellbore.bhpPsia).toBeGreaterThan(r.wellbore.whpPsia);
  });

  it('the choke appears as a step at one distance, not smeared over a length', () => {
    const r = run();
    const wb = r.trace.filter((p) => p.leg === 'wellbore');
    const ck = r.trace.find((p) => p.leg === 'choke');
    expect(ck.sFt).toBe(wb[wb.length - 1].sFt);
    expect(ck.pPsia).toBe(400);
    expect(ck.tempF).toBeCloseTo(wb[wb.length - 1].tempF - 0.04 * (900 - 400), 6);
  });

  it('the flowline picks up exactly where the choke left off', () => {
    const r = run();
    const ck = r.trace.find((p) => p.leg === 'choke');
    const fl = r.trace.filter((p) => p.leg === 'flowline');
    expect(fl[0].pPsia).toBeLessThan(ck.pPsia);
    expect(fl[0].tempF).toBeLessThan(ck.tempF);
    expect(r.legs[0].stations[0].pPsia).toBe(400);
  });

  it('the hydrate check runs on every station, and names the worst one', () => {
    const r = run();
    expect(r.trace.every((p) => p.tHydF !== undefined)).toBe(true);
    expect(r.hydrate.worst).not.toBeNull();
    expect(Number.isFinite(r.hydrate.maxSubcoolingF)).toBe(true);
    expect(r.hydrate.basis).toMatch(/Motiee/);
    expect(r.hydrate.salinity).toMatch(/salt/i);
  });

  it('a cold long line goes into the hydrate region and the inhibitor design follows', () => {
    const r = run((f) => { f.flowline.coatings = []; });
    expect(r.hydrate.inHydrate).toBe(true);
    expect(r.inhibition.required).toBe(true);
    expect(r.inhibition.ok).toBe(true);
    expect(r.inhibition.weightPct).toBeGreaterThan(0);
    expect(r.inhibition.rate.rateBpd).toBeGreaterThan(0);
    // The safety margin is carried into the concentration, not bolted on after.
    expect(r.inhibition.neededDepressionF)
      .toBeCloseTo(r.hydrate.maxSubcoolingF + 5, 6);
  });

  it('a well-insulated short line needs no inhibitor, and says so as an answer', () => {
    const r = run((f) => {
      f.flowline.lengthFt = '3000';
      f.flowline.coatings = [{ materialId: 'aerogel', thicknessIn: '2' }];
      f.choke.jtCoeffFPerPsi = '0';
    });
    expect(r.hydrate.inHydrate).toBe(false);
    expect(r.inhibition.required).toBe(false);
    expect(r.inhibition.note).toMatch(/No inhibitor is needed/);
  });

  it('the wellbore temperature is the well record profile, so the two agree exactly', () => {
    const model = buildWellModel(oilWell());
    const r = run();
    const wb = r.trace.filter((p) => p.leg === 'wellbore');
    wb.forEach((pt) => expect(pt.tempF).toBeCloseTo(model.tAt(pt.tvdFt), 9));
  });

  it('reports a missing wellhead pressure rather than tracing from nothing', () => {
    const r = run((f) => { f.duty.whpPsia = ''; });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/wellhead pressure/i);
  });

  it('refuses when the well model is incomplete', () => {
    const r = runFlowAssurance({ form: baseForm(), model: null });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Well tab/);
  });

  it('a riser leg extends the trace and costs head', () => {
    const withRiser = run((f) => {
      f.riser = { ...f.flowline, enabled: true, lengthFt: '4000', ambientTempF: '45' };
    });
    const flat = run();
    expect(withRiser.legs).toHaveLength(2);
    const arrival = withRiser.arrival;
    expect(arrival.leg).toBe('riser');
    expect(arrival.pPsia).toBeLessThan(flat.arrival.pPsia);
  });

  it('an insulation target says what U it would take and whether the line has it', () => {
    const r = run((f) => { f.thermal.targetArrivalF = '110'; });
    expect(r.insulationTarget.ok).toBe(true);
    expect(r.insulationTarget.uBtuHrFt2F).toBeGreaterThan(0);
    expect(typeof r.insulationTarget.met).toBe('boolean');
  });

  it('an unreachable target is refused with the reason that applies', () => {
    const r = run((f) => { f.thermal.targetArrivalF = '30'; });
    expect(r.insulationTarget.ok).toBe(false);
    expect(r.insulationTarget.reason).toMatch(/cannot arrive above ambient/);
  });

  it('cooldown gives a no-touch time and counts the steel', () => {
    const r = run((f) => {
      f.cooldown = { enabled: true, targetTempF: '60', startTempF: '120' };
    });
    expect(r.cooldown.ok).toBe(true);
    expect(r.cooldown.hours).toBeGreaterThan(0);
    expect(r.cooldown.timeConstantHr).toBeGreaterThan(0);
    expect(r.cooldown.note).toMatch(/No-touch time/);
  });

  it('warns when a gas well is being choked isothermally', () => {
    const gas = defaultWellInputs();
    gas.well.phase = 'gas';
    gas.well.depthFt = '9000';
    gas.gasInflow.mode = 'aof';
    gas.gasInflow.aof = '30000';
    gas.inflow.pr = '4000';
    const model = buildWellModel(gas);
    const form = baseForm();
    form.duty = { qgMscfd: '8000', wgr: '5', cgr: '10', whpPsia: '1200' };
    form.choke = { pDownPsia: '500', jtCoeffFPerPsi: '0' };
    const r = runFlowAssurance({ form, model });
    expect(r.notes.join(' ')).toMatch(/Joule-Thomson coefficient is zero/);
  });
});

describe('the insulation sweep', () => {
  it('shows arrival temperature rising as U falls, and finds the break-even', () => {
    const form = baseForm();
    form.flowline.coatings = [];
    const model = buildWellModel(oilWell());
    const analysis = runFlowAssurance({ form, model });
    const s = insulationSweep({ analysis, form, model });
    expect(s.ok).toBe(true);
    const sorted = [...s.points].sort((a, b) => a.u - b.u);
    expect(sorted[0].arrivalTempF).toBeGreaterThan(sorted[sorted.length - 1].arrivalTempF);
    expect(sorted[0].subcoolingF).toBeLessThan(sorted[sorted.length - 1].subcoolingF);
  });
});
