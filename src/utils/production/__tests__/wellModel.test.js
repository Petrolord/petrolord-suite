/**
 * Production P6.5 gates: the shared per-well model.
 *
 * What is gated here is the thing the phase exists to guarantee -- that
 * ONE description of a well builds ONE nodal bundle, whichever studio
 * asked for it, and that the line between "the well" and "the duty a
 * design is run at" holds. If duty ever leaks into the record, two
 * studios sharing a well would start overwriting each other's design
 * conditions, which is worse than the duplication this replaced.
 */
import {
  WELL_MODEL_SCHEMA, WELL_MODEL_SECTIONS, defaultWellInputs, mergeWellInputs,
  wellInputsFrom, buildWellTrajectory, buildWellModel, wellModelProblems,
  toWellModelPayload, fromWellModelPayload, describeWellModel,
} from '../wellModel';

describe('the shape of a well description', () => {
  it('has exactly the sections that belong to a well', () => {
    const d = defaultWellInputs();
    expect(Object.keys(d).sort()).toEqual([...WELL_MODEL_SECTIONS].sort());
    // gasInflow arrived at P7: a well is an oil well or a gas well and
    // the two take different inflow relationships, but everything else
    // does not care what phase the well makes.
    expect(WELL_MODEL_SECTIONS)
      .toEqual(['well', 'fluid', 'inflow', 'gasInflow', 'completion']);
  });

  it('the extractor is driven by the section list, so a new section cannot be forgotten', () => {
    // It was written out by hand once, and adding gasInflow silently
    // stopped a gas well's deliverability coefficients from ever
    // reaching the spine.
    const studio = { ...defaultWellInputs(), duty: { designRateStbd: '400' } };
    WELL_MODEL_SECTIONS.forEach((s) => {
      expect(wellInputsFrom(studio)[s]).toEqual(studio[s]);
    });
  });

  it('carries the phase, and both inflows so switching does not lose one', () => {
    const d = defaultWellInputs();
    expect(d.well.phase).toBe('oil');
    expect(d.inflow.model).toBeDefined();
    expect(d.gasInflow.model).toBeDefined();
  });

  it('holds NO duty: not a rate, not a water cut, not a wellhead pressure', () => {
    // This is the whole discipline of the record. Water cut and wellhead
    // pressure look like well properties and are not -- they are what the
    // well was doing on the day -- so a design must be free to change
    // them without rewriting the field's shared record.
    const flat = JSON.stringify(defaultWellInputs());
    ['wctPct', 'whp', 'designRateStbd', 'spm', 'strokeIn', 'plungerDIn', 'hz']
      .forEach((k) => expect(flat).not.toContain(k));
  });

  it('merges a partial description onto the defaults without losing keys', () => {
    const merged = mergeWellInputs({ inflow: { pr: '3000' } });
    expect(merged.inflow.pr).toBe('3000');
    expect(merged.inflow.pb).toBe(defaultWellInputs().inflow.pb);
    expect(merged.completion).toEqual(defaultWellInputs().completion);
    expect(mergeWellInputs(null)).toEqual(defaultWellInputs());
  });

  it('pulls only the well sections out of a studio\'s inputs', () => {
    const studio = {
      ...defaultWellInputs(),
      duty: { designRateStbd: '400', wctPct: '70' },
      pump: { hz: '60' },
    };
    const pulled = wellInputsFrom(studio);
    expect(Object.keys(pulled).sort()).toEqual([...WELL_MODEL_SECTIONS].sort());
    expect(pulled).not.toHaveProperty('duty');
    expect(pulled).not.toHaveProperty('pump');
  });
});

describe('building the nodal bundle', () => {
  it('builds every piece a production studio needs', () => {
    const m = buildWellModel(defaultWellInputs());
    expect(m.trajectory.tvdMax).toBe(7000);
    expect(m.tvdMax).toBe(7000);
    expect(m.ipr.qmax).toBeGreaterThan(0);
    expect(typeof m.tAt).toBe('function');
    expect(m.fluidModel).toBeDefined();
  });

  it('the vlp is self-contained, so it can be spread into a traverse', () => {
    // The gas lift studio does exactly that. A vlp missing the fluid,
    // the trajectory or the temperature would build fine and then fail
    // at the traverse, which is the worst place to find out.
    const m = buildWellModel(defaultWellInputs());
    ['fluidModel', 'trajectory', 'tAt', 'idIn', 'roughnessIn', 'correlation', 'stepFt', 'nodeMd']
      .forEach((k) => expect(m.vlp[k]).toBeDefined());
  });

  it('the vlp carries no duty either', () => {
    const m = buildWellModel(defaultWellInputs());
    expect(m.vlp.whp).toBeUndefined();
    expect(m.vlp.rates).toBeUndefined();
  });

  it('temperature runs from the wellhead to the bottom of the well', () => {
    const m = buildWellModel(defaultWellInputs());
    expect(m.tAt(0)).toBeCloseTo(100, 6);
    expect(m.tAt(7000)).toBeCloseTo(170, 6);
  });

  it('reads a deviated survey, and measured depth exceeds true vertical', () => {
    const inputs = defaultWellInputs();
    inputs.well.mode = 'deviated';
    const m = buildWellModel(inputs);
    expect(m.vlp.nodeMd).toBeGreaterThan(m.tvdMax);
  });

  it('refuses rather than inventing a well', () => {
    const noDepth = defaultWellInputs();
    noDepth.well.depthFt = '';
    expect(buildWellModel(noDepth)).toBeNull();

    const noSurvey = defaultWellInputs();
    noSurvey.well.mode = 'deviated';
    noSurvey.well.surveyText = 'not a survey';
    expect(buildWellTrajectory(noSurvey.well)).toBeNull();
    expect(buildWellModel(noSurvey)).toBeNull();

    expect(buildWellModel(null)).toBeNull();
    expect(buildWellModel({})).toBeNull();
  });

  it('honours each IPR calibration route', () => {
    const byPi = buildWellModel(defaultWellInputs());
    expect(byPi.ipr.qmax).toBeGreaterThan(0);

    const byQmax = defaultWellInputs();
    byQmax.inflow.model = 'vogel';
    byQmax.inflow.calMode = 'qmax';
    byQmax.inflow.qmax = '900';
    expect(buildWellModel(byQmax).ipr.qmax).toBeCloseTo(900, 6);

    const byTest = defaultWellInputs();
    byTest.inflow.calMode = 'test';
    byTest.inflow.testQ = '800';
    byTest.inflow.testPwf = '2000';
    expect(buildWellModel(byTest).ipr.qmax).toBeGreaterThan(0);
  });

  it('REFUSES an inflow that never calibrated, instead of a page of NaN', () => {
    // Absolute open flow calibrates a Vogel inflow and only a Vogel
    // inflow. Asking for it on a composite model calibrated nothing, and
    // because every downstream rate guard compares against a NaN open
    // flow -- and NaN comparisons are false -- the design sailed past
    // its own checks and produced NaN everywhere. This was live in the
    // gas lift, ESP and rod pump studios until the shared model, and it
    // is the kind of thing consolidating them was for.
    const inputs = defaultWellInputs();
    inputs.inflow.model = 'composite';
    inputs.inflow.calMode = 'qmax';
    inputs.inflow.qmax = '900';
    expect(buildWellModel(inputs)).toBeNull();
    expect(wellModelProblems(inputs).join(' ')).toMatch(/calibrates a Vogel inflow/);

    const noPi = defaultWellInputs();
    noPi.inflow.pi = '';
    expect(buildWellModel(noPi)).toBeNull();
  });
});

describe('why a description will not build', () => {
  it('says what is missing, all of it at once', () => {
    const inputs = defaultWellInputs();
    inputs.well.depthFt = '';
    inputs.inflow.pr = '';
    const problems = wellModelProblems(inputs);
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(problems.join(' ')).toMatch(/depth/);
    expect(problems.join(' ')).toMatch(/reservoir pressure/);
  });

  it('names the calibration the inflow is actually using', () => {
    const test = defaultWellInputs();
    test.inflow.calMode = 'test';
    expect(wellModelProblems(test).join(' ')).toMatch(/production test/);
    const qmax = defaultWellInputs();
    qmax.inflow.calMode = 'qmax';
    qmax.inflow.qmax = '';
    expect(wellModelProblems(qmax).join(' ')).toMatch(/absolute open flow/);
  });

  it('a complete description has no problems', () => {
    expect(wellModelProblems(defaultWellInputs())).toEqual([]);
  });
});

describe('round-tripping through the spine', () => {
  it('a saved model comes back as the form it was typed in', () => {
    const inputs = defaultWellInputs();
    inputs.inflow.pr = '3150';
    inputs.completion.idIn = '2.992';
    const payload = toWellModelPayload(inputs);
    expect(payload.schema).toBe(WELL_MODEL_SCHEMA);
    const back = fromWellModelPayload(payload);
    expect(wellInputsFrom(back)).toEqual(wellInputsFrom(inputs));
    // and it builds the same well
    expect(buildWellModel(back).ipr.qmax).toBeCloseTo(buildWellModel(inputs).ipr.qmax, 9);
  });

  it('keeps the strings as typed rather than coercing them', () => {
    // Coercion here would make "2.4410" and "2.441" different models and
    // a half-typed field a change, and the dirty check compares these.
    const inputs = defaultWellInputs();
    inputs.completion.idIn = '2.4410';
    expect(toWellModelPayload(inputs).completion.idIn).toBe('2.4410');
  });

  it('an older payload missing a section still loads', () => {
    const back = fromWellModelPayload({ schema: 1, well: { depthFt: '4200' } });
    expect(back.well.depthFt).toBe('4200');
    expect(back.completion).toEqual(defaultWellInputs().completion);
    expect(back.inflow.model).toBe(defaultWellInputs().inflow.model);
  });

  it('a missing payload is null, not an empty well', () => {
    expect(fromWellModelPayload(null)).toBeNull();
    expect(fromWellModelPayload('nonsense')).toBeNull();
  });

  it('describes a well in one line for pickers', () => {
    const d = describeWellModel(defaultWellInputs());
    expect(d).toMatch(/7,000 ft/);
    expect(d).toMatch(/API/);
    expect(describeWellModel(null)).toBe('');
  });
});
