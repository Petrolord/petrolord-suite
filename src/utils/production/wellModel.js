/**
 * The shared per-well model (Production P6.5).
 *
 * ONE description of a well, used by every production studio that needs
 * one. Before this module the gas lift, ESP and rod pump studios each
 * carried their own copy of the same code and the same input sections,
 * which meant the same well could be described three different ways and
 * the nodal cross-check of well tests deferred at P3 had nothing to
 * check against.
 *
 * WHAT BELONGS HERE and what does not. This is the WELL, not a design:
 *
 *   here          trajectory, temperatures, fluid (PVT), inflow (IPR),
 *                 and the completion the tubing traverse runs in
 *   not here      the duty a design was run at -- rate, water cut,
 *                 wellhead pressure, injection gas, plunger size, rod
 *                 taper, stroke. Those belong to the design, and two
 *                 designs against one well should be free to differ.
 *
 * The line matters because it is what makes the record shareable. Water
 * cut and wellhead pressure look like well properties and are not: they
 * are what the well was doing on the day, and a design is entitled to
 * ask what happens at a different one.
 *
 * The completion block is OPTIONAL for consumers. A rod pump lifts a
 * liquid column and never runs a multiphase traverse, so it ignores
 * the completion entirely; gas lift and ESP need it. It is stored on
 * the well because tubing is a property of the well, not of a design.
 *
 * Inputs stay as STRINGS, the way the studio forms hold them, so a
 * model round-trips into the form it came from without a coercion
 * changing what the user typed.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { computeIpr } from '../nodal/ipr.js';
import { darcyGasIpr, backPressureIpr, litIpr } from '../nodal/iprGas.js';
import { buildFluidModel } from '../nodal/pvt.js';
import { buildTrajectory } from '../nodal/trajectory.js';
import { linearGeothermal } from '../nodal/temperature.js';
import { num } from '../nodal/numerics.js';

export const WELL_MODEL_SCHEMA = 1;

/**
 * The sections a well model is made of.
 *
 * `gasInflow` arrived with P7. A well is an oil well or a gas well, and
 * the two are described by different inflow relationships: an oil well
 * by a productivity index or Vogel, a gas well by Rawlins-Schellhardt,
 * Houpeurt or a pseudo-pressure deliverability. The record carries
 * `well.phase` to say which, and both sections so a well can be
 * re-described without losing what was already entered. Everything
 * else -- trajectory, temperatures, fluid, completion -- is shared,
 * because those do not care what phase the well makes.
 */
export const WELL_MODEL_SECTIONS = ['well', 'fluid', 'inflow', 'gasInflow', 'completion'];

/** Reservoir pressure, gas gravity and bottomhole temperature are the
 * well's, not the inflow model's, so the gas IPR reads them from the
 * sections that already hold them rather than asking twice. */
export const WELL_PHASES = ['oil', 'gas'];

/**
 * Default well description. Studios override the numbers for the kind
 * of well they usually see; the SHAPE is fixed here so a model saved
 * from one studio loads into another.
 */
export const defaultWellInputs = () => ({
  well: {
    phase: 'oil',
    mode: 'vertical',
    depthFt: '7000',
    surveyText: '0, 0, 0\n2000, 0, 0\n3000, 30, 45\n8000, 30, 45',
    whtF: '100',
    bhtF: '170',
  },
  fluid: {
    api: '32',
    gasSg: '0.75',
    gor: '150',
    salinityPpm: '30000',
  },
  inflow: {
    model: 'composite',
    pr: '2600',
    pb: '1800',
    calMode: 'pi',
    pi: '2.5',
    qmax: '1200',
    testQ: '',
    testPwf: '',
  },
  gasInflow: {
    model: 'backPressure',
    c: '0.01',
    n: '0.85',
    a: '',
    b: '',
    k: '5',
    h: '40',
    re: '1500',
    rw: '0.35',
    skin: '0',
    dNonDarcy: '0',
  },
  completion: {
    idIn: '2.441',
    casingIdIn: '6.276',
    roughnessIn: '0.0006',
    correlation: 'beggsBrill',
    stepFt: '100',
  },
});

/**
 * Merge a partial well description onto the defaults, section by
 * section. Used both by studio payload restore and by the spine load,
 * so a model written by an older build never loses a key.
 */
export const mergeWellInputs = (raw, base = defaultWellInputs()) => {
  const out = { ...base };
  WELL_MODEL_SECTIONS.forEach((s) => {
    out[s] = { ...base[s], ...((raw && raw[s]) || {}) };
  });
  return out;
};

/**
 * Pull just the well-model sections out of a studio's inputs.
 *
 * Driven by WELL_MODEL_SECTIONS rather than written out, so a section
 * added to the record cannot be forgotten here. It was written out
 * once, and adding `gasInflow` at P7 silently stopped a gas well's
 * deliverability coefficients from ever reaching the spine.
 */
export const wellInputsFrom = (inputs) => {
  const out = {};
  WELL_MODEL_SECTIONS.forEach((s) => { out[s] = { ...(inputs?.[s] || {}) }; });
  return out;
};

/**
 * The trajectory a studio's well section describes.
 * A survey line that cannot be read is dropped rather than guessed at,
 * and a model with no usable depth returns null rather than a default
 * well nobody asked for.
 */
export const buildWellTrajectory = (well) => {
  const depthFt = num(well.depthFt, NaN);
  if (well.mode === 'deviated') {
    const survey = String(well.surveyText || '').split('\n').map((line) => {
      const [md, inc, azi] = line.split(',').map((v) => parseFloat(v));
      return { md, inc, azi };
    }).filter((s) => Number.isFinite(s.md) && Number.isFinite(s.inc));
    if (!survey.length) return null;
    return buildTrajectory({ mode: 'deviated', survey });
  }
  if (!(depthFt > 0)) return null;
  return buildTrajectory({ mode: 'vertical', depthFt });
};

/**
 * The nodal bundle every production studio runs on.
 *
 * returns { trajectory, tvdMax, fluidModel, tAt, ipr, vlp } or null
 * when the description is not complete enough to build one.
 *
 * `vlp` is SELF-CONTAINED on purpose: it carries the fluid, the
 * trajectory and the temperature alongside the completion, so a
 * consumer can spread it straight into a traverse call. A consumer that
 * never marches a traverse (a rod pump lifts a liquid column) simply
 * ignores it. What vlp does NOT carry is the duty — wellhead pressure,
 * water cut, rate — because those belong to a design, not to the well.
 */
export const buildWellModel = (inputs) => {
  if (!inputs?.well) return null;
  const trajectory = buildWellTrajectory(inputs.well);
  if (!trajectory) return null;
  const tvdMax = trajectory.tvdMax || num(inputs.well.depthFt, 0);
  if (!(tvdMax > 0)) return null;

  const fluid = inputs.fluid || {};
  const completion = inputs.completion || {};
  const fluidModel = buildFluidModel({
    api: num(fluid.api, 32),
    gasSg: num(fluid.gasSg, 0.75),
    gor: num(fluid.gor, 150),
    salinityPpm: num(fluid.salinityPpm, 0),
  });
  const tAt = linearGeothermal({
    whtF: num(inputs.well.whtF, 100),
    bhtF: num(inputs.well.bhtF, 170),
    tvdMaxFt: tvdMax,
  });
  const phase = inputs.well.phase === 'gas' ? 'gas' : 'oil';
  if (phase === 'gas') {
    const gasIpr = buildGasIpr(inputs);
    if (!gasIpr || !(gasIpr.aof > 0)) return null;
    return {
      phase,
      trajectory,
      tvdMax,
      // The reservoir pressure the model was built at. It belongs to
      // the well, and the gas IPR results do not carry it, so a
      // consumer that wants to show a drawdown has nowhere else to get
      // it from.
      prPsia: num(inputs.inflow?.pr, NaN),
      fluidModel,
      tAt,
      ipr: null,
      gasIpr,
      vlp: buildVlp({ completion, fluidModel, trajectory, tAt, tvdMax }),
    };
  }

  const ipr = computeIpr({
    model: inputs.inflow?.model,
    pr: num(inputs.inflow?.pr, NaN),
    pb: num(inputs.inflow?.pb, 0),
    pi: inputs.inflow?.calMode === 'pi' ? num(inputs.inflow.pi, NaN) : undefined,
    qmax: inputs.inflow?.calMode === 'qmax' ? num(inputs.inflow.qmax, NaN) : undefined,
    testPoint: inputs.inflow?.calMode === 'test'
      ? { q: num(inputs.inflow.testQ, NaN), pwf: num(inputs.inflow.testPwf, NaN) }
      : null,
  });
  // An inflow that did not calibrate has an absolute open flow of NaN,
  // and every rate check downstream compares against it. NaN comparisons
  // are false, so the design would sail past its own guards and produce
  // a page of NaN. Refusing here turns that into the honest "the well
  // model is incomplete" every studio already reports.
  if (!(ipr.qmax > 0)) return null;

  return {
    phase,
    trajectory,
    tvdMax,
    prPsia: num(inputs.inflow?.pr, NaN),
    fluidModel,
    tAt,
    ipr,
    gasIpr: null,
    vlp: buildVlp({ completion, fluidModel, trajectory, tAt, tvdMax }),
  };
};

/** The completion half of the model, shared by both phases. */
const buildVlp = ({ completion, fluidModel, trajectory, tAt, tvdMax }) => ({
  // Self-contained: spreadable straight into a traverse call.
  fluidModel,
  trajectory,
  tAt,
  idIn: num(completion.idIn, 2.441),
  casingIdIn: num(completion.casingIdIn, NaN),
  roughnessIn: num(completion.roughnessIn, 0.0006),
  correlation: completion.correlation || 'beggsBrill',
  stepFt: num(completion.stepFt, 100),
  nodeMd: trajectory.mdMax || tvdMax,
});

/**
 * The gas inflow, by whichever route the record says.
 *
 * Reservoir pressure, gas gravity and bottomhole temperature come from
 * the sections that already hold them, so a well described once is
 * described once. All three routes are the validated nodal gas IPR.
 */
export const buildGasIpr = (inputs) => {
  const g = inputs.gasInflow || {};
  const pr = num(inputs.inflow?.pr, NaN);
  if (!(pr > 0)) return null;
  try {
    if (g.model === 'lit') {
      return litIpr({ pr, a: num(g.a, NaN), b: num(g.b, NaN) });
    }
    if (g.model === 'darcy') {
      return darcyGasIpr({
        pr,
        tempF: num(inputs.well?.bhtF, NaN),
        gasGravity: num(inputs.fluid?.gasSg, 0.65),
        k: num(g.k, NaN),
        h: num(g.h, NaN),
        re: num(g.re, NaN),
        rw: num(g.rw, NaN),
        skin: num(g.skin, 0),
        dNonDarcy: num(g.dNonDarcy, 0),
      });
    }
    return backPressureIpr({ pr, c: num(g.c, NaN), n: num(g.n, NaN) });
  } catch (e) {
    console.error(e);
    return null;
  }
};

/**
 * Whether a model is the phase a studio can work with.
 *
 * The lift studios design against an oil inflow and the gas-well studio
 * against a gas one. Now that a well record is shared, loading the
 * wrong phase into a studio is an ordinary thing to do by accident, and
 * a clear sentence beats a page of NaN.
 */
export const wellPhaseProblem = (model, wanted) => {
  if (!model) return null;
  if (model.phase === wanted) return null;
  return wanted === 'oil'
    ? 'This well is described as a gas well. This studio designs against an oil inflow; change the phase on the Well Model tab, or pick a different well.'
    : 'This well is described as an oil well. This studio works on a gas inflow; change the phase on the Well Model tab, or pick a different well.';
};

/**
 * Why a description will not build, in words a user can act on.
 * Returned as a list so every problem shows at once rather than one
 * per attempt.
 */
export const wellModelProblems = (inputs) => {
  const problems = [];
  if (!inputs?.well) return ['The well description is missing.'];
  if (inputs.well.mode === 'deviated') {
    const rows = String(inputs.well.surveyText || '').split('\n')
      .map((line) => line.split(',').map((v) => parseFloat(v)))
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!rows.length) problems.push('The deviation survey has no readable stations (measured depth, inclination, azimuth per line).');
  } else if (!(num(inputs.well.depthFt, NaN) > 0)) {
    problems.push('The well needs a depth.');
  }
  if (!(num(inputs.inflow?.pr, NaN) > 0)) problems.push('The inflow needs a reservoir pressure.');
  const cal = inputs.inflow?.calMode;
  if (cal === 'pi' && !(num(inputs.inflow.pi, NaN) > 0)) {
    problems.push('The inflow is calibrated on a productivity index, so it needs one.');
  }
  if (cal === 'qmax') {
    if (!(num(inputs.inflow.qmax, NaN) > 0)) {
      problems.push('The inflow is calibrated on absolute open flow, so it needs one.');
    }
    // Only Vogel is defined by its open flow alone. A straight-line PI
    // and the composite model are calibrated by a productivity index or
    // a test point, and handing them an open flow calibrates nothing --
    // which used to produce a silently uncalibrated inflow rather than
    // this sentence.
    if (inputs.inflow.model && inputs.inflow.model !== 'vogel') {
      problems.push('Absolute open flow calibrates a Vogel inflow. This one is not Vogel, so give it a productivity index or a production test instead.');
    }
  }
  if (cal === 'test' && !(num(inputs.inflow.testQ, NaN) > 0 && num(inputs.inflow.testPwf, NaN) > 0)) {
    problems.push('The inflow is calibrated on a production test, so it needs both a rate and a flowing bottomhole pressure.');
  }
  return problems;
};

/** Serialise a well description for the spine. */
export const toWellModelPayload = (inputs, extra = {}) => ({
  schema: WELL_MODEL_SCHEMA,
  ...extra,
  ...wellInputsFrom(inputs),
});

/**
 * Read a spine payload back into studio inputs.
 * Unknown or missing keys fall back to the defaults rather than
 * producing a half-built form.
 */
export const fromWellModelPayload = (payload, base) => {
  if (!payload || typeof payload !== 'object') return null;
  return mergeWellInputs(payload, base || defaultWellInputs());
};

/**
 * A one-line description of the well, for pickers and headers.
 */
export const describeWellModel = (inputs) => {
  const depth = num(inputs?.well?.depthFt, NaN);
  const pr = num(inputs?.inflow?.pr, NaN);
  const bits = [];
  if (Number.isFinite(depth) && depth > 0) bits.push(`${Math.round(depth).toLocaleString()} ft`);
  if (Number.isFinite(pr) && pr > 0) bits.push(`${Math.round(pr).toLocaleString()} psia`);
  if (inputs?.fluid?.api) bits.push(`${inputs.fluid.api} API`);
  return bits.join(', ');
};
